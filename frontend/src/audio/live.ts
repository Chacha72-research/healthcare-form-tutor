// Browser side of the spoken conversation simulator.
//
// Mic -> 16 kHz PCM -> websocket -> Python server -> Gemini Live
// Gemini Live -> Python server -> websocket -> 24 kHz PCM -> speaker
//
// Turn-taking is "walkie-talkie" style: the mic is muted while the partner is
// talking. Beginners pause a lot, and this keeps the partner from hearing its
// own voice through the phone speaker and answering itself.

export type LiveStatus = "connecting" | "listening" | "speaking" | "ended";

export interface LiveHandlers {
  onStatus: (s: LiveStatus) => void;
  onTranscript: (role: "learner" | "partner", text: string, newTurn: boolean) => void;
  onError: (code: string) => void;
}

const OUTPUT_RATE = 24000;
const MIC_TAIL_MS = 350; // wait a moment after the partner stops before reopening the mic

class PcmPlayer {
  private ctx: AudioContext;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  onIdle: () => void = () => {};

  constructor() {
    this.ctx = new AudioContext({ sampleRate: OUTPUT_RATE });
  }

  resume() {
    return this.ctx.resume();
  }

  get playing() {
    return this.sources.size > 0;
  }

  enqueue(data: ArrayBuffer) {
    const usable = data.byteLength - (data.byteLength % 2);
    if (usable === 0) return;
    const pcm = new Int16Array(data, 0, usable / 2);
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i] / 0x8000;

    const buffer = this.ctx.createBuffer(1, floats.length, OUTPUT_RATE);
    buffer.copyToChannel(floats, 0);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    const start = Math.max(this.ctx.currentTime + 0.04, this.nextStart);
    source.start(start);
    this.nextStart = start + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.sources.size === 0) this.onIdle();
    };
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextStart = 0;
  }

  close() {
    this.stop();
    void this.ctx.close();
  }
}

export class LiveConversation {
  private ws: WebSocket | null = null;
  private micCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private player: PcmPlayer | null = null;
  private micOpen = false;
  private reopenTimer: number | undefined;
  private lastRole: "learner" | "partner" | null = null;
  private turnEnded = true;

  constructor(private handlers: LiveHandlers) {}

  /** Call from a tap handler: phones only allow audio to start after a tap. */
  async start(url: string) {
    this.handlers.onStatus("connecting");
    // Create both audio contexts right away, while we still have the tap.
    this.player = new PcmPlayer();
    this.micCtx = new AudioContext();
    void this.player.resume();
    void this.micCtx.resume();
    this.player.onIdle = () => this.scheduleMicOpen();

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.handlers.onError("mic_denied");
      this.stop();
      return;
    }

    await this.micCtx.audioWorklet.addModule("/pcm-recorder-worklet.js");
    const source = this.micCtx.createMediaStreamSource(this.micStream);
    const recorder = new AudioWorkletNode(this.micCtx, "pcm-recorder", {
      processorOptions: { targetRate: 16000 },
    });
    recorder.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (this.micOpen && this.ws?.readyState === WebSocket.OPEN) this.ws.send(e.data);
    };
    // Some browsers only run a node that leads somewhere, so route it to a silent output.
    const mute = this.micCtx.createGain();
    mute.gain.value = 0;
    source.connect(recorder).connect(mute).connect(this.micCtx.destination);

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onmessage = (e) => this.onMessage(e);
    ws.onclose = () => {
      this.handlers.onStatus("ended");
      this.cleanupAudio();
    };
    ws.onerror = () => this.handlers.onError("session_failed");
  }

  private onMessage(e: MessageEvent) {
    if (e.data instanceof ArrayBuffer) {
      this.closeMic();
      this.handlers.onStatus("speaking");
      this.player?.enqueue(e.data);
      return;
    }
    let msg: { type: string; role?: "learner" | "partner"; text?: string; message?: string };
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case "ready":
        // Partner speaks first; the mic opens when it finishes.
        break;
      case "transcript": {
        if (!msg.role || !msg.text) break;
        const newTurn = this.turnEnded || msg.role !== this.lastRole;
        this.handlers.onTranscript(msg.role, msg.text, newTurn);
        this.lastRole = msg.role;
        this.turnEnded = false;
        break;
      }
      case "interrupted":
        this.player?.stop();
        this.scheduleMicOpen();
        break;
      case "turn_complete":
        this.turnEnded = true;
        if (!this.player?.playing) this.scheduleMicOpen();
        break;
      case "error":
        this.handlers.onError(msg.message ?? "session_failed");
        break;
    }
  }

  private closeMic() {
    window.clearTimeout(this.reopenTimer);
    this.micOpen = false;
  }

  private scheduleMicOpen() {
    window.clearTimeout(this.reopenTimer);
    this.reopenTimer = window.setTimeout(() => {
      if (this.player?.playing) return;
      this.micOpen = true;
      this.handlers.onStatus("listening");
    }, MIC_TAIL_MS);
  }

  private cleanupAudio() {
    this.closeMic();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    if (this.micCtx && this.micCtx.state !== "closed") void this.micCtx.close();
    this.micCtx = null;
    this.player?.close();
    this.player = null;
  }

  stop() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "end" }));
      this.ws.close();
    }
    this.ws = null;
    this.cleanupAudio();
    this.handlers.onStatus("ended");
  }
}
