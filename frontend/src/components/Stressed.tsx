/** A pronunciation guide where capitals mark the stressed syllable: "de-DUC-ti-ble" */
export function Stressed({ say }: { say: string }) {
  return (
    <span className="say" lang="en" dir="ltr">
      {say.split(/(\s+|-)/).map((part, i) =>
        part === "-" ? (
          <span key={i} className="say-dot">
            ·
          </span>
        ) : /[A-Z]/.test(part) && part === part.toUpperCase() ? (
          <strong key={i}>{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
