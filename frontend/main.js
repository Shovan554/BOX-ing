import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { initFooter } from './Footer.js';

initFooter('footer-container');

const API_BASE_URL = 'http://127.0.0.1:8000';
const MEDIAPIPE_BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const POSE_MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const POSE = {
    nose: 0,
    leftShoulder: 11,
    rightShoulder: 12,
    leftElbow: 13,
    rightElbow: 14,
    leftWrist: 15,
    rightWrist: 16,
};

const COMBAT_ANIMATIONS = {
    left_jab: './assets/models/granny/left_jab.fbx',
    right_jab: './assets/models/granny/right_jab.fbx',
    left_block: './assets/models/granny/left_block.fbx',
    right_block: './assets/models/granny/right_block.fbx',
};

const MOTION_CONFIG = {
    actionCooldownMs: 450,
    jabMinExtensionDelta: 0.16,
    jabMinSpeed: 0.9,
    jabMinExtension: 1.05,
    blockNoseDistanceMax: 0.9,
    blockShoulderYOffset: 0.12,
    blockMinRaiseSpeed: 0.45,
    landmarkVisibilityThreshold: 0.45,
};

const startBtn = document.getElementById('start-btn');
const homeScreen = document.getElementById('home-screen');
const menuScreen = document.getElementById('menu-screen');
const gameTitle = document.getElementById('game-title');
const gameContainer = document.getElementById('game-container');
const grannyContainer = document.getElementById('granny-container');

let grannyScene;
let grannyCamera;
let grannyRenderer;
let grannyModel;
let mixer;
let clock;

const idleActions = {
    left: null,
    right: null,
};
let activeIdleSide = 'right';
let currentAction = null;
let actionResetTimer = null;
const combatActions = {};

let motionPanel = null;
let cameraVideo = null;
let overlayCanvas = null;
let overlayCtx = null;
let trackingBtn = null;
let statusEl = null;

let poseLandmarker = null;
let poseLandmarkerInitPromise = null;
let cameraStream = null;
let trackingRaf = null;
let lastVideoTime = -1;
let isTracking = false;

let backendSessionId = null;
let backendSessionInitPromise = null;
let backendPoints = 0;
let detectedCount = 0;
let lastDetected = '-';

const sideStates = {
    left: createSideState(),
    right: createSideState(),
};

const fbxLoader = new FBXLoader();

function createSideState() {
    return {
        prevWrist: null,
        prevExtension: 0,
        prevTsMs: 0,
        lastActionTsMs: 0,
        wasInGuardZone: false,
    };
}

function resetMotionState() {
    sideStates.left = createSideState();
    sideStates.right = createSideState();
}

function updateStatus(message = '') {
    if (!statusEl) return;
    const lines = [
        `camera: ${isTracking ? 'on' : 'off'}`,
        `pose model: ${poseLandmarker ? 'ready' : 'not ready'}`,
        `session: ${backendSessionId || 'not started'}`,
        `points: ${backendPoints}`,
        `detected: ${detectedCount}`,
        `last: ${lastDetected}`,
    ];
    if (message) {
        lines.push(`info: ${message}`);
    }
    statusEl.textContent = lines.join('\n');
}

async function ensureBackendSession() {
    if (backendSessionId) return backendSessionId;
    if (backendSessionInitPromise) return backendSessionInitPromise;

    backendSessionInitPromise = fetch(`${API_BASE_URL}/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            player_name: 'CameraPlayer',
            mode: 'solo',
        }),
    })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`session/start failed (${response.status})`);
            }
            return response.json();
        })
        .then((data) => {
            backendSessionId = data.id;
            backendPoints = data.points || 0;
            updateStatus('Backend session started.');
            return backendSessionId;
        })
        .catch((error) => {
            updateStatus(`Backend offline: ${error.message}`);
            return null;
        })
        .finally(() => {
            backendSessionInitPromise = null;
        });

    return backendSessionInitPromise;
}

function sendActionToBackend(actionType, speedNorm) {
    if (!backendSessionId) return;

    const velocity = Math.max(0, Math.min(2000, Math.round(speedNorm * 1000)));
    fetch(`${API_BASE_URL}/session/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: backendSessionId,
            action_type: actionType,
            velocity,
        }),
    })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`session/action failed (${response.status})`);
            }
            return response.json();
        })
        .then((data) => {
            backendPoints = data.total_points ?? backendPoints;
            updateStatus(`Scored +${data.points} (${data.action_type}).`);
        })
        .catch((error) => {
            updateStatus(`Action send failed: ${error.message}`);
        });
}

