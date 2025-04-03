import React, { useEffect, useRef, useState } from "react";
import { useFrame, useGraph, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";

const corresponding = {
  A: "viseme_PP",
  B: "viseme_kk",
  C: "viseme_I",
  D: "viseme_AA",
  E: "viseme_O",
  F: "viseme_U",
  G: "viseme_FF",
  H: "viseme_TH",
  X: "viseme_PP",
};

export function Avatar({
  audioUrl,
  lipsyncData,
  onFinishedTalking,
  isTalking,
}) {
  const group = useRef();
  const { scene } = useGLTF("models/avatar.glb");
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes, materials } = useGraph(clone);
  const { camera } = useThree();

  // Load animations
  const { animations } = useGLTF("animations/animations.glb");
  const { actions, mixer } = useAnimations(animations, group);

  // Store mouth cues and audio reference
  const [mouthCues, setMouthCues] = useState([]);
  const audioRef = useRef(null);
  const [animation, setAnimation] = useState("Standing");

  useEffect(() => {
    if (lipsyncData) {
      setMouthCues(lipsyncData.mouthCues);
    }
  }, [lipsyncData]);

  useEffect(() => {
    if (audioUrl && isTalking) {
      setAnimation("Talking");

      // Create and play new audio instance
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.play().catch((error) => console.error("Audio play failed:", error));
      audio.onended = () => {
        setAnimation("Standing");
        if (onFinishedTalking) {
          onFinishedTalking();
        }
      };
    }
  }, [audioUrl, isTalking, onFinishedTalking]);

  useEffect(() => {
    actions[animation]?.reset().fadeIn(0.5).play();
    group.current.position.set(0, -1.5, 2);
    return () => actions[animation]?.fadeOut(0.5);
  }, [animation]);

  const lerpMorphTarget = (target, value, speed = 0.1) => {
    clone.traverse((child) => {
      if (child.isSkinnedMesh && child.morphTargetDictionary) {
        const index = child.morphTargetDictionary[target];
        if (index === undefined) return;
        child.morphTargetInfluences[index] = THREE.MathUtils.lerp(
          child.morphTargetInfluences[index],
          value,
          speed
        );
      }
    });
  };

  useFrame(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      const currentTime = audio.currentTime;

      // Find the current viseme based on audio time
      const currentCue = mouthCues.find(
        (cue) => currentTime >= cue.start && currentTime <= cue.end
      );

      // Reset all morph targets to 0 before applying the current viseme
      clone.traverse((child) => {
        if (child.isSkinnedMesh && child.morphTargetDictionary) {
          Object.keys(child.morphTargetDictionary).forEach((target) => {
            const index = child.morphTargetDictionary[target];
            if (index !== undefined) {
              child.morphTargetInfluences[index] = THREE.MathUtils.lerp(
                child.morphTargetInfluences[index],
                0,
                0.1
              );
            }
          });
        }
      });

      // Apply the current viseme blendshape if one is found
      if (currentCue) {
        lerpMorphTarget(corresponding[currentCue.value], 1, 0.1);
      }
    }
  });

  return (
    <group ref={group} dispose={null}>
      <group rotation-x={-Math.PI / 2}>
        <primitive object={nodes.Hips} />
        <skinnedMesh
          name="Wolf3D_Avatar"
          geometry={nodes.Wolf3D_Avatar.geometry}
          material={materials.Wolf3D_Avatar}
          skeleton={nodes.Wolf3D_Avatar.skeleton}
          morphTargetDictionary={nodes.Wolf3D_Avatar.morphTargetDictionary}
          morphTargetInfluences={nodes.Wolf3D_Avatar.morphTargetInfluences}
        />
      </group>
    </group>
  );
}

useGLTF.preload("models/avatar.glb");
