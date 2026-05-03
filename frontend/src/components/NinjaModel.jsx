import React, { useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

const NinjaModel = forwardRef(({ color, onActionFinish, ...props }, ref) => {
  const group = useRef();
  const currentActionRef = useRef('Idle');
  const { scene, animations } = useGLTF('/assets/models/ninja/ninja.glb');
  
  // Clone the scene for multiple instances
  const clone = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene);
    // Apply custom color to materials if provided
    if (color) {
      cloned.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.emissive = new THREE.Color(color);
          child.material.emissiveIntensity = 0.5;
        }
      });
    }
    return cloned;
  }, [scene, color]);
  const { actions, mixer } = useAnimations(animations, group);

  useImperativeHandle(ref, () => ({
    isBusy: () => !currentActionRef.current.toLowerCase().includes('idle'),
    playAction: (name, loop = false) => {
      const actionName = name.toLowerCase();
      const currentLower = currentActionRef.current.toLowerCase();

      const isCombat = (n) =>
        (n.includes('hit') && !n.includes('got_hit')) || n.includes('block');
      const incomingIsCombat = isCombat(actionName);
      const currentIsCombat = isCombat(currentLower);
      const incomingIsOverride = actionName.includes('got_hit') || actionName.includes('defeat');

      // Block re-entry only when current is a non-idle, non-combat action (e.g. bow)
      // and the incoming action isn't an override or another combat move.
      if (
        !currentLower.includes('idle') &&
        !actionName.includes('idle') &&
        !incomingIsOverride &&
        !(incomingIsCombat && currentIsCombat)
      ) {
        return false;
      }

      let targetAction = actions[name] || actions[actionName];

      // Fallback: try to find an action that contains the name
      if (!targetAction) {
        const key = Object.keys(actions).find(k => k.toLowerCase().includes(actionName));
        if (key) targetAction = actions[key];
      }

      if (targetAction) {
        // If the same non-combat animation is already running, don't restart it.
        // Combat moves (jab/block combos) should always restart so rapid hits
        // are visible even when the previous clip hasn't finished yet.
        if (
          !incomingIsCombat &&
          targetAction.isRunning() &&
          (name === currentActionRef.current || actionName === currentLower)
        ) {
          return true;
        }

        const isBow = actionName.includes('bow');
        // Combat interruptions use a tight crossfade so combos feel snappy
        // without snapping mid-frame.
        const fadeInTime = isBow ? 0.35 : incomingIsCombat ? 0.1 : 0.2;
        const fadeOutTime = isBow ? 0.35 : incomingIsCombat ? 0.1 : 0.2;

        // Stop current animations smoothly
        Object.values(actions).forEach(action => {
          if (action.isRunning() && action !== targetAction) {
            action.fadeOut(fadeOutTime);
          }
        });

        currentActionRef.current = name;

        const isIdle = actionName.includes('idle');
        const shouldLoop = isIdle || loop;

        if (!shouldLoop) {
          targetAction.setLoop(THREE.LoopOnce);
          // Bow's last frame is a deep bow pose; clamping then crossfading to
          // idle's standing first frame causes a visible "melt up". Don't clamp
          // bow — let it land on the natural last frame and crossfade.
          targetAction.clampWhenFinished = !isBow;
        } else {
          targetAction.setLoop(THREE.LoopRepeat);
        }

        targetAction.reset().fadeIn(fadeInTime).play();
        return true;
      }
      return false;
    }
  }));

  useEffect(() => {
    const handleFinished = (e) => {
      const finishedAction = e.action.getClip().name.toLowerCase();
      if (finishedAction.includes('idle')) return;

      // If this finished action was already superseded by another move
      // (e.g. a combo interrupted it), don't yank the model back to idle —
      // that would cancel the action that's now playing.
      const isStale = finishedAction !== currentActionRef.current.toLowerCase();
      if (isStale) {
        if (onActionFinish) onActionFinish(finishedAction);
        return;
      }

      const idleKey = Object.keys(actions).find(k => k.toLowerCase().includes('idle'));
      if (idleKey && actions[idleKey]) {
        currentActionRef.current = 'Idle';
        // Bow needs a longer crossfade so the model rises smoothly instead
        // of snapping from the bowed pose to the standing idle.
        const isBow = finishedAction.includes('bow');
        const fade = isBow ? 0.9 : 0.5;
        e.action.fadeOut(fade);
        actions[idleKey].reset().fadeIn(fade).play();
      }
      if (onActionFinish) onActionFinish(finishedAction);
    };

    mixer.addEventListener('finished', handleFinished);
    return () => mixer.removeEventListener('finished', handleFinished);
  }, [actions, mixer]);

  useEffect(() => {
    // Initial Idle
    const idleKey = Object.keys(actions).find(k => k.toLowerCase().includes('idle'));
    if (idleKey && actions[idleKey]) {
      actions[idleKey].reset().fadeIn(0.5).play();
    }
  }, [actions]);

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={clone} />
    </group>
  );
});

useGLTF.preload('/assets/models/ninja/ninja.glb');

export default NinjaModel;
