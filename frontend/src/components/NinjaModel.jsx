import React, { useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

const NinjaModel = forwardRef(({ color, ...props }, ref) => {
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
    playAction: (name) => {
      // Common animation names in Mixamo: 'Idle', 'Punch', 'Hit', etc.
      // We'll normalize names to match what the game sends
      const actionName = name.toLowerCase();
      
      let targetAction = actions[name] || actions[actionName];
      
      // Fallback: try to find an action that contains the name
      if (!targetAction) {
        const key = Object.keys(actions).find(k => k.toLowerCase().includes(actionName));
        if (key) targetAction = actions[key];
      }

      if (targetAction) {
        // If the animation is already running, don't restart it
        if (targetAction.isRunning() && (name === currentActionRef.current || actionName === currentActionRef.current.toLowerCase())) return;

        // Stop current animations smoothly
        Object.values(actions).forEach(action => {
          if (action.isRunning() && action !== targetAction) {
            action.fadeOut(0.2);
          }
        });
        
        currentActionRef.current = name;
        
        const isIdle = actionName.includes('idle');
        if (!isIdle) {
          targetAction.setLoop(THREE.LoopOnce);
          targetAction.clampWhenFinished = true;
        } else {
          targetAction.setLoop(THREE.LoopRepeat);
        }

        targetAction.reset().fadeIn(0.2).play();
      }
    }
  }));

  useEffect(() => {
    const handleFinished = (e) => {
      const finishedAction = e.action.getClip().name.toLowerCase();
      // If a non-idle animation finished, return to Idle
      if (!finishedAction.includes('idle')) {
        const idleKey = Object.keys(actions).find(k => k.toLowerCase().includes('idle'));
        if (idleKey && actions[idleKey]) {
          currentActionRef.current = 'Idle';
          e.action.fadeOut(0.5);
          actions[idleKey].reset().fadeIn(0.5).play();
        }
      }
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
