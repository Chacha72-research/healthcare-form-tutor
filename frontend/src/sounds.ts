// Tiny happy and gentle sounds for right and wrong answers, made in the
// browser (no files, no network). Wrong answers get a soft, low note, never a buzzer.

let ctx: AudioContext | null = null;

function tone(freq: number, start: number, length: number, volume = 0.12) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + length + 0.05);
}

function ready() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

export function chimeRight() {
  if (!ready()) return;
  tone(660, 0, 0.18);
  tone(990, 0.1, 0.3);
}

export function chimeWrong() {
  if (!ready()) return;
  tone(330, 0, 0.3, 0.08);
}

export function chimeDone() {
  if (!ready()) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35));
}
