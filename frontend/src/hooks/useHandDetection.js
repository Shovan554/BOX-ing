import { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const useHandDetection = (videoRef) => {
  const [landmarker, setLandmarker] = useState(null);
  const [results, setResults]       = useState(null);
  const rafRef      = useRef();
  const lastTimeRef = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const lm = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      if (!cancelled) setLandmarker(lm);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!landmarker) return;
    const detect = () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.currentTime !== lastTimeRef.current) {
        lastTimeRef.current = video.currentTime;
        const r = landmarker.detectForVideo(video, performance.now());
        // Always update — null when no hands so stale data never persists
        setResults(
          r.landmarks?.length > 0
            ? { landmarks: r.landmarks, handedness: r.handedness, timestamp: performance.now() }
            : null
        );
      }
      rafRef.current = requestAnimationFrame(detect);
    };
    rafRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [landmarker, videoRef]);

  return results;
};
