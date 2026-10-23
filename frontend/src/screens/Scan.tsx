import { useEffect, useRef, useState } from "react";
import type { Screen } from "../App";
import { ApiError, explainForm } from "../api";
import { Icon } from "../components/Icon";
import { ListenButton } from "../components/ListenButton";
import { TopBar } from "../components/TopBar";
import { Bi, useLang } from "../i18n";
import { preparePhoto } from "../image";

type Status = "idle" | "reading" | "unreadable" | "error";

export function Scan({ go }: { go: (s: Screen) => void }) {
  const { config, language, voice, t } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStatus("reading");
    try {
      const photo = await preparePhoto(file);
      const data = await explainForm(photo, language.code);
      if (!data.readable) {
        setStatus("unreadable");
        return;
      }
      go({ name: "results", data });
    } catch (err) {
      console.error(err);
      setStatus(err instanceof ApiError && err.status === 400 ? "unreadable" : "error");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  if (!config.features.scan) {
    return (
      <>
        <TopBar go={go} />
        <main className="page">
          <p className="notice">
            <Bi k="scan_unavailable" />
          </p>
        </main>
      </>
    );
  }

  const reading = status === "reading";

  return (
    <>
      <TopBar go={go} />
      <main className="page scan">
        <h1 className="screen-title">
          <Bi k="scan_form" />
        </h1>

        <div className="hint">
          <p>{t("scan_hint")}</p>
          <ListenButton text={t("scan_hint")} voice={voice} label={t("listen")} />
        </div>

        <div className={`viewfinder${preview ? " has-photo" : ""}`} aria-hidden={!preview}>
          {preview ? <img src={preview} alt="" /> : <Icon name="camera" size={64} />}
          {reading && (
            <div className="viewfinder-scan">
              <span />
            </div>
          )}
        </div>

        {reading && (
          <p className="status" role="status">
            {t("reading_form")}
          </p>
        )}
        {status === "unreadable" && <p className="notice notice-bad" role="alert">{t("unreadable")}</p>}
        {status === "error" && <p className="notice notice-bad" role="alert">{t("error_generic")}</p>}

        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          onChange={(e) => onPhoto(e.target.files?.[0])}
          tabIndex={-1}
        />
        <button
          type="button"
          className="btn btn-primary btn-big"
          onClick={() => input.current?.click()}
          disabled={reading}
        >
          <Icon name="camera" />
          <Bi k={preview ? "retake" : "take_photo"} />
        </button>
      </main>
    </>
  );
}
