import { OrbitControls } from "@react-three/drei";
import { Avatar } from "./Avatar";

export const Experience = () => {
  return (
    <>
      <OrbitControls></OrbitControls>
      <group position-y={-1.445} position-z={1.7}>
        <Avatar />
      </group>
      <ambientLight intensity={2.3} />
    </>
  );
};
