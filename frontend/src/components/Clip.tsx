// Clip, the paperclip guide. Clip gives one short instruction at a time, in
// the learner's language with simple English underneath. Tap the speaker to
// hear it in your language; tap the English to hear the English.

import { useLang } from "../i18n";
import { sayEnglish } from "../speech";

export function ClipFace({ size = 64, mood = "happy" }: { size?: number; mood?: "happy" | "cheer" }) {
  return (
    <svg className={`clip-face clip-${mood}`} width={size * 0.62} height={size} viewBox="0 0 60 100" aria-hidden="true">
      <path
        d="M22 30 V74 a8 8 0 0 0 16 0 V18 a14 14 0 0 0 -28 0 V80 a20 20 0 0 0 40 0 V30"
        fill="none"
        stroke="var(--clip)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="44" r="8" fill="#fff" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="43" cy="44" r="8" fill="#fff" stroke="var(--ink)" strokeWidth="2" />
      <circle className="clip-eye" cx="19" cy="45" r="3.6" fill="var(--ink)" />
      <circle className="clip-eye" cx="45" cy="45" r="3.6" fill="var(--ink)" />
      <circle cx="12" cy="57" r="3.5" fill="#ff9db0" opacity="0.8" />
      <circle cx="48" cy="57" r="3.5" fill="#ff9db0" opacity="0.8" />
      {mood === "cheer" ? (
        <path d="M21 56 q9 12 18 0 z" fill="var(--ink)" />
      ) : (
        <path d="M22 57 q8 7 16 0" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      )}
    </svg>
  );
}

interface Props {
  k: string;
  vars?: Record<string, string | number>;
  mood?: "happy" | "cheer";
  size?: number;
}

/** Clip with a speech bubble. */
export function Clip({ k, vars, mood = "happy", size = 72 }: Props) {
  const { language, t, en } = useLang();
  const native = t(k, vars);
  const english = en(k, vars);
  return (
    <div className="clip">
      <ClipFace size={size} mood={mood} />
      <div className="clip-bubble" role="status">
        <button type="button" className="clip-native" lang="en" dir="ltr" onClick={() => sayEnglish(english)}>
          {english}
        </button>
        {english !== native && (
          <p className="clip-en" lang={language.code}>
            {native}
          </p>
        )}
      </div>
    </div>
  );
}
