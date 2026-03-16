import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

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
