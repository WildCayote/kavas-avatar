class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.audioBuffer = [];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      // Assuming single channel audio
      const channelData = input[0];
      const buffer = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.audioBuffer.push(buffer);
    }
    return true;
  }

  onmessage(event) {
    if (event.data && event.data.type === "getAudioBuffer") {
      const combinedAudio = this.combineAudioBuffers(this.audioBuffer);
      this.port.postMessage({ type: "audioData", audio: combinedAudio });
      this.audioBuffer = []; // Clear buffer after sending
    }
  }

  combineAudioBuffers(buffers) {
    let totalLength = buffers.reduce((acc, curr) => acc + curr.length, 0);
    let result = new Int16Array(totalLength);
    let offset = 0;
    buffers.forEach((buf) => {
      result.set(buf, offset);
      offset += buf.length;
    });
    return result;
  }
}

registerProcessor("audio-recorder-processor", AudioRecorderProcessor);
