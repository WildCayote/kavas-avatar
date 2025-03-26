import { Canvas, useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import { Experience } from "./components/Experience";

function Background() {
  const texture = useLoader(TextureLoader, "/kifiya.png");
  return <primitive attach="background" object={texture} />;
}

function App() {
  return (
    <Canvas shadows>
      <Background />
      <Experience />
    </Canvas>
  );
}

export default App;
