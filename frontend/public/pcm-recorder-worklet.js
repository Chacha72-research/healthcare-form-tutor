// Runs on the browser's audio thread. Turns microphone audio (usually 44.1 or
// 48 kHz float) into 16 kHz, 16-bit PCM chunks of about 100 ms, which is the
// format the Gemini Live API expects.

class PcmRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetRate = (options.processorOptions && options.processorOptions.targetRate) || 16000;
    this.ratio = sampleRate / this.targetRate; // sampleRate is a global in worklet scope
    this.chunkSize = Math.round(this.targetRate / 10);
    this.out = new Int16Array(this.chunkSize);
    this.outIndex = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      // Average each group of input samples into one output sample. This is a
      // simple low-pass filter, good enough for speech.
      this.sum += channel[i];
      this.count += 1;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        const sample = Math.max(-1, Math.min(1, this.sum / this.count));
        this.sum = 0;
        this.count = 0;
        this.out[this.outIndex++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        if (this.outIndex === this.chunkSize) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(this.chunkSize);
          this.outIndex = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
