import React, { useState, useRef, useEffect } from 'react';
import { MicVAD } from '@ricky0123/vad-web';

const VoiceRecorder = ({
   onAudioReceived,
   isTalking,
   onError,
   onStatusChange,
}) => {
   const [audioURL, setAudioURL] = useState('');
   const mediaRecorderRef = useRef(null);
   const audioChunksRef = useRef([]);
   const vadRef = useRef(null);
   const [isSensing, setIsSensing] = useState(true);
   const [micActive, setMicActive] = useState(false);
   const analyserRef = useRef(null);
   const audioContextRef = useRef(null);
   const isTalkingRef = useRef(isTalking);
   const isThinkingRef = useRef(false);

   const canvasRef = useRef(null);
   const animationRef = useRef(null);
   const [volumeLevel, setVolumeLevel] = useState(0);
   const ws = useRef(null);

   const videoRef = useRef(null);
   const videoCanvasRef = useRef(null);
   const [videoStream, setVideoStream] = useState(null);

   useEffect(() => {
      isTalkingRef.current = isTalking;
   }, [isTalking]);
   // Color palette for the visualizer
   const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFBE0B',
      '#FB5607', '#8338EC', '#3A86FF', '#FF006E'
   ];

   useEffect(() => {
      let vadInstance;

      const setupVad = async () => {
         try {
            if (isSensing) {
               vadInstance = await MicVAD.new({
                  onSpeechStart: () => {
                     if (isTalkingRef.current || isThinkingRef.current) {
                        console.log(
                           "VAD Speech Start ignored: Avatar speaking or server thinking."
                        );
                        return;
                     }
                     if (!(mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording')) {
                        startRecording();
                     }
                  },
                  onSpeechEnd: () => {
                     if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                        stopRecording();
                     }
                  },
                  redemptionFrames: 15,
                  minSpeechFrames: 3,
               });
               vadInstance.start();
               vadRef.current = vadInstance;
            }
         } catch (error) {
            console.error('Failed to setup MicVAD:', error);
         }
      };

      setupVad();

      const setupVideo = async () => {
         try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            setVideoStream(stream);
            if (videoRef.current) {
               videoRef.current.srcObject = stream;
            }
         } catch (error) {
            console.error('Error accessing webcam:', error);
         }
      };

      setupVideo();


      const setUpWs = () => {
         ws.current = new WebSocket("ws://localhost:8004/ws/media");
         ws.current.onopen = () => console.log("WebSocket connection established");
         ws.current.onmessage = (event) => {
            console.log("Is the avatar talking: ", isTalkingRef.current);
            isThinkingRef.current = false;
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


      setUpWs();

      return () => {
         if (vadInstance) {
            vadInstance.destroy();
         }
         if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
         }
         if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
         }
         if (audioContextRef.current) {
            audioContextRef.current.close();
         }
         cancelAnimationFrame(animationRef.current);

         // 2. Close WebSocket
         if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.close();
            console.log("WebSocket connection closed on cleanup.");
         }
         ws.current = null;
      };
   }, [isSensing, onAudioReceived, onError, onStatusChange]);

   const captureVideoFrame = () => {
      if (videoRef.current && videoCanvasRef.current) {
         const canvas = videoCanvasRef.current;
         const ctx = canvas.getContext('2d');
         canvas.width = videoRef.current.videoWidth;
         canvas.height = videoRef.current.videoHeight;
         ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
         const dataURL = canvas.toDataURL('image/jpeg');
         sendData({ image: dataURL });
         return dataURL;
      }
      return null;
   };


   const downloadFrame = (dataURL) => {
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = `frame_${new Date().toISOString()}.jpeg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
   };

   const sendData = (data) => {
      console.log("SENDING DATA TO SERVER init")
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
         console.log("SENDING DATA TO SERVER fr")
         ws.current.send(JSON.stringify(data));
      } else {
         if (onError) onError('WebSocket not open');
      }
   };

   const sendAudioAndVideo = async () => {
      if (audioChunksRef.current.length > 0) {
         try {
            const audioBlob = new Blob(audioChunksRef.current, {
               type: 'audio/wav',
            });

            // Convert audioBlob to base64
            const reader = new FileReader();
            reader.onload = () => {
               const audioBase64 = reader.result.split(',')[1]; // Remove data URL prefix
               const videoBase64 = captureVideoFrame(); // Capture video frame

               if (videoBase64 === null) {
                  console.error("Failed to capture video frame. Aborting send.");
                  return;
               }

               const payload = { audio: audioBase64, video: videoBase64 };

               // Send Payload
               if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                  ws.current.send(JSON.stringify(payload));
                  console.log("Sent audio and video payload");
                  isThinkingRef.current = true;
               } else {
                  console.error("WebSocket not open. Cannot send payload.");
               }
            };
            reader.readAsDataURL(audioBlob); // Read as data URL to get base64

            // Download the wav file.
            downloadRecording(audioBlob, `recording_${Date.now()}.wav`);

         } catch (e) {
            console.error("Error creating or sending audio:", e);
         }
      } else {
         console.warn("Skipping audio send: No audio data.");
      }
      cleanupAudioContext();
   };


   const startRecording = async () => {
      if (mediaRecorderRef.current?.state === 'recording') return;

      try {
         const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
         mediaRecorderRef.current = new MediaRecorder(stream);
         audioChunksRef.current = [];

         mediaRecorderRef.current.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data);
         };

         mediaRecorderRef.current.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, {
               type: 'audio/wav',
            });
            const url = URL.createObjectURL(audioBlob);
            setAudioURL(url);
            downloadRecording(audioBlob);
            cleanupAudioContext();
            sendAudioAndVideo();
         };

         mediaRecorderRef.current.start();
         setupVisualizer(stream);
         setMicActive(true);
      } catch (err) {
         console.error('Error accessing microphone:', err);
         cleanupAudioContext();
         setMicActive(false);
      }
   };

   const stopRecording = () => {
      if (mediaRecorderRef.current?.state === 'recording') {
         mediaRecorderRef.current.stop();
      }
   };

   const downloadRecording = (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording_${new Date().toISOString()}.wav`;
      document.body.appendChild(a);
      // a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
   };

   const toggleSensing = () => {
      setIsSensing(!isSensing);
   };

   const setupVisualizer = (stream) => {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const drawVisualizer = () => {
         animationRef.current = requestAnimationFrame(drawVisualizer);

         if (!analyserRef.current || !canvasRef.current) return;

         const canvas = canvasRef.current;
         const ctx = canvas.getContext('2d');
         const width = canvas.width;
         const height = canvas.height;

         const bufferLength = analyserRef.current.frequencyBinCount;
         const dataArray = new Uint8Array(bufferLength);
         analyserRef.current.getByteFrequencyData(dataArray);

         // Calculate average volume
         const volume = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
         setVolumeLevel(volume);

         // Clear canvas
         ctx.clearRect(0, 0, width, height);

         // Draw dynamic bars
         const barWidth = (width / bufferLength) * 2.5;
         let x = 0;

         for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height;
            const colorIndex = Math.floor((i / bufferLength) * colors.length);

            ctx.fillStyle = colors[colorIndex];
            ctx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth + 2;
         }

         // Draw center circle that pulses with volume
         ctx.beginPath();
         ctx.arc(width / 2, height / 2, 20 + (volume / 5), 0, 2 * Math.PI);
         ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + (volume / 255)})`;
         ctx.fill();
      };

      drawVisualizer();
   };

   const cleanupAudioContext = () => {
      if (audioContextRef.current) {
         cancelAnimationFrame(animationRef.current);
         audioContextRef.current.close();
         audioContextRef.current = null;
         analyserRef.current = null;
         setMicActive(false);
         setVolumeLevel(0);
      }
   };

   return (
      <div style={{
         display: 'flex',
         flexDirection: 'column',
         alignItems: 'center',
         gap: '20px',
         padding: '20px',
         borderRadius: '15px',
         background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
         boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
         maxWidth: '500px',
         margin: '0 auto',
         color: 'white'
      }}>

         {/* Video Display */}
         <video
            ref={videoRef}
            autoPlay
            muted
            style={{
               width: '100%',
               height: 'auto',
               borderRadius: '10px',
               marginBottom: '10px',
               opacity: '0%',
               zIndex: '-1000',
               position: 'absolute',
               top: '0',
               right: '0'
            }}
         />

         {/* Canvas for capturing video frames (hidden) */}
         <canvas ref={videoCanvasRef} style={{ display: 'none' }} />

         {/* Audio Visualizer */}
         <div style={{
            width: '100%',
            height: '150px',
            position: 'relative',
            marginBottom: '20px'
         }}>
            <canvas
               ref={canvasRef}
               width={400}
               height={150}
               style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)'
               }}
            />
            <div style={{
               position: 'absolute',
               top: '50%',
               left: '50%',
               transform: 'translate(-50%, -50%)',
               width: '80px',
               height: '80px',
               borderRadius: '50%',
               background: micActive
                  ? `radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.2) 70%)`
                  : 'rgba(255, 255, 255, 0.1)',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               transition: 'all 0.3s ease',
               boxShadow: micActive ? '0 0 20px rgba(255, 255, 255, 0.5)' : 'none'
            }}>
               <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: micActive ? '#FF6B6B' : '#4ECDC4',
                  transition: 'all 0.3s ease',
                  transform: micActive ? `scale(${1 + volumeLevel / 100})` : 'scale(1)'
               }} />
            </div>
         </div>

         {/* Status Indicator */}
         <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '15px'
         }}>
            <div style={{
               width: '12px',
               height: '12px',
               borderRadius: '50%',
               backgroundColor: micActive ? '#4ECDC4' : '#FF6B6B',
               boxShadow: micActive ? '0 0 10px #4ECDC4' : 'none'
            }} />
            <span>{micActive ? 'Recording...' : 'Ready'}</span>
         </div>

         {/* Controls */}
         <div style={{ display: 'flex', gap: '15px' }}>
            <button
               onClick={stopRecording}
               style={{
                  padding: '12px 25px',
                  backgroundColor: '#FF6B6B',
                  color: 'white',
                  border: 'none',
                  borderRadius: '30px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.3s',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                  ':hover': {
                     transform: 'translateY(-2px)',
                     boxShadow: '0 6px 8px rgba(0, 0, 0, 0.15)'
                  }
               }}
            >
               Stop & Save
            </button>
            <button
               onClick={toggleSensing}
               style={{
                  padding: '12px 25px',
                  backgroundColor: isSensing ? '#6c757d' : '#4ECDC4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '30px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.3s',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
               }}
            >
               {isSensing ? 'Pause Detection' : 'Enable Detection'}
            </button>
            <button onClick={captureVideoFrame}>Capture Frame</button>
         </div>

         {/* Volume Meter */}
         <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            marginTop: '15px',
            overflow: 'hidden'
         }}>
            <div
               style={{
                  width: `${volumeLevel}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #FF6B6B, #FFBE0B)',
                  borderRadius: '4px',
                  transition: 'width 0.1s ease-out'
               }}
            />
         </div>
      </div>
   );
};

export default VoiceRecorder;