import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

// FIX: switched from pose_landmarker_lite to pose_landmarker_full.
// The lite model trades accuracy for speed — it struggles with fast arm
// movement and produces noisy Z values, both critical for boxing detection.
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

export const usePoseDetection = (videoRef) => {
  const [poseLandmarker, setPoseLandmarker] = useState(null);
  const [results, setResults] = useState(null);
  const requestRef = useRef();
  const lastVideoTimeRef = useRef(-1);

  useEffect(() => {
    const initPose = async () => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: POSE_MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      setPoseLandmarker(landmarker);
    };
    initPose();
  }, []);

  useEffect(() => {
    const detect = () => {
      if (poseLandmarker && videoRef.current && videoRef.current.readyState >= 2) {
        const startTimeMs = performance.now();
        if (lastVideoTimeRef.current !== videoRef.current.currentTime) {
          lastVideoTimeRef.current = videoRef.current.currentTime;
          const result = poseLandmarker.detectForVideo(videoRef.current, startTimeMs);
          if (result.landmarks && result.landmarks.length > 0) {
            setResults({
              points: result.landmarks[0],
              timestamp: startTimeMs
            });
          }
        }
      }
      requestRef.current = requestAnimationFrame(detect);
    };

    requestRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(requestRef.current);
  }, [poseLandmarker, videoRef]);

  return results;
};