function normalizeClipName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function findClipByAliases(clips, aliases) {
    if (!Array.isArray(clips) || clips.length === 0) return null;
    const normalizedAliases = aliases.map((alias) => normalizeClipName(alias));

    for (const clip of clips) {
        const clipName = normalizeClipName(clip.name);
        if (normalizedAliases.includes(clipName)) {
            return clip;
        }
    }

    for (const clip of clips) {
        const clipName = normalizeClipName(clip.name);
        if (normalizedAliases.some((alias) => clipName.includes(alias))) {
            return clip;
        }
    }

    return null;
}

function getIdleActionForSide(side) {
    if (side === 'left' && idleActions.left) return idleActions.left;
    if (side === 'right' && idleActions.right) return idleActions.right;
    return idleActions.right || idleActions.left || null;
}

function setIdleSideFromActionKey(actionKey) {
    if (actionKey.startsWith('left_')) {
        activeIdleSide = 'left';
    } else if (actionKey.startsWith('right_')) {
        activeIdleSide = 'right';
    }
}

function playIdleForActiveSide() {
    const nextIdle = getIdleActionForSide(activeIdleSide);
    if (!nextIdle) return;

    if (currentAction && currentAction !== nextIdle) {
        currentAction.fadeOut(0.1);
    }

    nextIdle.enabled = true;
    nextIdle.reset();
    nextIdle.setLoop(THREE.LoopRepeat, Infinity);
    nextIdle.fadeIn(0.1);
    nextIdle.play();
    currentAction = nextIdle;
}

function setupIdleActions(clips) {
    if (!mixer || !grannyModel || !Array.isArray(clips) || clips.length === 0) {
        return;
    }

    const rightIdleClip = findClipByAliases(clips, ['right idle', 'right_idle', 'idle_right']);
    const leftIdleClip = findClipByAliases(clips, ['left idle', 'left_idle', 'idle left', 'idle']);

    const fallbackClip = clips[0];
    const resolvedRight = rightIdleClip || leftIdleClip || fallbackClip;
    const resolvedLeft = leftIdleClip || rightIdleClip || fallbackClip;

    idleActions.right = mixer.clipAction(resolvedRight, grannyModel);
    idleActions.left = mixer.clipAction(resolvedLeft, grannyModel);

    idleActions.right.clampWhenFinished = false;
    idleActions.left.clampWhenFinished = false;

    activeIdleSide = idleActions.right ? 'right' : 'left';
    playIdleForActiveSide();

    updateStatus(`Idle clips: right=${resolvedRight.name || 'unknown'}, left=${resolvedLeft.name || 'unknown'}`);
}

function playCombatAnimation(actionKey) {
    const nextAction = combatActions[actionKey];
    if (!mixer || !nextAction) return;
    setIdleSideFromActionKey(actionKey);

    if (currentAction && currentAction !== nextAction) {
        currentAction.fadeOut(0.08);
    }

    nextAction.reset();
    nextAction.setLoop(THREE.LoopOnce, 1);
    nextAction.clampWhenFinished = true;
    nextAction.fadeIn(0.08);
    nextAction.play();
    currentAction = nextAction;

    if (actionResetTimer) {
        window.clearTimeout(actionResetTimer);
    }

    const durationMs = Math.max(300, nextAction.getClip().duration * 900);
    actionResetTimer = window.setTimeout(() => {
        nextAction.fadeOut(0.1);
        playIdleForActiveSide();
    }, durationMs);
}

function registerDetectedAction(side, actionType, speedNorm) {
    const actionKey = `${side}_${actionType}`;
    lastDetected = `${side} ${actionType}`;
    detectedCount += 1;
    playCombatAnimation(actionKey);
    sendActionToBackend(actionType, speedNorm);
    updateStatus(`Detected ${side.toUpperCase()} ${actionType.toUpperCase()}`);
}

function isLandmarkVisible(landmark) {
    if (!landmark) return false;
    const visibility = landmark.visibility ?? 1;
    return visibility >= MOTION_CONFIG.landmarkVisibilityThreshold;
}

