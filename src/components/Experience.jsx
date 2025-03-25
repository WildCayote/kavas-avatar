import { OrbitControls } from "@react-three/drei";
import { Avatar } from "./Avatar";

export const Experience = () => {
  return (
    <>
      <OrbitControls />
      <group position-y={-1.5} position-z={2} rotation={[Math.PI / 2, 0, 0]}>
        <Avatar />
      </group>
      <ambientLight intensity={2.3} />
    </>
  );
};
