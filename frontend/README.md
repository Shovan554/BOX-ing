# BOX-ing Frontend (Placeholder)

Quick start:

1. Start the backend API (see ../backend/README.md).
2. Serve this folder over HTTP (camera access requires http:// or https://):

   python -m http.server 5173

3. Open http://localhost:5173 and allow camera access.

Notes:
- Update the API base URL input if the backend is on a different host/port.
- Use the Jab/Block buttons to generate placeholder scoring until pose detection is wired in.
- MediaPipe runs in the browser and loads WASM + model files from a CDN by default.
- Override MediaPipe paths via `window.MEDIAPIPE_CONFIG` in the dev console. Example:

```js
window.MEDIAPIPE_CONFIG = {
  wasmPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm",
  handModelPath: "/assets/hand_landmarker.task",
  poseModelPath: "/assets/pose_landmarker_lite.task",
};
```