function distance2D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function processSideMotion(side, landmarks, shoulderWidth, nose, nowMs) {
    const isLeft = side === 'left';
    const shoulder = landmarks[isLeft ? POSE.leftShoulder : POSE.rightShoulder];
    const elbow = landmarks[isLeft ? POSE.leftElbow : POSE.rightElbow];
    const wrist = landmarks[isLeft ? POSE.leftWrist : POSE.rightWrist];
    if (!isLandmarkVisible(shoulder) || !isLandmarkVisible(elbow) || !isLandmarkVisible(wrist)) {
        return;
    }

    const state = sideStates[side];
    const extension = distance2D(wrist, shoulder) / shoulderWidth;

    let speed = 0;
    let raiseSpeed = 0;
    let extensionDelta = 0;
    if (state.prevWrist && state.prevTsMs > 0) {
        const dt = (nowMs - state.prevTsMs) / 1000;
        if (dt > 0) {
            speed = distance2D(wrist, state.prevWrist) / dt;
            raiseSpeed = (state.prevWrist.y - wrist.y) / dt;
            extensionDelta = extension - state.prevExtension;
        }
    }

    const wristToNose = distance2D(wrist, nose) / shoulderWidth;
    const inGuardZone =
        wristToNose <= MOTION_CONFIG.blockNoseDistanceMax &&
        wrist.y <= shoulder.y + MOTION_CONFIG.blockShoulderYOffset;

    const cooldownPassed = nowMs - state.lastActionTsMs > MOTION_CONFIG.actionCooldownMs;
    if (cooldownPassed) {
        const jabDetected =
            extensionDelta >= MOTION_CONFIG.jabMinExtensionDelta &&
            speed >= MOTION_CONFIG.jabMinSpeed &&
            extension >= MOTION_CONFIG.jabMinExtension;

        const blockDetected =
            inGuardZone &&
            !state.wasInGuardZone &&
            raiseSpeed >= MOTION_CONFIG.blockMinRaiseSpeed;

        if (jabDetected) {
            registerDetectedAction(side, 'jab', speed);
            state.lastActionTsMs = nowMs;
        } else if (blockDetected) {
            registerDetectedAction(side, 'block', Math.max(speed, raiseSpeed));
            state.lastActionTsMs = nowMs;
        }
    }

    state.prevWrist = { x: wrist.x, y: wrist.y };
    state.prevExtension = extension;
    state.prevTsMs = nowMs;
    state.wasInGuardZone = inGuardZone;
}

function processLandmarks(landmarks, nowMs) {
    const leftShoulder = landmarks[POSE.leftShoulder];
    const rightShoulder = landmarks[POSE.rightShoulder];
    const nose = landmarks[POSE.nose];
    if (!isLandmarkVisible(leftShoulder) || !isLandmarkVisible(rightShoulder) || !isLandmarkVisible(nose)) {
        return;
    }

    const shoulderWidth = distance2D(leftShoulder, rightShoulder);
    if (!Number.isFinite(shoulderWidth) || shoulderWidth < 0.05) {
        return;
    }

    processSideMotion('left', landmarks, shoulderWidth, nose, nowMs);
    processSideMotion('right', landmarks, shoulderWidth, nose, nowMs);
}

function drawPoseOverlay(landmarks) {
    if (!overlayCtx || !cameraVideo) return;

    const width = overlayCanvas.width;
    const height = overlayCanvas.height;
    overlayCtx.clearRect(0, 0, width, height);

    overlayCtx.save();
    overlayCtx.scale(-1, 1);
    overlayCtx.drawImage(cameraVideo, -width, 0, width, height);
    overlayCtx.restore();

    if (!landmarks) return;

    const connections = [
        [POSE.leftShoulder, POSE.leftElbow],
        [POSE.leftElbow, POSE.leftWrist],
        [POSE.rightShoulder, POSE.rightElbow],
        [POSE.rightElbow, POSE.rightWrist],
        [POSE.leftShoulder, POSE.rightShoulder],
        [POSE.nose, POSE.leftShoulder],
        [POSE.nose, POSE.rightShoulder],
    ];

    overlayCtx.lineWidth = 2;
    overlayCtx.strokeStyle = '#16f2d1';
    for (const [aIdx, bIdx] of connections) {
        const a = landmarks[aIdx];
        const b = landmarks[bIdx];
        if (!isLandmarkVisible(a) || !isLandmarkVisible(b)) continue;
        overlayCtx.beginPath();
        overlayCtx.moveTo((1 - a.x) * width, a.y * height);
        overlayCtx.lineTo((1 - b.x) * width, b.y * height);
        overlayCtx.stroke();
    }

    const points = [
        [POSE.nose, '#ffd166'],
        [POSE.leftShoulder, '#ff6b6b'],
        [POSE.leftElbow, '#ff6b6b'],
        [POSE.leftWrist, '#ff6b6b'],
        [POSE.rightShoulder, '#5dade2'],
        [POSE.rightElbow, '#5dade2'],
        [POSE.rightWrist, '#5dade2'],
    ];

    for (const [idx, color] of points) {
        const lm = landmarks[idx];
        if (!isLandmarkVisible(lm)) continue;
        overlayCtx.fillStyle = color;
        overlayCtx.beginPath();
        overlayCtx.arc((1 - lm.x) * width, lm.y * height, 4, 0, Math.PI * 2);
        overlayCtx.fill();
    }
}

