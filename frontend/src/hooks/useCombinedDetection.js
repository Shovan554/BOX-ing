import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const useCombinedDetection = (videoRef, onResults) => {
  const [landmarkers, setLandmarkers] = useState({ pose: null, hand: null });
  const requestRef = useRef();
  const lastVideoTimeRef = useRef(-1);

  useEffect(() => {
    const init = async () => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      
      const [pose, hand] = await Promise.all([
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        })
      ]);

      setLandmarkers({ pose, hand });
    };
    init();
  }, []);

  useEffect(() => {
    const detect = () => {
      if (landmarkers.pose && landmarkers.hand && videoRef.current && videoRef.current.readyState >= 2) {
        const video = videoRef.current;
        const startTimeMs = performance.now();

        if (lastVideoTimeRef.current !== video.currentTime) {
          lastVideoTimeRef.current = video.currentTime;

          const poseRes = landmarkers.pose.detectForVideo(video, startTimeMs);
          const handRes = landmarkers.hand.detectForVideo(video, startTimeMs);

          if (poseRes.landmarks && poseRes.landmarks.length > 0) {
            const data = {
              pose: {
                points: poseRes.landmarks[0],
                timestamp: startTimeMs
              },
              hand: (handRes.landmarks && handRes.landmarks.length > 0) ? {
                landmarks: handRes.landmarks,
                handedness: handRes.handedness,
                timestamp: startTimeMs
              } : null
            };
            
            // Debug logs
            if (window._DEBUG_DETECTION) {
              console.log('Detection results:', {
                poseDetected: true,
                handsDetected: !!data.hand,
                numHands: data.hand?.landmarks?.length || 0
              });
            }

            if (onResults) onResults(data);
          } else {
            if (window._DEBUG_DETECTION) console.log('Pose not detected');
          }
        }
      } else {
        if (window._DEBUG_DETECTION && !videoRef.current) console.log('Video ref null');
        else if (window._DEBUG_DETECTION && videoRef.current?.readyState < 2) console.log('Video not ready', videoRef.current?.readyState);
      }
      requestRef.current = requestAnimationFrame(detect);
    };

    requestRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(requestRef.current);
  }, [landmarkers, videoRef, onResults]);

  return !!landmarkers.pose;
};
