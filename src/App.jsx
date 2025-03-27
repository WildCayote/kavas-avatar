import { Canvas } from "@react-three/fiber";
import { Experience } from "./components/Experience";
import { UI } from "./components/UI";

function App() {
  return (
    <>
      <Canvas shadows>
        <color attach="background" args={["#ececec"]} />
        <Experience />
      </Canvas>
      <UI />
    </>
  );
}

export default App;
