import { useState, useEffect, useRef } from 'react';

// Landmark indices for MediaPipe Pose
const NOSE = 0;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;

export const useCombatGestures = (landmarks) => {
  const [gesture, setGesture] = useState(null);
  const cooldownRef = useRef(false);
  const lastGestureTimeRef = useRef(0);

  useEffect(() => {
    if (!landmarks || !landmarks.points || cooldownRef.current) return;

    const points = landmarks.points;
    const now = Date.now();
    
    // Check for "Bow" (Nose below shoulders)
    const shouldersY = (points[LEFT_SHOULDER].y + points[RIGHT_SHOULDER].y) / 2;
    if (points[NOSE].y > shouldersY + 0.1) {
      triggerGesture('Bow');
      return;
    }

    // Check for "Block" (Both wrists near nose/face)
    const leftDistToNose = Math.hypot(points[LEFT_WRIST].x - points[NOSE].x, points[LEFT_WRIST].y - points[NOSE].y);
    const rightDistToNose = Math.hypot(points[RIGHT_WRIST].x - points[NOSE].x, points[RIGHT_WRIST].y - points[NOSE].y);
    
    if (leftDistToNose < 0.15 && rightDistToNose < 0.15) {
      triggerGesture('Block');
      return;
    }

    // Check for "Right Hit" (Right wrist moves forward/across)
    // In mirror mode, right wrist is actually on the left of the screen (lower X)
    if (points[RIGHT_WRIST].x < points[NOSE].x - 0.25) {
      triggerGesture('Right_Hit');
      return;
    }

    // Check for "Left Hit" (Left wrist moves forward/across)
    if (points[LEFT_WRIST].x > points[NOSE].x + 0.25) {
      triggerGesture('Left_Hit');
      return;
    }

    // If nothing detected for a while, could be Idle
    if (now - lastGestureTimeRef.current > 500) {
      setGesture('Idle');
    }

  }, [landmarks]);

  const triggerGesture = (name) => {
    setGesture(name);
    lastGestureTimeRef.current = Date.now();
    
    // Simple cooldown for hits to prevent spam
    if (name.includes('Hit') || name === 'Bow') {
      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
      }, 800);
    }
  };

  return gesture;
};
