import { Canvas } from "@react-three/fiber";
import { Experience } from "./components/Experience";
import { TextureLoader } from "three";
import { useLoader } from "@react-three/fiber";
import { UI } from "./components/UI";

function App() {
  return (
    <>
      <Canvas shadows>
        <primitive attach="background" object={useLoader(TextureLoader, "/public/kavas-bg.png")} />
        <Experience />
      </Canvas>
      <UI />
    </>
  );
}

export default App;
