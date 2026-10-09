import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ExperimentReadinessResult } from "../../experiment/readiness/experiment-readiness.ts";

interface ExperimentReadinessPageProps {
  result: ExperimentReadinessResult | { status: "loading" };
  onRetry: () => void;
}

export function ExperimentReadinessPage({ result, onRetry }: ExperimentReadinessPageProps) {
  const { t } = useTranslation();
  if (result.status === "loading") {
    return (
      <div className="entry-shell readiness-shell">
        <header className="experiment-topbar">
          <span className="wordmark">{t("app.name")}</span>
          <div className="snapshot-meta">{t("readiness.meta")}</div>
        </header>
        <main className="study-main">
          <section className="study-panel" role="status" aria-labelledby="readiness-loading-heading">
            <p className="section-kicker">{t("readiness.loadingKicker")}</p>
            <h1 id="readiness-loading-heading">{t("readiness.loadingHeading")}</h1>
            <p>{t("readiness.loadingDetail")}</p>
          </section>
        </main>
      </div>
    );
  }

  if (result.status === "ready") return null;
  const messageKey = `readiness.error.${result.error_code}`;
  return (
    <div className="entry-shell readiness-shell">
      <header className="experiment-topbar">
        <span className="wordmark">{t("app.name")}</span>
        <div className="snapshot-meta">{t("readiness.meta")} · {result.status}</div>
      </header>
      <main className="study-main">
        <section
          className="study-panel"
          role={result.status === "empty" ? "status" : "alert"}
          aria-labelledby="readiness-error-heading"
        >
          <AlertTriangle aria-hidden="true" className="study-warning" size={28} />
          <p className="section-kicker">{result.error_code}</p>
          <h1 id="readiness-error-heading">{t(`${messageKey}.heading`)}</h1>
          <p>{t(`${messageKey}.detail`)}</p>
          {result.status !== "empty" ? (
            <button className="secondary-action" type="button" onClick={onRetry}>
              <RefreshCw aria-hidden="true" size={16} />
              {t("readiness.retry")}
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
