import { useRef, useState } from "react";
import type { Screen } from "../App";
import { ApiError, readForm } from "../api";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { Bi, useLang } from "../i18n";
import { preparePhoto } from "../image";

const KNOWN_ERRORS = new Set(["unreadable", "picture_needs_ai", "file_too_big", "ai_busy", "no_terms"]);

export function Upload({ go }: { go: (s: Screen) => void }) {
  const { t } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handle(file: Blob, name: string) {
    setReading(true);
    setError(null);
    try {
      let upload = file;
      let uploadName = name;
      // Shrink big phone photos (and turn iPhone HEIC into JPEG) before sending.
      if (file.type.startsWith("image/")) {
        upload = await preparePhoto(file as File);
        uploadName = "form.jpg";
      }
      const data = await readForm(upload, uploadName);
      if (!data.terms.length) {
        setError("no_terms");
        return;
      }
      go({ name: "lesson", reading: data, index: 0 });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "error_generic";
      setError(KNOWN_ERRORS.has(code) ? code : code === "unsupported" ? "unreadable" : "error_generic");
    } finally {
      setReading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function useSample() {
    const resp = await fetch("/sample-form.pdf");
    await handle(await resp.blob(), "sample-form.pdf");
  }

  return (
    <>
      <TopBar go={go} />
      <main className="page upload">
        <h1 className="screen-title">
          <Bi k="upload_title" />
        </h1>
        <p className="hint-plain">{t("upload_hint")}</p>

        <div
          className={`drop${dragging ? " is-dragging" : ""}${reading ? " is-reading" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handle(f, f.name);
          }}
        >
          <div className="drop-sheet" aria-hidden="true">
            <Icon name="form" size={72} />
            {reading && <span className="drop-sweep" />}
          </div>
          {reading && (
            <p className="status" role="status">
              {t("reading_form")}
            </p>
          )}
        </div>

        {error && (
          <p className="notice notice-bad" role="alert">
            {t(error)}
          </p>
        )}

        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf,image/*,text/plain,.txt"
          className="visually-hidden"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f, f.name);
          }}
        />
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary btn-big"
            disabled={reading}
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" />
            <Bi k="choose_file" />
          </button>
          <button type="button" className="btn btn-secondary" disabled={reading} onClick={useSample}>
            <Icon name="form" />
            <Bi k="try_sample" />
          </button>
        </div>
      </main>
    </>
  );
}
