import { useState } from "react";
import { speakParts, type SpeechPart } from "../speech";
import { Icon } from "./Icon";

interface Props {
  parts: SpeechPart[];
  /** Accessible name, e.g. "Listen" in the learner's language */
  label: string;
  size?: "sm" | "md" | "lg";
  /** Short visible tag like "English", for when two listen buttons sit close together */
  tag?: string;
}

export function ListenButton({ parts, label, size = "md", tag }: Props) {
  const [playing, setPlaying] = useState(false);

  async function play() {
    setPlaying(true);
    try {
      await speakParts(parts, true);
    } finally {
      setPlaying(false);
    }
  }

  const iconSize = size === "lg" ? 30 : size === "sm" ? 18 : 22;
  return (
    <button
      type="button"
      className={`listen listen-${size}${tag ? " listen-tag" : ""}${playing ? " is-playing" : ""}`}
      onClick={play}
      aria-label={label}
      title={label}
    >
      <Icon name="speaker" size={iconSize} />
      {tag && (
        <span lang="en" aria-hidden="true">
          {tag}
        </span>
      )}
    </button>
  );
}
