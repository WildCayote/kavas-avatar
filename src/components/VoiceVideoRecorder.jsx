import { useEffect, useRef, useState } from "react";

export const VoiceVideoRecorder = () => {
  const [micActive, setMicActive] = useState(false);
  const barsRef = useRef([]);

  useEffect(() => {
    let audioContext, analyser, microphone, dataArray;
    const numBars = 30; // Number of bars

    const startListening = async () => {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        microphone = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        microphone.connect(analyser);

        setMicActive(true);

        const animate = () => {
          analyser.getByteFrequencyData(dataArray);
          barsRef.current.forEach((bar, i) => {
            if (bar) {
              const height = (dataArray[i] / 255) * 100; // Normalize height
              bar.style.height = `${height}%`;
            }
          });

          requestAnimationFrame(animate);
        };

        animate();
      } catch (error) {
        console.error("Microphone access denied:", error);
      }
    };

    startListening();

    return () => {
      if (audioContext) {
        audioContext.close();
      }
    };
  }, []);

  return (
    <div className="voice-visualizer">
      <div className="bars">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="bar"
            ref={(el) => (barsRef.current[i] = el)}
          ></div>
        ))}
      </div>
    </div>
  );
};