function syncOverlaySize() {
    if (!cameraVideo || !overlayCanvas) return;
    const width = cameraVideo.videoWidth || 320;
    const height = cameraVideo.videoHeight || 240;
    overlayCanvas.width = width;
    overlayCanvas.height = height;
}

async function ensurePoseLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    if (poseLandmarkerInitPromise) return poseLandmarkerInitPromise;

    poseLandmarkerInitPromise = (async () => {
        updateStatus('Loading pose model...');
        const vision = await import(/* @vite-ignore */ MEDIAPIPE_BUNDLE_URL);
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        poseLandmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
            baseOptions: { modelAssetPath: POSE_MODEL_URL },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
        updateStatus('Pose model ready.');
        return poseLandmarker;
    })()
        .catch((error) => {
            updateStatus(`Pose init failed: ${error.message}`);
            throw error;
        })
        .finally(() => {
            poseLandmarkerInitPromise = null;
        });

    return poseLandmarkerInitPromise;
}

function trackingLoop() {
    if (!isTracking || !cameraVideo || !poseLandmarker) return;

    if (cameraVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const nowMs = performance.now();
        if (cameraVideo.currentTime !== lastVideoTime) {
            lastVideoTime = cameraVideo.currentTime;
            const result = poseLandmarker.detectForVideo(cameraVideo, nowMs);
            const landmarks = result.landmarks && result.landmarks.length > 0 ? result.landmarks[0] : null;
            drawPoseOverlay(landmarks);
            if (landmarks) {
                processLandmarks(landmarks, nowMs);
            }
        }
    }

    trackingRaf = requestAnimationFrame(trackingLoop);
}

async function startMotionTracking() {
    if (isTracking) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStatus('Camera API unavailable in this browser.');
        return;
    }

    try {
        await ensurePoseLandmarker();
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 },
            },
            audio: false,
        });

        cameraVideo.srcObject = cameraStream;
        await cameraVideo.play();
        syncOverlaySize();
        resetMotionState();
        await ensureBackendSession();

        isTracking = true;
        lastVideoTime = -1;
        trackingBtn.textContent = 'Stop Camera Tracking';
        updateStatus('Camera tracking started.');
        trackingLoop();
    } catch (error) {
        stopMotionTracking(`Camera start failed: ${error.message}`);
    }
}

function stopMotionTracking(statusMessage = 'Camera tracking stopped.') {
    isTracking = false;
    if (trackingRaf) {
        cancelAnimationFrame(trackingRaf);
        trackingRaf = null;
    }

    if (cameraStream) {
        for (const track of cameraStream.getTracks()) {
            track.stop();
        }
        cameraStream = null;
    }

    if (cameraVideo) {
        cameraVideo.srcObject = null;
    }

    if (trackingBtn) {
        trackingBtn.textContent = 'Enable Camera Tracking';
    }
    updateStatus(statusMessage);
}

