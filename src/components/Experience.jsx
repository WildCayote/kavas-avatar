import { OrbitControls } from "@react-three/drei";
import { Avatar } from "./Avatar";

export const Experience = () => {
  return (
    <>
      <OrbitControls />
      <group
        position-y={0.7}
        position-x={0}
        position-z={5.7}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <Avatar />
      </group>
      <ambientLight intensity={2.3} />
    </>
  );
};
