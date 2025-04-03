import { useEffect, useRef, useState } from "react";

export const VoiceVideoRecorder = ({ onAudioReceived }) => {
  const [micActive, setMicActive] = useState(false);
  const circleRef = useRef(null);
  const rippleRef = useRef(null);
  const audioBuffer = useRef([]);
  const ws = useRef(null);

  useEffect(() => {
    let audioContext, analyser, microphone, dataArray, audioProcessor;

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

        // Set up audio processing
        audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
        microphone.connect(audioProcessor);
        audioProcessor.connect(audioContext.destination);

        audioProcessor.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);
          let buffer = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            let s = Math.max(-1, Math.min(1, inputData[i]));
            buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          audioBuffer.current.push(buffer);
        };

        setMicActive(true);

        const animate = () => {
          analyser.getByteFrequencyData(dataArray);
          const volume =
            dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

          if (circleRef.current) {
            const scale = 1 + volume / 300;
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

        // Open WebSocket connection
        ws.current = new WebSocket("ws://localhost:8004/ws/media");

        ws.current.onopen = () => {
          console.log("WebSocket connection established");
          setupSendInterval();
        };

        ws.current.onmessage = (event) => {
          console.log("Received response from server:", event.data);
          const response = JSON.parse(event.data);
          if (response.audio && response.lipsync) {
            handleAudioReceived(response.audio, response.lipsync);
          }
        };

        ws.current.onclose = () => {
          console.log("WebSocket connection closed");
        };

        ws.current.onerror = (error) => {
          console.error("WebSocket error:", error);
        };
      } catch (error) {
        console.error("Microphone access denied:", error);
      }
    };

    const setupSendInterval = () => {
      const sendInterval = setInterval(() => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

        if (audioBuffer.current.length === 0) return;
        const combinedAudio = combineAudioBuffers(audioBuffer.current);
        audioBuffer.current = [];

        const audioUint8 = new Uint8Array(combinedAudio.buffer);
        const audioBase64 = arrayBufferToBase64(audioUint8);

        const payload = {
          audio: audioBase64,
        };

        ws.current.send(JSON.stringify(payload));
        console.log("Sent audio payload");
      }, 5000);

      return () => clearInterval(sendInterval);
    };

    const combineAudioBuffers = (buffers) => {
      let totalLength = buffers.reduce((acc, curr) => acc + curr.length, 0);
      let result = new Int16Array(totalLength);
      let offset = 0;
      buffers.forEach((buf) => {
        result.set(buf, offset);
        offset += buf.length;
      });
      return result;
    };

    const arrayBufferToBase64 = (buffer) => {
      let binary = "";
      let bytes = new Uint8Array(buffer);
      let len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    };

    const handleAudioReceived = (audioBase64, lipsyncData) => {
      const audioBlob = base64ToBlob(audioBase64, "audio/wav");
      const audioUrl = URL.createObjectURL(audioBlob);
      onAudioReceived(audioUrl, lipsyncData);
      stopListening();
    };

    const base64ToBlob = (base64, contentType) => {
      const byteCharacters = atob(base64);
      const byteArrays = [];

      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);

        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }

        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }

      const blob = new Blob(byteArrays, { type: contentType });
      return blob;
    };

    const stopListening = () => {
      if (audioProcessor) {
        audioProcessor.disconnect();
      }
      if (audioContext) {
        audioContext.close();
      }
      if (ws.current) {
        ws.current.close();
      }
      setMicActive(false);
    };

    startListening();

    return () => {
      stopListening();
    };
  }, [onAudioReceived]);

  return (
    <div className="voice-visualizer">
      <div className="ripple" ref={rippleRef}></div>
      <div className="circle" ref={circleRef}></div>
    </div>
  );
};
