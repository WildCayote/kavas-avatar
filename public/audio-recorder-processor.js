// public/audio-recorder-processor.js

class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._bufferSize = options?.processorOptions?.bufferSize || 4096; // How many samples to buffer before sending
    this._channelCount = options?.processorOptions?.channelCount || 1;
    this._buffer = new Float32Array(this._bufferSize * this._channelCount);
    this._currentBufferIndex = 0;

    this.port.onmessage = (event) => {
      // Handle messages from main thread if needed (e.g., stop command)
      if (event.data === "reset") {
        this._currentBufferIndex = 0; // Reset buffer index if needed
      }
    };
  }

  process(inputs, outputs, parameters) {
    // inputs[0] contains the input audio channels (usually Float32Arrays)
    // We typically only care about the first input, first channel for mono mic
    const inputChannelData = inputs[0][0];

    // If no input data, do nothing (keep processor alive)
    if (!inputChannelData) {
      return true; // Return true to keep the processor alive
    }

    // --- Buffering Logic ---
    // Efficiently copy input data into our internal buffer
    let remainingInput = inputChannelData.length;
    let inputOffset = 0;

    while (remainingInput > 0) {
      const spaceLeft = this._bufferSize - this._currentBufferIndex;
      const copyCount = Math.min(remainingInput, spaceLeft);

      this._buffer.set(
        inputChannelData.subarray(inputOffset, inputOffset + copyCount),
        this._currentBufferIndex
      );

      this._currentBufferIndex += copyCount;
      inputOffset += copyCount;
      remainingInput -= copyCount;

      // If buffer is full, send it to main thread
      if (this._currentBufferIndex >= this._bufferSize) {
        // Send a *copy* of the buffer to the main thread
        this.port.postMessage({
          audioBuffer: this._buffer.slice(0, this._bufferSize), // Send a copy
        });
        this._currentBufferIndex = 0; // Reset buffer index
      }
    }

    // Return true to keep the processor alive.
    // Return false would terminate it.
    return true;
  }
}

registerProcessor("audio-recorder-processor", AudioRecorderProcessor);
