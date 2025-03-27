import { useEffect, useRef, useState } from "react";

export const VoiceVideoRecorder = () => {
  const [micActive, setMicActive] = useState(false);
  const circleRef = useRef(null);
  const rippleRef = useRef(null);

  useEffect(() => {
    let audioContext, analyser, microphone, dataArray;

    const startListening = async () => {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        microphone = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 32;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        microphone.connect(analyser);

        setMicActive(true);

        const animate = () => {
          analyser.getByteFrequencyData(dataArray);
          const volume =
            dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

          if (circleRef.current) {
            const scale = 1 + volume / 300; // Adjust scaling based on volume
            circleRef.current.style.transform = `scale(${scale})`;
          }

          if (rippleRef.current) {
            const opacity = Math.min(0.5 + volume / 600, 1);
            rippleRef.current.style.opacity = opacity;
            rippleRef.current.style.transform = `scale(${1.5 + volume / 200})`;
          }

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
      <div className="ripple" ref={rippleRef}></div>
      <div className="circle" ref={circleRef}></div>
    </div>
  );
};
