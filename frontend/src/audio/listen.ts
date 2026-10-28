// Listens to one spoken line with the browser's speech recognition
// (Chrome and Edge; Safari too on newer versions). Nothing is recorded or
// saved by this app.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Heard {
  /** The best guess first, then other guesses */
  texts: string[];
  error?: "mic_denied" | "didnt_hear" | "error_generic";
}

const MAX_MS = 15000;

function recognizerClass(): any {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return typeof window !== "undefined" && recognizerClass() !== null;
}

export interface Listening {
  done: Promise<Heard>;
  /** Stop listening and use what was heard so far */
  stop: () => void;
}

export function listenOnce(onWords: (text: string) => void): Listening {
  const Rec = recognizerClass();
  const rec = new Rec();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 3;

  let finalText = "";
  let liveText = "";
  let alternatives: string[] = [];
  let error: Heard["error"];

  const done = new Promise<Heard>((resolve) => {
    const timer = setTimeout(() => rec.stop(), MAX_MS);

    rec.onresult = (e: any) => {
      let fin = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else interim += r[0].transcript;
      }
      finalText = fin.trim();
      liveText = `${fin} ${interim}`.trim();
      const last = e.results[e.results.length - 1];
      if (e.results.length === 1 && last.isFinal) {
        alternatives = Array.from(last as ArrayLike<any>).map((a: any) => String(a.transcript).trim());
      }
      onWords(liveText);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") error = "mic_denied";
      else if (e.error === "no-speech") error = "didnt_hear";
      else if (e.error !== "aborted") error = "error_generic";
    };
    rec.onend = () => {
      clearTimeout(timer);
      const best = finalText || liveText;
      const texts = [best, ...alternatives.filter((a) => a && a !== best)].filter(Boolean);
      resolve({ texts, error: texts.length ? undefined : (error ?? "didnt_hear") });
    };
  });

  try {
    rec.start();
  } catch {
    rec.onend?.();
  }
  return { done, stop: () => rec.stop() };
}
