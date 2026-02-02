import { startMediaPipe, stopMediaPipe } from "./mediapipe.js";

const elements = {
  backendStatus: document.getElementById("backendStatus"),
  mediapipeStatus: document.getElementById("mediapipeStatus"),
  sessionStatus: document.getElementById("sessionStatus"),
  startCam: document.getElementById("startCam"),
  stopCam: document.getElementById("stopCam"),
  startMatch: document.getElementById("startMatch"),
  joinMatch: document.getElementById("joinMatch"),
  submitScore: document.getElementById("submitScore"),
  jabButton: document.getElementById("jabButton"),
  blockButton: document.getElementById("blockButton"),
  refreshLeaderboard: document.getElementById("refreshLeaderboard"),
  playerName: document.getElementById("playerName"),
  roomCode: document.getElementById("roomCode"),
  apiBase: document.getElementById("apiBase"),
  points: document.getElementById("points"),
  lastAction: document.getElementById("lastAction"),
  velocity: document.getElementById("velocity"),
  eventLog: document.getElementById("eventLog"),
  leaderboard: document.getElementById("leaderboard"),
  localVideo: document.getElementById("localVideo"),
  overlay: document.getElementById("overlay"),
};

const defaultApiBase =
  new URLSearchParams(window.location.search).get("api") || "http://localhost:8000";

elements.apiBase.value = defaultApiBase;

let cameraStream = null;
let sessionId = null;
let overlayFrame = null;
let mediapipeActive = false;

const latestResults = {
  hands: null,
  pose: null,
};

function getApiBase() {
  return elements.apiBase.value.trim() || defaultApiBase;
}

