// Simple line icons drawn for this app. Learners who read little English
// lean on these, so each one is a plain picture of the action.
import type { JSX } from "react";

const paths: Record<string, JSX.Element> = {
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  check: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="m8 12.5 3 3 5-6.5" />
    </>
  ),
  chat: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />
      <path d="M8.5 9h7M8.5 12h4.5" />
    </>
  ),
  speaker: (
    <>
      <path d="M5 9.5h3l4.5-4v13L8 14.5H5z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" />
    </>
  ),
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  back: <path d="M14.5 6 8.5 12l6 6" />,
  desk: (
    <>
      <rect x="5.5" y="5" width="13" height="16" rx="2" />
      <path d="M9.5 3.5h5v3h-5zM8.5 11h7M8.5 14.5h7M8.5 18h4" />
    </>
  ),
  phone: (
    <path d="M7 4h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 2-2z" />
  ),
  pill: (
    <>
      <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" />
      <path d="m9.7 8.7 4.6 6.6" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V20.5" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
};

export function Icon({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.chat}
    </svg>
  );
}
