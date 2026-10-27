// Plays lesson audio. Uses Gemini's voices through the server when the free
// key is set (natural Tamil, Vietnamese, and so on), and falls back to the
// phone's built-in voices otherwise. Each line is fetched once and reused.

export interface SpeechPart {
  text: string;
  /** "l1" = the learner's language, "en" = English */
  lang: "l1" | "en";
  voice?: "tutor" | "staff" | "learner";
  /** "model" = slow, clear English for repeating */
  style?: "tutor" | "model";
}

let serverVoice = false;
let l1BrowserLang = "en-US";
let voiceOn = true;
let generation = 0;
let currentAudio: HTMLAudioElement | null = null;
const audioCache = new Map<string, Promise<string | null>>();

const VOICE_KEY = "form-helper-voice";

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

try {
  voiceOn = localStorage.getItem(VOICE_KEY) !== "0";
} catch {
  /* fine */
}

export function stopSpeaking() {
  generation += 1;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function partUrl(part: SpeechPart) {
  const params = new URLSearchParams({
    text: part.text,
    voice: part.voice ?? (part.lang === "l1" ? "tutor" : "staff"),
    style: part.style ?? (part.lang === "l1" ? "tutor" : "model"),
  });
  return `/api/speech?${params}`;
}

function fetchAudio(part: SpeechPart): Promise<string | null> {
  const url = partUrl(part);
  let pending = audioCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    // Don't remember failures, so a busy moment doesn't silence a line for good.
    pending.then((u) => {
      if (u === null) audioCache.delete(url);
    });
    audioCache.set(url, pending);
  }
  return pending;
}

/** Start loading audio for lines that are coming up next. */
export function prefetch(parts: SpeechPart[]) {
  if (!serverVoice || !voiceOn) return;
  for (const p of parts) if (p.text.trim()) void fetchAudio(p);
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  const prefix = lang.split("-")[0].toLowerCase();
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
}

function browserSpeak(part: SpeechPart): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(part.text);
    u.lang = part.lang === "en" ? "en-US" : l1BrowserLang;
    u.rate = part.style === "model" ? 0.7 : 0.9;
    const v = pickVoice(u.lang);
    if (v) u.voice = v;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
    // Some browsers never fire onend for languages they lack; don't hang the lesson.
    setTimeout(resolve, Math.max(2500, part.text.length * 140));
  });
}

async function playUrl(url: string, gen: number): Promise<void> {
  if (gen !== generation) return;
  const audio = new Audio(url);
  currentAudio = audio;
  await new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.onpause = () => resolve();
    audio.play().catch(() => resolve());
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
    const url = serverVoice ? await fetchAudio(part) : null;
    if (gen !== generation) return;
    if (url) await playUrl(url, gen);
    else await browserSpeak(part);
  }
}

export const speak = (part: SpeechPart) => speakParts([part], true);

// Some browsers load their voice list late; asking once warms it up.
if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
