import { useState } from "react";
import { speak, type Voice } from "../speech";
import { Icon } from "./Icon";

interface Props {
  text: string;
  voice: Voice;
  /** Accessible name, e.g. "Listen" in the learner's language */
  label: string;
  slow?: boolean;
  size?: "md" | "lg";
  /** Short visible tag like "English", for when two listen buttons sit close together */
  tag?: string;
}

export function ListenButton({ text, voice, label, slow = false, size = "md", tag }: Props) {
  const [playing, setPlaying] = useState(false);

  async function play() {
    setPlaying(true);
    try {
      await speak(text, voice, slow);
    } finally {
      setPlaying(false);
    }
  }

  return (
    <button
      type="button"
      className={`listen listen-${size}${tag ? " listen-tag" : ""}${playing ? " is-playing" : ""}`}
      onClick={play}
      aria-label={label}
      title={label}
    >
      <Icon name="speaker" size={size === "lg" ? 30 : 22} />
      {tag && (
        <span lang="en" aria-hidden="true">
          {tag}
        </span>
      )}
    </button>
  );
}
