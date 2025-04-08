import { useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";

export const VoiceVideoRecorder = ({ onAudioReceived, isTalking }) => {
  const [micActive, setMicActive] = useState(false);
  const circleRef = useRef(null);
  const rippleRef = useRef(null);
  const ws = useRef(null);
  const ws_img = useRef(null);
  const isListening = useRef(false);
  const isTalkingRef = useRef(isTalking);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const vadRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const isWaitingForResponse = useRef(false);

  useEffect(() => {
    isTalkingRef.current = isTalking;
  }, [isTalking]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (
        ws_img.current?.readyState === WebSocket.OPEN &&
        videoRef.current &&
        canvasRef.current
      ) {

        const videoBase64 = captureVideoFrame();

        if (ws_img.current?.readyState === WebSocket.OPEN) {
          ws_img.current.send(
            JSON.stringify({
              video: videoBase64, // Send only video
            })
          );
          console.log("Sent video frame");
        }
      }
    }, 200); // 1000ms / 10 = 100ms (10 frames per second)

    return () => clearInterval(interval); // Clean up
  }, []);

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
    console.log("Audio handler called");
    const audioBlob = base64ToBlob(audioBase64, "audio/wav");
    const audioUrl = URL.createObjectURL(audioBlob);
    onAudioReceived(audioUrl, lipsyncData);
    isWaitingForResponse.current = false;
  };

  const getSupportedMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/wav",
      "", // Empty string will use browser default
    ];

    for (const type of types) {
      if (type === "" || MediaRecorder.isTypeSupported(type)) {
        console.log("Using MIME type:", type || "browser default");
        return type;
      }
    }
    return "";
  };

  const startRecording = () => {
    if (
      !mediaStreamRef.current ||
      isWaitingForResponse.current ||
      isTalkingRef.current
    ) {
      return;
    }

    try {
      // Get only the audio track for recording
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      const audioStream = new MediaStream([audioTrack]);

      const options = {
        audioBitsPerSecond: 128000,
      };

      const mimeType = getSupportedMimeType();
      if (mimeType) {
        options.mimeType = mimeType;
      }

      const mediaRecorder = new MediaRecorder(audioStream, options);
      const chunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (chunks.length === 0) return;

        try {
          // Convert to WAV
          const audioContext = new (window.AudioContext ||
            window.webkitAudioContext)();
          const blob = new Blob(chunks, {
            type: mediaRecorder.mimeType || "audio/webm",
          });
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

          // Create WAV file
          const wavBuffer = audioBufferToWav(audioBuffer);
          const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result.split(",")[1];
            const videoBase64 = captureVideoFrame();

            if (ws.current?.readyState === WebSocket.OPEN) {
              ws.current.send(
                JSON.stringify({
                  audio: base64Audio,
                  video: videoBase64,
                })
              );
              console.log("Sent audio and video payload");
              isWaitingForResponse.current = true;
            }
          };

          reader.readAsDataURL(wavBlob);
          audioContext.close();
        } catch (error) {
          console.error("Error processing audio:", error);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms for smooth recording
      setMicActive(true);
      isListening.current = true;
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };


  // Function to save image to file (optional)
  const saveImageToFile = (base64Data) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `captured_frame_${timestamp}.jpg`;

    // Convert base64 to blob
    const byteCharacters = atob(base64Data);
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

    const blob = new Blob(byteArrays, { type: 'image/jpeg' });

    // Create download link (alternative: send to server)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const initializeMediaStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 44100,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = videoStream;
      }
      return stream;
    } catch (error) {
      console.error("Failed to get media stream:", error);
      return null;
    }
  };

  // Function to convert AudioBuffer to WAV format
  const audioBufferToWav = (audioBuffer) => {
    const numOfChan = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numOfChan * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    const channels = [];
    let sample = 0;
    let offset = 0;
    let pos = 0;

    // Write WAV header
    setUint32(0x46464952); // "RIFF"
    setUint32(length + 36); // Length
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16); // Length of format chunk
    setUint16(1); // Format type (PCM)
    setUint16(numOfChan); // Number of channels
    setUint32(audioBuffer.sampleRate); // Sample rate
    setUint32(audioBuffer.sampleRate * 2 * numOfChan); // Byte rate
    setUint16(numOfChan * 2); // Block align
    setUint16(16); // Bits per sample
    setUint32(0x61746164); // "data"
    setUint32(length); // Data length

    // Write interleaved audio data
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    while (pos < audioBuffer.length) {
      for (let i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][pos]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(44 + offset, sample, true);
        offset += 2;
      }
      pos++;
    }

    return buffer;

    function setUint16(data) {
      view.setUint16(pos, data, true);
      pos += 2;
    }

    function setUint32(data) {
      view.setUint32(pos, data, true);
      pos += 4;
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      setMicActive(false);
      isListening.current = false;
    }
  };

  const captureVideoFrame = () => {
    const context = canvasRef.current.getContext("2d");
    context.drawImage(videoRef.current, 0, 0, 640, 480);

    // Get the base64 image data
    const imageData = canvasRef.current.toDataURL("image/jpeg").split(",")[1];

    // saveImageToFile(imageData);
    return imageData

  };

  useEffect(() => {
    const setUpWs = () => {
      ws.current = new WebSocket(
        "ws://localhost:8004/ws/media"
      );
      ws_img.current = new WebSocket(
        "ws://localhost:8004/ws/img"
      )

      ws.current.onopen = () => {
        console.log("WebSocket connection established");
      };
      ws_img.current.onopen = () => {
        console.log("Image WebSocket connection established");
      };

      ws.current.onmessage = (event) => {
        if (event.data === "thinking") {
          console.log("Cannot listen now");
          return;
        }

        try {
          const response = JSON.parse(event.data);
          if (response.audio && response.lipsync) {
            handleAudioReceived(response.audio, response.lipsync);
          }
        } catch (error) {
          console.error("Error processing websocket message:", error);
        }
      };

      ws.current.onclose = () => {
        console.log("WebSocket connection closed");
      };
      ws_img.current.onclose = () => {
        console.log("Image WebSocket connection closed");
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
      ws_img.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    };

    const setupVad = async () => {
      try {
        if (!mediaStreamRef.current) {
          const stream = await initializeMediaStream();
          if (!stream) return;
        }

        vadRef.current = await MicVAD.new({
          onSpeechStart: () => {
            if (!isWaitingForResponse.current && !isTalkingRef.current) {
              startRecording();
              console.log("Speech start detected");
            }
          },
          onSpeechEnd: () => {
            console.log("Speech end detected");
            stopRecording();
          },
        });

        vadRef.current.start();
      } catch (error) {
        console.error("Failed to setup VAD:", error);
      }
    };

    setUpWs();
    setupVad();

    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.state === "recording" &&
          mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      vadRef.current?.pause();
      if (ws.current) {
        ws.current.close();
      }
      if (ws_img.current) {
        ws_img.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (micActive) {
      const animate = () => {
        if (!isListening.current) return;

        // Simple animation based on whether mic is active
        if (circleRef.current) {
          const scale = micActive ? 1.2 : 1;
          circleRef.current.style.transform = `scale(${scale})`;
        }

        if (rippleRef.current) {
          const opacity = micActive ? 0.6 : 0;
          rippleRef.current.style.opacity = opacity;
          rippleRef.current.style.transform = `scale(${micActive ? 1.5 : 1})`;
        }

        requestAnimationFrame(animate);
      };

      animate();
    }
  }, [micActive]);

  return (
    <div className="voice-visualizer">
      <div className="ripple" ref={rippleRef}></div>
      <div className="circle" ref={circleRef}></div>
      <video
        ref={videoRef}
        style={{ opacity: 0, position: 'absolute' }}
        autoPlay
        playsInline
      />
      <canvas
        ref={canvasRef}
        style={{ display: "none" }}
        width={640}
        height={480}
      />
    </div>
  );
};
