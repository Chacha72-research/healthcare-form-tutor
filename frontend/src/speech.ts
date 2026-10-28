// Plays lesson audio. Uses Gemini's voices through the server when the free
// key is set (natural Tamil, Vietnamese, and so on), and falls back to the
// device's built-in voices otherwise.
//
// Voice must never slow the app down, so:
//   - at most 2 voice requests run at once (browsers only allow ~6 requests
//     to a site at a time, and the rest are needed for lessons and quizzes),
//   - each request gives up after 12 seconds,
//   - after a failure, the device voice is used for a minute before trying again.

export interface SpeechPart {
  text: string;
  /** "l1" = the learner's language, "en" = English */
  lang: "l1" | "en";
  voice?: "tutor" | "staff" | "learner";
  /** "model" = slow, clear English for repeating */
  style?: "tutor" | "model";
}

const FETCH_TIMEOUT_MS = 12000;
const MAX_IN_FLIGHT = 2;
const SERVER_RETRY_MS = 60000;
const VOICE_KEY = "form-helper-voice";
// A tiny silent clip, played on the first tap so Safari allows audio later.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

let serverVoice = false;
let serverDownUntil = 0;
let l1BrowserLang = "en-US";
let voiceOn = true;
let generation = 0;
let player: HTMLAudioElement | null = null;
let finishCurrent: (() => void) | null = null;
let inFlight = 0;
const waiting: (() => void)[] = [];
const audioCache = new Map<string, Promise<string | null>>();

try {
  voiceOn = localStorage.getItem(VOICE_KEY) !== "0";
} catch {
  /* fine */
}

export function setServerVoice(on: boolean) {
  serverVoice = on;
}

export function setLearnerBrowserLang(lang: string) {
  l1BrowserLang = lang;
}

export function isVoiceOn() {
  return voiceOn;
}

export function setVoiceOn(on: boolean) {
  voiceOn = on;
  try {
    localStorage.setItem(VOICE_KEY, on ? "1" : "0");
  } catch {
    /* fine */
  }
  if (!on) stopSpeaking();
}

function getPlayer() {
  if (!player) player = new Audio();
  return player;
}

/** Call from a tap. Safari only lets a page play audio after a tap has played some. */
export function unlockAudio() {
  const p = getPlayer();
  if (!p.paused) return;
  p.src = SILENT_WAV;
  p.play().catch(() => {});
}

export function stopSpeaking() {
  generation += 1;
  player?.pause();
  finishCurrent?.();
  finishCurrent = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function serverAvailable() {
  return serverVoice && Date.now() >= serverDownUntil;
}

function partUrl(part: SpeechPart) {
  const params = new URLSearchParams({
    text: part.text,
    voice: part.voice ?? (part.lang === "l1" ? "tutor" : "staff"),
    style: part.style ?? (part.lang === "l1" ? "tutor" : "model"),
  });
  return `/api/speech?${params}`;
}

async function inSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight += 1;
  try {
    return await fn();
  } finally {
    inFlight -= 1;
    waiting.shift()?.();
  }
}

function fetchAudio(part: SpeechPart): Promise<string | null> {
  const url = partUrl(part);
  const cached = audioCache.get(url);
  if (cached) return cached;

  const pending = inSlot(async () => {
    if (!serverAvailable()) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(String(resp.status));
      return URL.createObjectURL(await resp.blob());
    } catch {
      // Busy, slow, or off: use the device's voice for a while.
      serverDownUntil = Date.now() + SERVER_RETRY_MS;
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
  audioCache.set(url, pending);
  // Don't remember failures, so the line can be tried again later.
  void pending.then((u) => {
    if (u === null) audioCache.delete(url);
  });
  return pending;
}

/** Start loading audio for the next couple of lines. */
export function prefetch(parts: SpeechPart[]) {
  if (!voiceOn || !serverAvailable()) return;
  for (const p of parts.filter((x) => x.text.trim()).slice(0, 2)) void fetchAudio(p);
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  const prefix = lang.split("-")[0].toLowerCase();
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
}

function browserSpeak(part: SpeechPart, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || gen !== generation) return resolve();
    const lang = part.lang === "en" ? "en-US" : l1BrowserLang;
    const voice = pickVoice(lang);
    // An English voice reading Tamil is worse than silence; the text is on screen.
    if (!voice && part.lang === "l1") return resolve();
    const u = new SpeechSynthesisUtterance(part.text);
    u.lang = lang;
    u.rate = part.style === "model" ? 0.7 : 0.9;
    if (voice) u.voice = voice;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    u.onend = finish;
    u.onerror = finish;
    finishCurrent = finish;
    window.speechSynthesis.speak(u);
    // Some browsers never fire onend; never let that hang a lesson.
    setTimeout(finish, Math.max(2500, part.text.length * 140));
  });
}

function playUrl(url: string, gen: number): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== generation) return resolve();
    const p = getPlayer();
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    finishCurrent = finish;
    p.onended = finish;
    p.onerror = finish;
    p.src = url;
    p.play().catch(finish);
  });
}

/** Speak parts one after another. Resolves when finished or stopped. */
export async function speakParts(parts: SpeechPart[], force = false): Promise<void> {
  if (!voiceOn && !force) return;
  stopSpeaking();
  const gen = generation;
  prefetch(parts);
  for (const part of parts) {
    if (gen !== generation) return;
    if (!part.text.trim()) continue;
    const url = serverAvailable() ? await fetchAudio(part) : null;
    if (gen !== generation) return;
    if (url) await playUrl(url, gen);
    else await browserSpeak(part, gen);
  }
}

export const speak = (part: SpeechPart) => speakParts([part], true);

// Some browsers load their voice list late; asking once warms it up.
if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
