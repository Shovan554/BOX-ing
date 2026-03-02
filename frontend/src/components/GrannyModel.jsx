import React, { useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

const GrannyModel = forwardRef((props, ref) => {
  const group = useRef();
  const currentActionRef = useRef('Idle');
  const { scene, animations } = useGLTF('/assets/models/granny/granny.glb');
  
  // Clone the scene for multiple instances
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, mixer } = useAnimations(animations, group);

  useImperativeHandle(ref, () => ({
    playAction: (name) => {
      const isIdleAction = name === 'Idle' || name === 'right idle';
      const currentIsIdle = currentActionRef.current === 'Idle' || currentActionRef.current === 'right idle';
      
      // If we are currently playing a one-shot, ignore 'Idle' requests
      if (isIdleAction && !currentIsIdle) return;
      
      if (actions[name]) {
        // Don't restart if already playing the same thing
        if (actions[name].isRunning() && name === currentActionRef.current) return;

        // Stop current animations smoothly
        Object.values(actions).forEach(action => {
          if (action.isRunning() && action !== actions[name]) {
            action.fadeOut(0.2);
          }
        });
        
        const action = actions[name];
        currentActionRef.current = name;
        
        if (!isIdleAction) {
          action.setLoop(THREE.LoopOnce);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat);
        }

        action.reset().fadeIn(0.2).play();
      }
    }
  }));

  useEffect(() => {
    const handleFinished = (e) => {
      const finishedAction = e.action.getClip().name;
      // If a non-idle animation finished, return to Idle
      if (finishedAction !== 'Idle' && finishedAction !== 'right idle') {
        const idleAction = actions['Idle'] || actions['idle'];
        if (idleAction) {
          currentActionRef.current = 'Idle';
          e.action.fadeOut(0.5);
          idleAction.reset().fadeIn(0.5).play();
        }
      }
    };

    mixer.addEventListener('finished', handleFinished);
    return () => mixer.removeEventListener('finished', handleFinished);
  }, [actions, mixer]);

  useEffect(() => {
    // Initial Idle
    const idleAction = actions['Idle'] || actions['idle'] || Object.values(actions)[0];
    if (idleAction) {
      idleAction.reset().fadeIn(0.5).play();
    }
  }, [actions]);

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={clone} />
    </group>
  );
});

useGLTF.preload('/assets/models/granny/granny.glb');

export default GrannyModel;
