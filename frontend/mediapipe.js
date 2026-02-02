import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9";

const DEFAULT_CONFIG = {
  wasmPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm",
  handModelPath: "https://storage.googleapis.com/mediapipe-assets/hand_landmarker.task",
  poseModelPath: "https://storage.googleapis.com/mediapipe-assets/pose_landmarker_lite.task",
  numHands: 2,
  numPoses: 1,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

const state = {
  running: false,
  handLandmarker: null,
  poseLandmarker: null,
  rafId: null,
  lastVideoTime: -1,
};

export async function startMediaPipe({ video, onResults, onStatus, config = {} }) {
  if (state.running) {
    return;
  }

  const settings = { ...DEFAULT_CONFIG, ...config };
  onStatus?.("Loading...", true);

  try {
    const vision = await FilesetResolver.forVisionTasks(settings.wasmPath);

    state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: settings.handModelPath },
      runningMode: "VIDEO",
      numHands: settings.numHands,
      minHandDetectionConfidence: settings.minHandDetectionConfidence,
      minHandPresenceConfidence: settings.minHandPresenceConfidence,
      minTrackingConfidence: settings.minTrackingConfidence,
    });

    state.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: settings.poseModelPath },
      runningMode: "VIDEO",
      numPoses: settings.numPoses,
      minPoseDetectionConfidence: settings.minPoseDetectionConfidence,
      minPosePresenceConfidence: settings.minPosePresenceConfidence,
      minTrackingConfidence: settings.minTrackingConfidence,
    });

    state.running = true;
    onStatus?.("Ready", true);
    runLoop(video, onResults);
  } catch (error) {
    onStatus?.("Failed", false);
    stopMediaPipe();
    throw error;
  }
}

export function stopMediaPipe() {
  state.running = false;

  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  if (state.handLandmarker?.close) {
    state.handLandmarker.close();
  }

  if (state.poseLandmarker?.close) {
    state.poseLandmarker.close();
  }

  state.handLandmarker = null;
  state.poseLandmarker = null;
  state.lastVideoTime = -1;
}

function runLoop(video, onResults) {
  const loop = () => {
    if (!state.running) {
      return;
    }

    if (video.readyState >= 2) {
      const now = performance.now();
      if (video.currentTime !== state.lastVideoTime) {
        state.lastVideoTime = video.currentTime;

        const hands = state.handLandmarker?.detectForVideo(video, now) ?? null;
        const pose = state.poseLandmarker?.detectForVideo(video, now) ?? null;
        onResults?.({ hands, pose, timestamp: now });
      }
    }

    state.rafId = requestAnimationFrame(loop);
  };

  state.rafId = requestAnimationFrame(loop);
}
