import { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const useHandDetection = (videoRef) => {
  const [handLandmarker, setHandLandmarker] = useState(null);
  const [results, setResults] = useState(null);
  const requestRef = useRef();
  const lastVideoTimeRef = useRef(-1);

  useEffect(() => {
    const initHand = async () => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      setHandLandmarker(landmarker);
    };
    initHand();
  }, []);

  const detect = () => {
    if (handLandmarker && videoRef.current && videoRef.current.readyState >= 2) {
      const startTimeMs = performance.now();
      if (lastVideoTimeRef.current !== videoRef.current.currentTime) {
        lastVideoTimeRef.current = videoRef.current.currentTime;
        const result = handLandmarker.detectForVideo(videoRef.current, startTimeMs);
        if (result.landmarks && result.landmarks.length > 0) {
          setResults({
            landmarks: result.landmarks,
            handedness: result.handedness,
            timestamp: startTimeMs
          });
        }
      }
    }
    requestRef.current = requestAnimationFrame(detect);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(requestRef.current);
  }, [handLandmarker]);

  return results;
};