function createMotionPanel() {
    if (motionPanel) return;

    const menuContainer = menuScreen.querySelector('.menu-container');
    if (!menuContainer) return;

    motionPanel = document.createElement('section');
    motionPanel.id = 'motion-panel';
    motionPanel.style.cssText = [
        'position:absolute',
        'right:5vw',
        'top:50%',
        'transform:translateY(-50%)',
        'width:min(32vw, 360px)',
        'min-width:280px',
        'padding:14px',
        'border-radius:14px',
        'background:rgba(10,10,10,0.86)',
        'box-shadow:0 0 24px rgba(0,0,0,0.5)',
        'z-index:35',
        'color:#fff',
        'font-family:monospace',
    ].join(';');

    motionPanel.innerHTML = `
        <div style="font-size:14px;font-weight:700;letter-spacing:.4px;margin-bottom:10px;">
            Camera Motion Debug
        </div>
        <div style="position:relative;width:100%;aspect-ratio:4 / 3;border-radius:10px;overflow:hidden;background:#101010;">
            <video id="camera-video" autoplay muted playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);"></video>
            <canvas id="camera-overlay" width="320" height="240" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>
        </div>
        <button id="camera-tracking-btn" style="margin-top:10px;width:100%;padding:10px;border:none;border-radius:8px;background:#16f2d1;color:#042d29;font-weight:700;cursor:pointer;">
            Enable Camera Tracking
        </button>
        <pre id="motion-status" style="margin:10px 0 0;padding:8px;background:rgba(0,0,0,0.4);border-radius:8px;font-size:12px;line-height:1.3;white-space:pre-wrap;"></pre>
    `;

    menuContainer.appendChild(motionPanel);

    cameraVideo = motionPanel.querySelector('#camera-video');
    overlayCanvas = motionPanel.querySelector('#camera-overlay');
    overlayCtx = overlayCanvas.getContext('2d');
    trackingBtn = motionPanel.querySelector('#camera-tracking-btn');
    statusEl = motionPanel.querySelector('#motion-status');

    trackingBtn.addEventListener('click', () => {
        if (isTracking) {
            stopMotionTracking();
        } else {
            startMotionTracking();
        }
    });

    updateStatus('Panel ready.');
}

async function loadCombatClips() {
    if (!mixer || !grannyModel) return;

    const entries = Object.entries(COMBAT_ANIMATIONS);
    let loadedCount = 0;

    await Promise.all(
        entries.map(async ([key, path]) => {
            try {
                const clip = await new Promise((resolve, reject) => {
                    fbxLoader.load(
                        path,
                        (fbx) => resolve(fbx.animations && fbx.animations[0]),
                        undefined,
                        reject
                    );
                });
                if (!clip) return;
                const action = mixer.clipAction(clip, grannyModel);
                action.enabled = true;
                action.clampWhenFinished = true;
                action.setLoop(THREE.LoopOnce, 1);
                combatActions[key] = action;
                loadedCount += 1;
            } catch (error) {
                console.warn(`Failed to load animation ${key}:`, error);
            }
        })
    );

    updateStatus(`Loaded ${loadedCount}/${entries.length} combat clips.`);
}

function initGrannyModel() {
    grannyScene = new THREE.Scene();
    clock = new THREE.Clock();

    const aspect = grannyContainer.clientWidth / grannyContainer.clientHeight;
    grannyCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    grannyCamera.position.set(0, 1.1, 2.2);

    grannyRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    grannyRenderer.setSize(grannyContainer.clientWidth, grannyContainer.clientHeight);
    grannyRenderer.setPixelRatio(window.devicePixelRatio);
    grannyContainer.appendChild(grannyRenderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    grannyScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(2, 2, 5);
    grannyScene.add(directionalLight);

    const loader = new GLTFLoader();
    loader.load('./assets/models/granny/granny.glb', async (gltf) => {
        grannyModel = gltf.scene;
        grannyModel.position.set(0, 0, 0);
        grannyScene.add(grannyModel);

        const box = new THREE.Box3().setFromObject(grannyModel);
        grannyModel.position.y = -box.min.y;

        mixer = new THREE.AnimationMixer(grannyModel);
        setupIdleActions(gltf.animations || []);

        await loadCombatClips();
    });

    function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
        if (mixer) {
            mixer.update(delta);
        } else if (grannyModel) {
            grannyModel.rotation.y += 0.005;
        }
        grannyRenderer.render(grannyScene, grannyCamera);
    }
    animate();
}

function openMenu() {
    startBtn.classList.add('slide-out');
    gameTitle.classList.add('slide-up');

    setTimeout(() => {
        homeScreen.classList.add('hidden');
        menuScreen.classList.remove('hidden');

        requestAnimationFrame(() => {
            if (!grannyRenderer) {
                initGrannyModel();
            }
            createMotionPanel();
        });
    }, 500);
}

startBtn.addEventListener('click', openMenu);

window.addEventListener('mousemove', (e) => {
    if (gameContainer.innerHTML === '') {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
        const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
        document.body.style.backgroundPosition = `calc(50% + ${moveX}px) calc(50% + ${moveY}px)`;
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !homeScreen.classList.contains('hidden')) {
        openMenu();
    }
});

window.addEventListener('resize', () => {
    if (grannyRenderer && grannyContainer) {
        const width = grannyContainer.clientWidth;
        const height = grannyContainer.clientHeight;
        grannyCamera.aspect = width / height;
        grannyCamera.updateProjectionMatrix();
        grannyRenderer.setSize(width, height);
    }
    syncOverlaySize();
});
