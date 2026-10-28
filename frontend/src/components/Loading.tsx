import { Bi, useLang } from "../i18n";
import { Icon } from "./Icon";

/** Shown while a lesson, quiz, or practice situation loads, so the screen is never blank. */
export function Loading() {
  const { t } = useLang();
  return (
    <div className="loading" role="status">
      <span className="loading-sheet" aria-hidden="true">
        <Icon name="form" size={56} />
        <span className="loading-sweep" />
      </span>
      <span>{t("loading")}</span>
    </div>
  );
}

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useLang();
  return (
    <div className="load-failed">
      <p className="notice notice-bad" role="alert">
        {t("error_generic")}
      </p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        <Icon name="replay" />
        <Bi k="try_again" />
      </button>
    </div>
  );
}
