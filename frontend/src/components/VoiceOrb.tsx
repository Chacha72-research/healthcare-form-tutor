// A soft glowing orb that grows with your voice while the app is listening,
// so a nervous learner can see "it hears me". It reads only the loudness of
// the microphone, in the browser; nothing is recorded or sent anywhere.

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

interface Props {
  listening: boolean;
  /** The other side is talking (free talk): a gentle steady pulse */
  speaking?: boolean;
  /** Keep the microphone open for the whole session (free talk), not just while listening */
  micOn?: boolean;
  size?: number;
  children: ReactNode;
}

export function VoiceOrb({ listening, speaking = false, micOn, size = 112, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const open = micOn ?? listening;

  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    let alive = true;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let frame = 0;

    navigator.mediaDevices
      ?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let smooth = 0;
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) {
            const x = (v - 128) / 128;
            sum += x * x;
          }
          const level = Math.min(1, Math.sqrt(sum / data.length) * 5);
          smooth = smooth * 0.75 + level * 0.25;
          el.style.setProperty("--level", smooth.toFixed(3));
          frame = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => el.classList.add("orb-fallback"));

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      el.style.setProperty("--level", "0");
      el.classList.remove("orb-fallback");
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className={`orb${listening ? " is-listening" : ""}${speaking ? " is-speaking" : ""}`}
      style={{ "--orb": `${size}px` } as CSSProperties}
    >
      <span className="orb-glow" aria-hidden="true" />
      <span className="orb-ring" aria-hidden="true" />
      <span className="orb-ring orb-ring-2" aria-hidden="true" />
      <div className="orb-core">{children}</div>
    </div>
  );
}
