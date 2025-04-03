import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Experience } from "./components/Experience";
import { UI } from "./components/UI";

function App() {
  const [audioData, setAudioData] = useState({
    audioUrl: null,
    lipsyncData: null,
  });

  const handleAudioReceived = (audioUrl, lipsyncData) => {
    setAudioData({ audioUrl, lipsyncData });
  };

  return (
    <>
      <Canvas shadows>
        <color attach="background" args={["#ececec"]} />
        <Experience audioData={audioData} />
      </Canvas>
      <UI onAudioReceived={handleAudioReceived} />
    </>
  );
}

export default App;
