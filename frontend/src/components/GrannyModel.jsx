import React, { useRef, useEffect } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';

const GrannyModel = (props) => {
  const group = useRef();
  const { scene, animations } = useGLTF('/assets/models/granny/granny.glb');
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    // Look for idle animation
    const idleAction = actions['Idle'] || actions['idle'] || Object.values(actions)[0];
    if (idleAction) {
      idleAction.reset().fadeIn(0.5).play();
    }
  }, [actions]);

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={scene} />
    </group>
  );
};

useGLTF.preload('/assets/models/granny/granny.glb');

export default GrannyModel;
