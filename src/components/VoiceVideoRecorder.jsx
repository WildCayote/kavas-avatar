import React, { useEffect, useRef, useState } from "react"; // Added React import
import { MicVAD } from "@ricky0123/vad-web";

// Helper function to create a WAV Blob from Int16Array audio data
const createWavBlob = (audioData, sampleRate) => {
  const numFrames = audioData.length;
  const numChannels = 1; // Mono audio
  const bitsPerSample = 16; // Using Int16Array
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize); // 44 bytes for header
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // ChunkSize (36 + actual data size)
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true); // Subchunk2Size (actual data size)

  // Write audio data (converting Int16Array to Int16 little endian)
  for (let i = 0; i < numFrames; i++) {
    view.setInt16(44 + i * bytesPerSample, audioData[i], true);
  }

  return new Blob([view], { type: "audio/wav" });
};

// Helper function to write string to DataView
const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// Helper function to trigger file download
const downloadWavFile = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.style.display = "none"; // Corrected style assignment
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  console.log(`${filename} download initiated.`); // Corrected template literal
};

export const VoiceVideoRecorder = ({ onAudioReceived, isTalking }) => {
  const [micActive, setMicActive] = useState(false);
  const [isThinking, setThinking] = useState(false);
  const circleRef = useRef(null);
  const rippleRef = useRef(null);
  const audioBuffer = useRef([]); // Will store Int16Array chunks received from worklet
  const ws = useRef(null);
  const isListening = useRef(false);
  const isTalkingRef = useRef(isTalking);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const vadRef = useRef(null);
  const sampleRateRef = useRef(null);
  const workletNode = useRef(null); // <-- Ref for the worklet node

  useEffect(() => {
    isTalkingRef.current = isTalking;
  }, [isTalking]);

  useEffect(() => {
    console.log("thinking state changedJ", isThinking);
  }, [isThinking]);

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
    // Note: stopListening is called after send in onSpeechEnd now
  };

  // Combine Int16Array buffers (this remains the same as we convert in onmessage)
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

  // Main useEffect for setup and cleanup, incorporating AudioWorklet
  useEffect(() => {
    // --- Refs to audio nodes/stream, defined in useEffect scope ---
    let audioContext = null; // Use null initially
    let analyser = null;
    let microphone = null;
    let dataArray = null;
    let videoStream = null;
    // workletNode is handled by the useRef outside

    // --- WebSocket Setup (remains the same) ---
    const setUpWs = () => {
      ws.current = new WebSocket("ws://localhost:8004/ws/media");
      ws.current.onopen = () => console.log("WebSocket connection established");
      ws.current.onmessage = (event) => {
        console.log("Is the avatar talking: ", isTalkingRef.current);
        setThinking(false);
        if (isTalkingRef.current) return;

        console.log("Received response from server:", event.data);
        if (event.data == "thinking") {
          console.log("Server is thinking, cannot listen now");
        } else {
          try {
            const response = JSON.parse(event.data);
            if (response.audio && response.lipsync) {
              handleAudioReceived(response.audio, response.lipsync);
            }
          } catch (e) {
            console.error("Failed to parse server message:", e, event.data);
          }
        }
      };
      ws.current.onclose = () => console.log("WebSocket connection closed");
      ws.current.onerror = (error) => console.error("WebSocket error:", error);
    };

    // --- Video Capture (remains the same) ---
    const captureVideoFrame = () => {
      if (
        !canvasRef.current ||
        !videoRef.current ||
        !videoRef.current.videoWidth ||
        !videoRef.current.videoHeight
      ) {
        console.error("Canvas or Video element not ready for capture.");
        return null;
      }
      const context = canvasRef.current.getContext("2d");
      // Ensure canvas dimensions match desired capture size
      canvasRef.current.width = 640;
      canvasRef.current.height = 480;
      context.drawImage(videoRef.current, 0, 0, 640, 480);
      try {
        return canvasRef.current.toDataURL("image/jpeg").split(",")[1];
      } catch (e) {
        console.error("Error converting canvas to DataURL:", e);
        return null;
      }
    };

    // --- Modified startListening using AudioWorklet ---
    const startListening = async () => {
      console.log("Attempting to start listening (Worklet)...");
      // Prevent starting if already listening
      if (
        isListening.current ||
        (audioContext && audioContext.state !== "closed")
      ) {
        console.warn(
          "Already listening or AudioContext exists. Aborting start."
        );
        return;
      }

      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        sampleRateRef.current = audioContext.sampleRate;
        console.log(
          "AudioContext created with sample rate:",
          sampleRateRef.current
        );

        // Stop existing tracks *before* getUserMedia
        if (videoStream) {
          videoStream.getTracks().forEach((track) => track.stop());
          console.log("Stopped existing media tracks.");
        }

        // Get audio/video stream
        videoStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        console.log("Got user media stream.");

        // Setup video element
        if (videoRef.current) {
          videoRef.current.srcObject = videoStream;
          videoRef.current.onloadedmetadata = () =>
            console.log("Video metadata loaded.");
        } else {
          console.error("videoRef is null when trying to set srcObject");
        }

        // Create microphone source node
        microphone = audioContext.createMediaStreamSource(videoStream);

        // Create analyser node (for visualization)
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 32; // Small FFT size for basic volume
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        // Don't connect mic to analyser directly yet

        // --- AudioWorklet Setup ---
        if (!audioContext.audioWorklet) {
          console.error("AudioWorklet is not supported in this browser.");
          throw new Error("AudioWorklet not supported");
        }

        try {
          // Adjust path as necessary (e.g., '/public/audio-recorder-processor.js')
          await audioContext.audioWorklet.addModule(
            "audio-recorder-processor.js"
          );
          console.log("AudioWorklet module added.");
        } catch (e) {
          console.warn(
            "AudioWorklet module possibly already added or failed to add:",
            e
          );
          // Consider if you need to handle this error more gracefully
        }

        workletNode.current = new AudioWorkletNode(
          audioContext,
          "audio-recorder-processor",
          {
            processorOptions: {
              bufferSize: 4096, // Number of samples to buffer in worklet before sending
              channelCount: 1,
            },
          }
        );
        console.log("AudioWorkletNode created.");

        // Handle messages (audio buffers) from the Worklet
        workletNode.current.port.onmessage = (event) => {
          if (event.data.audioBuffer && isListening.current) {
            const float32Buffer = event.data.audioBuffer;
            // Convert Float32 chunk received from worklet to Int16
            let int16Buffer = new Int16Array(float32Buffer.length);
            for (let i = 0; i < float32Buffer.length; i++) {
              let s = Math.max(-1, Math.min(1, float32Buffer[i]));
              int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            audioBuffer.current.push(int16Buffer); // Add Int16 chunk to main buffer
          }
        };

        workletNode.current.port.onmessageerror = (event) =>
          console.error("Error receiving message from worklet:", event);
        workletNode.current.onprocessorerror = (event) =>
          console.error("AudioWorkletProcessor error:", event);

        // --- Connect Audio Nodes ---
        microphone.connect(workletNode.current); // Mic -> Worklet
        workletNode.current.connect(analyser); // Worklet -> Analyser (for visualization)
        // Do NOT connect workletNode.current directly to audioContext.destination
        // unless your worklet is designed to pass audio through AND you want to hear the mic input.
        // analyser.connect(audioContext.destination); // Optional: If you want analyser data processed further

        // --- End AudioWorklet Setup ---

        setMicActive(true);
        isListening.current = true; // Set listening state AFTER successful setup
        console.log("startListening setup complete.");

        // --- Animation (remains the same) ---
        const animate = () => {
          // Check if analyser exists and we are still listening
          if (
            !analyser ||
            !isListening.current ||
            !circleRef.current ||
            !rippleRef.current
          ) {
            // Stop animation if analyser gone or not listening
            if (!isListening.current) {
              if (circleRef.current)
                circleRef.current.style.transform = "scale(1)";
              if (rippleRef.current) rippleRef.current.style.opacity = "0";
            }
            return;
          }

          analyser.getByteFrequencyData(dataArray);
          const volume =
            dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const scale = 1 + volume / 300;
          const opacity = Math.min(0.5 + volume / 600, 1);
          const rippleScale = 1.5 + volume / 200;

          circleRef.current.style.transform = `scale(${scale})`; // Corrected template literal
          rippleRef.current.style.opacity = opacity.toString(); // Ensure opacity is string
          rippleRef.current.style.transform = `scale(${rippleScale})`; // Corrected template literal

          requestAnimationFrame(animate); // Continue animation loop only if listening
        };
        animate(); // Start the animation
      } catch (error) {
        console.error("Error during startListening:", error);
        setMicActive(false);
        isListening.current = false;
        // Clean up any partially created resources if error occurred mid-setup
        if (audioContext && audioContext.state !== "closed")
          await audioContext.close().catch((e) => {});
        if (videoStream)
          videoStream.getTracks().forEach((track) => track.stop());
        audioContext = null;
        videoStream = null;
        workletNode.current = null; // Ensure ref is cleared on error
      }
    };

    // --- Modified stopListening for AudioWorklet ---
    const stopListening = () => {
      console.log("Attempting to stop listening (Worklet)...");
      if (!isListening.current && audioContext?.state !== "running") {
        console.log("Already stopped or context not running.");
        // Ensure UI state is correct even if called redundantly
        setMicActive(false);
        if (circleRef.current) circleRef.current.style.transform = "scale(1)";
        if (rippleRef.current) rippleRef.current.style.opacity = "0";
        return;
      }

      isListening.current = false; // Signal that listening should stop immediately

      // 1. Disconnect Nodes
      if (microphone) {
        microphone.disconnect();
        console.log("Microphone source disconnected.");
      }
      if (workletNode.current) {
        workletNode.current.disconnect();
        // Clean up worklet listeners
        workletNode.current.port.onmessage = null;
        workletNode.current.port.onmessageerror = null;
        workletNode.current.onprocessorerror = null;
        console.log("AudioWorkletNode disconnected.");
      }
      if (analyser) {
        analyser.disconnect();
        console.log("Analyser disconnected.");
      }

      // 2. Stop MediaStream Tracks
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
        console.log("MediaStream tracks stopped.");
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject = null; // Clear video element source
      }

      // 3. Close AudioContext
      // Check state before closing
      if (
        audioContext &&
        (audioContext.state === "running" || audioContext.state === "suspended")
      ) {
        audioContext
          .close()
          .then(() => {
            console.log("AudioContext closed successfully.");
          })
          .catch((e) => console.error("Error closing AudioContext:", e))
          .finally(() => {
            // Clear references AFTER context is closed or attempt failed
            audioContext = null;
            microphone = null;
            analyser = null; // Nullify analyser if context is closed
            workletNode.current = null; // Nullify worklet ref
            videoStream = null;
          });
      } else {
        console.log(
          `AudioContext already closed or in state: ${audioContext?.state}. Clearing refs.`
        );
        // Clear references even if context wasn't explicitly closed here
        audioContext = null;
        microphone = null;
        analyser = null;
        workletNode.current = null;
        videoStream = null;
      }

      // 4. Update UI State
      setMicActive(false);
      if (circleRef.current) circleRef.current.style.transform = "scale(1)";
      if (rippleRef.current) rippleRef.current.style.opacity = "0";

      console.log("stopListening actions complete.");
    };

    // --- VAD Setup (integrates with start/stopListening) ---
    const setupVad = async () => {
      try {
        // Destroy existing VAD instance if it exists
        if (vadRef.current) {
          vadRef.current.destroy();
        }

        vadRef.current = await MicVAD.new({
          // Make sure VAD uses the created AudioContext if possible/needed
          // Check @ricky0123/vad-web docs if context needs to be passed
          // context: audioContext, // Example: Might be an option

          onSpeechStart: () => {
            if (isTalkingRef.current || isThinking) {
              console.log(
                "VAD Speech Start ignored: Avatar speaking or server thinking."
              );
              return;
            }
            console.log("VAD Speech start detected");
            audioBuffer.current = []; // Clear buffer for new speech
            startListening(); // Start mic, worklet, video, etc.
          },
          onSpeechEnd:
            (/* MicVAD might provide audio data, but we use our worklet buffer */) => {
              console.log("VAD Speech end detected.");

              // Abort if no audio collected, or if avatar/server interrupted
              if (
                audioBuffer.current.length === 0 ||
                isTalkingRef.current ||
                isThinking
              ) {
                console.log(
                  "onSpeechEnd ignored: No audio buffered or avatar/server interrupted."
                );
                audioBuffer.current = []; // Clear buffer anyway
                stopListening(); // Stop resources if aborting
                return;
              }

              // Process the audio collected via the Worklet
              const combinedAudio = combineAudioBuffers(audioBuffer.current);
              audioBuffer.current = []; // Clear buffer after combining

              // --- WAV Saving ---
              if (combinedAudio.length > 0 && sampleRateRef.current) {
                try {
                  const wavBlob = createWavBlob(
                    combinedAudio,
                    sampleRateRef.current
                  );
                  downloadWavFile(wavBlob, `recording_${Date.now()}.wav`);
                } catch (e) {
                  console.error("Error creating or downloading WAV file:", e);
                }
              } else {
                console.warn(
                  "Skipping WAV save: No audio data or sample rate missing."
                );
              }

              // --- Prepare Payload ---
              const audioUint8 = new Uint8Array(combinedAudio.buffer);
              const audioBase64 = arrayBufferToBase64(audioUint8);
              const videoBase64 = captureVideoFrame(); // Capture video frame

              if (videoBase64 === null) {
                console.error("Failed to capture video frame. Aborting send.");
                setThinking(false);
                stopListening(); // Still stop resources
                return;
              }

              const payload = { audio: audioBase64, video: videoBase64 };

              // --- Send Payload ---
              setThinking(true);
              if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify(payload));
                console.log("Sent audio and video payload");
              } else {
                console.error("WebSocket not open. Cannot send payload.");
                setThinking(false); // Reset thinking state if send fails
              }

              // --- Stop Listening AFTER processing/sending ---
              stopListening();
            },
          // Adjust VAD parameters as needed
          redemptionFrames: 5,
          minSpeechFrames: 3,
          // positiveSpeechThreshold: 0.5, // Default
          // negativeSpeechThreshold: 0.35, // Default
        });

        vadRef.current.start();
        console.log("MicVAD started.");
      } catch (error) {
        console.error("Failed to setup MicVAD:", error);
      }
    };

    // --- Initialization Sequence ---
    setUpWs();
    setupVad(); // Setup VAD, which will call startListening on speech start

    // --- Cleanup Function ---
    return () => {
      console.log("Cleanup: Component unmounting...");
      isListening.current = false; // Ensure listening flag is false

      // 1. Stop VAD
      if (vadRef.current) {
        vadRef.current.destroy();
        vadRef.current = null;
        console.log("MicVAD destroyed.");
      }

      // 2. Close WebSocket
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.close();
        console.log("WebSocket connection closed on cleanup.");
      }
      ws.current = null;

      // 3. Stop listening and release all media resources
      // Call stopListening, which handles nodes, tracks, and AudioContext
      stopListening();

      console.log("Cleanup complete.");
    };
  }, []); // Empty dependency array: runs only on mount and unmount

  return (
    <div className="voice-visualizer">
      {/* Visualizer elements */}
      {/* Corrected ClassName usage */}
      <div
        className={`ripple ${micActive ? "active" : ""}`}
        ref={rippleRef}
      ></div>
      <div
        className={`circle ${micActive ? "active" : ""}`}
        ref={circleRef}
      ></div>

      {/* Video element (keep hidden or style as needed) */}
      <video
        ref={videoRef}
        style={{
          opacity: 1,
          position: "absolute",
          top: "-9999px",
          left: "-9999px",
          width: "640px",
          height: "480px",
        }} // Added size for consistency
        autoPlay
        muted
        playsInline
      />

      {/* Canvas for frame capture (hidden) */}
      <canvas
        ref={canvasRef}
        style={{ display: "none" }}
        width={640}
        height={480}
      />
    </div>
  );
};

// Remember to create the audio-recorder-processor.js file
// and make it accessible to your application.
