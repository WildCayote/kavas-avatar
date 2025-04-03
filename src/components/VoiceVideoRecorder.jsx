import { useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";

export const VoiceVideoRecorder = ({ onAudioReceived, isTalking }) => {
  const [micActive, setMicActive] = useState(false);
  const [isThinking, setThinking] = useState(false);
  const circleRef = useRef(null);
  const rippleRef = useRef(null);
  const audioBuffer = useRef([]);
  const ws = useRef(null);
  const isListening = useRef(false);
  const isTalkingRef = useRef(isTalking);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const vadRef = useRef(null);

  useEffect(() => {
    isTalkingRef.current = isTalking;
  }, [isTalking]);

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

    return new Blob(byteArrays, { type: contentType });
  };

  const handleAudioReceived = (audioBase64, lipsyncData) => {
    console.log("I am calling the audio handler");
    const audioBlob = base64ToBlob(audioBase64, "audio/wav");
    const audioUrl = URL.createObjectURL(audioBlob);
    onAudioReceived(audioUrl, lipsyncData);

    // stop listening
    isListening.current = false;
    setMicActive(false);
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
    }
  };

  useEffect(() => {
    let audioContext, analyser, microphone, dataArray, audioProcessor;
    let videoStream;

    const captureVideoFrame = () => {
      const context = canvasRef.current.getContext("2d");
      context.drawImage(videoRef.current, 0, 0, 640, 480);
      return canvasRef.current.toDataURL("image/jpeg").split(",")[1];
    };

    const setUpWs = () => {
      // Open WebSocket connection
      ws.current = new WebSocket("ws://localhost:8004/ws/media");

      ws.current.onopen = () => {
        console.log("WebSocket connection established");
      };

      ws.current.onmessage = (event) => {
        console.log("Is the avatar talking: ", isTalkingRef.current);
        if (isTalkingRef.current) {
          return;
        }
        console.log("Received response from server:", event.data);
        if (event.data == "thinking") {
          console.log("can not listen now");
        } else {
          const response = JSON.parse(event.data);
          if (response.audio && response.lipsync) {
            handleAudioReceived(response.audio, response.lipsync);
          }
        }
      };

      ws.current.onclose = () => {
        console.log("WebSocket connection closed");
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
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

    const startListening = async () => {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        // Ensure videoRef is not null
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

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
        isListening.current = true;

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

        // Set up video stream
        videoStream = stream;
      } catch (error) {
        console.error("Microphone or camera access denied:", error);
      }
    };

    const stopListening = () => {
      isListening.current = false;
      if (audioProcessor) {
        audioProcessor.disconnect();
      }
      if (audioContext) {
        audioContext.close();
      }
      setMicActive(false);
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
      }
    };

    const setupVad = async () => {
      vadRef.current = await MicVAD.new({
        onSpeechStart: () => {
          startListening();
          console.log("Speech start detected");
        },
        onSpeechEnd: (audio) => {
          console.log("Is talking in Voice Recorder: ", isTalkingRef.current);
          if (audioBuffer.current.length === 0 || isTalkingRef.current) return;
          const combinedAudio = combineAudioBuffers(audioBuffer.current);
          audioBuffer.current = [];

          const audioUint8 = new Uint8Array(combinedAudio.buffer);
          const audioBase64 = arrayBufferToBase64(audioUint8);
          // Capture the picture
          const videoBase64 = captureVideoFrame();

          console.log(audioBuffer);

          const payload = {
            audio: audioBase64,
            video: videoBase64,
          };

          ws.current.send(JSON.stringify(payload));
          console.log("Sent audio and video payload");
          stopListening();
        },
      });

      vadRef.current.start();
    };

    setUpWs();
    startListening();
    stopListening();
    setupVad();

    return () => {
      isListening.current = false;
      if (audioProcessor) {
        audioProcessor.disconnect();
      }
      if (audioContext) {
        audioContext.close();
      }
      setMicActive(false);
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
      }
      vadRef.current?.pause();
    };
  }, []);

  return (
    <div className="voice-visualizer">
      <div className="ripple" ref={rippleRef}></div>
      <div className="circle" ref={circleRef}></div>
      <video ref={videoRef} style={{ opacity: 0 }} autoPlay muted playsInline />
      <canvas
        ref={canvasRef}
        style={{ display: "none" }}
        width={640}
        height={480}
      />
    </div>
  );
};
