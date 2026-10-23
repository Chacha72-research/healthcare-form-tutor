// Plays text out loud. Uses the server's Google voices when the teacher turned
// them on, and the phone's own voices otherwise (free and works offline).

export interface Voice {
  /** BCP-47 tag for the server voice, like "es-US" or "cmn-CN" */
  ttsLang: string;
  /** BCP-47 tag the browser understands, like "zh-CN" */
  browserLang: string;
}

export const ENGLISH: Voice = { ttsLang: "en-US", browserLang: "en-US" };

let currentAudio: HTMLAudioElement | null = null;
let serverTts = false;

export function setServerTts(on: boolean) {
  serverTts = on;
}

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  const prefix = lang.split("-")[0].toLowerCase();
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
}

function speakWithBrowser(text: string, voice: Voice, slow: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice.browserLang;
    utterance.rate = slow ? 0.65 : 0.85;
    const match = pickVoice(voice.browserLang);
    if (match) utterance.voice = match;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

async function speakWithServer(text: string, voice: Voice, slow: boolean): Promise<void> {
  const params = new URLSearchParams({ text, lang: voice.ttsLang, slow: String(slow) });
  const audio = new Audio(`/api/tts?${params}`);
  currentAudio = audio;
  await audio.play();
  await new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.onpause = () => resolve();
  });
}

export async function speak(text: string, voice: Voice, slow = false): Promise<void> {
  stopSpeaking();
  if (serverTts) {
    try {
      return await speakWithServer(text, voice, slow);
    } catch {
      // Fall through to the phone's voice if the server voice fails.
    }
  }
  return speakWithBrowser(text, voice, slow);
}

// Some browsers load their voice list late; asking once warms it up.
if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