function logEvent(message) {
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${message}`;
  const div = document.createElement("div");
  div.textContent = entry;
  elements.eventLog.prepend(div);
}

function setStatus(element, text, isOk = true) {
  element.textContent = text;
  element.style.color = isOk ? "#f8fafc" : "#fca5a5";
}

async function apiFetch(path, options = {}) {
  const base = getApiBase();
  const response = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }

  return response.json();
}

async function checkHealth() {
  try {
    const data = await apiFetch("/health");
    setStatus(elements.backendStatus, `Online (${data.status})`);
  } catch (error) {
    setStatus(elements.backendStatus, "Offline", false);
    logEvent("Backend offline. Start the API or update the URL.");
  }
}

async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: false,
    });
    elements.localVideo.srcObject = cameraStream;
    await elements.localVideo.play();
    resizeOverlay();
    startOverlayLoop();
    await startMediaPipePipeline();
    logEvent("Camera started.");
  } catch (error) {
    logEvent(`Camera error: ${error.message}`);
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  stopMediaPipe();
  mediapipeActive = false;
  latestResults.hands = null;
  latestResults.pose = null;
  setStatus(elements.mediapipeStatus, "Stopped", true);
  stopOverlayLoop();
  logEvent("Camera stopped.");
}

function resizeOverlay() {
  const { videoWidth, videoHeight } = elements.localVideo;
  if (videoWidth && videoHeight) {
    elements.overlay.width = videoWidth;
    elements.overlay.height = videoHeight;
  }
}

function startOverlayLoop() {
  const ctx = elements.overlay.getContext("2d");
  const draw = () => {
    const { width, height } = elements.overlay;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(249, 115, 22, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width * 0.5, height * 0.2);
    ctx.lineTo(width * 0.5, height * 0.8);
    ctx.moveTo(width * 0.3, height * 0.5);
    ctx.lineTo(width * 0.7, height * 0.5);
    ctx.stroke();

    renderLandmarks(ctx);

    overlayFrame = requestAnimationFrame(draw);
  };
  draw();
}

function stopOverlayLoop() {
  if (overlayFrame) {
    cancelAnimationFrame(overlayFrame);
    overlayFrame = null;
  }
}


async function startMediaPipePipeline() {
  if (mediapipeActive) {
    return;
  }

  const config = window.MEDIAPIPE_CONFIG || {};

  try {
    mediapipeActive = true;
    await startMediaPipe({
      video: elements.localVideo,
      config,
      onStatus: (text, ok) => setStatus(elements.mediapipeStatus, text, ok),
      onResults: (results) => {
        latestResults.hands = results.hands;
        latestResults.pose = results.pose;
      },
    });
  } catch (error) {
    mediapipeActive = false;
    logEvent(`MediaPipe error: ${error.message}`);
  }
}

function renderLandmarks(ctx) {
  const { width, height } = elements.overlay;
  if (!width || !height) {
    return;
  }

  const drawPoints = (landmarks, color, radius = 3) => {
    ctx.fillStyle = color;
    landmarks.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  if (latestResults.pose?.landmarks?.length) {
    latestResults.pose.landmarks.forEach((pose) => {
      drawPoints(pose, "rgba(148, 163, 184, 0.8)", 2);
    });
  }

  if (latestResults.hands?.landmarks?.length) {
    const colors = ["rgba(249, 115, 22, 0.9)", "rgba(14, 165, 233, 0.9)"];
    latestResults.hands.landmarks.forEach((hand, index) => {
      drawPoints(hand, colors[index % colors.length], 3);
    });
  }
}
async function startMatch(mode = "solo") {
  try {
    const payload = {
      player_name: elements.playerName.value.trim() || "Player",
      mode,
      room_code: elements.roomCode.value.trim() || null,
    };

    const data = await apiFetch("/session/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    sessionId = data.id;
    setStatus(elements.sessionStatus, `Active (${data.player_name})`);
    logEvent(`Session started: ${sessionId.slice(0, 8)}.`);
  } catch (error) {
    logEvent(`Could not start session: ${error.message}`);
  }
}

async function sendAction(actionType) {
  try {
    if (!sessionId) {
      await startMatch(elements.roomCode.value.trim() ? "room" : "solo");
    }

    if (!sessionId) {
      return;
    }

    const velocity = Math.round(Math.random() * 800);
    const payload = {
      session_id: sessionId,
      action_type: actionType,
      velocity,
    };

    const data = await apiFetch("/session/action", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    elements.points.textContent = data.total_points;
    elements.lastAction.textContent = actionType.toUpperCase();
    elements.velocity.textContent = velocity;
    logEvent(`${actionType} scored ${data.points} points.`);
  } catch (error) {
    logEvent(`Action failed: ${error.message}`);
  }
}

async function submitScore() {
  try {
    if (!sessionId) {
      logEvent("Start a session before submitting.");
      return;
    }

    const data = await apiFetch("/session/submit", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });

    logEvent(`Final score submitted: ${data.final_points}.`);
  } catch (error) {
    logEvent(`Submit failed: ${error.message}`);
  }
}

async function refreshLeaderboard() {
  try {
    const data = await apiFetch("/leaderboard");
    elements.leaderboard.innerHTML = "";

    if (!data.leaders.length) {
      const empty = document.createElement("li");
      empty.textContent = "No scores yet.";
      elements.leaderboard.appendChild(empty);
      return;
    }

    data.leaders.forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = `${entry.player_name} - ${entry.points}`;
      elements.leaderboard.appendChild(li);
    });
  } catch (error) {
    logEvent("Leaderboard unavailable.");
  }
}

window.addEventListener("resize", resizeOverlay);
elements.localVideo.addEventListener("loadedmetadata", resizeOverlay);

elements.startCam.addEventListener("click", startCamera);
elements.stopCam.addEventListener("click", stopCamera);

elements.startMatch.addEventListener("click", () => startMatch("solo"));
elements.joinMatch.addEventListener("click", () => startMatch("room"));

elements.jabButton.addEventListener("click", () => sendAction("jab"));
elements.blockButton.addEventListener("click", () => sendAction("block"));

elements.submitScore.addEventListener("click", submitScore);
elements.refreshLeaderboard.addEventListener("click", refreshLeaderboard);

checkHealth();
refreshLeaderboard();
