import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

export const usePoseDetection = (videoRef) => {
  const [landmarker, setLandmarker] = useState(null);
  const [results, setResults]       = useState(null);
  const rafRef      = useRef();
  const lastTimeRef = useRef(-1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const lm = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
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
        setResults(
          r.landmarks?.length > 0
            ? { points: r.landmarks[0], timestamp: performance.now() }
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
