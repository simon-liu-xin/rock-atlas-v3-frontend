import { AlertTriangle, ArrowRight, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ExperimentAssignment } from "../../experiment/research/research-events.ts";

interface ResearchConsentPageProps {
  assignment: ExperimentAssignment;
  errorMessage?: string;
  onConsent: (alias: string) => void;
}

export function ResearchConsentPage({
  assignment,
  errorMessage,
  onConsent,
}: ResearchConsentPageProps) {
  const { t } = useTranslation();
  const [alias, setAlias] = useState("");
  const [consented, setConsented] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (alias.trim() && consented) onConsent(alias.trim());
  }

  return (
    <div className="entry-shell study-shell">
      <header className="experiment-topbar">
        <span className="wordmark">{t("app.name")}</span>
        <div className="snapshot-meta">{t("study.preparation", { assignment })}</div>
      </header>
      <main className="study-main">
        <section className="study-panel" aria-labelledby="study-consent-heading">
          <p className="section-kicker">{t("study.consentKicker")}</p>
          <h1 id="study-consent-heading">{t("study.consentHeading")}</h1>
          <p>{t("study.consentDetail")}</p>
          <form onSubmit={submit}>
            <label>
              <span>{t("study.alias")}</span>
              <input
                autoComplete="off"
                maxLength={48}
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
              />
            </label>
            <label className="study-checkbox">
              <input
                checked={consented}
                type="checkbox"
                onChange={(event) => setConsented(event.target.checked)}
              />
              <span>{t("study.consentCheckbox")}</span>
            </label>
            {errorMessage ? <p className="study-error" role="alert">{errorMessage}</p> : null}
            <button className="primary-action" disabled={!alias.trim() || !consented} type="submit">
              {t("study.enter")}
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export function ResearchCorruptPage({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="entry-shell study-shell">
      <header className="experiment-topbar">
        <span className="wordmark">{t("app.name")}</span>
        <div className="snapshot-meta">{t("study.recordError")}</div>
      </header>
      <main className="study-main">
        <section className="study-panel" aria-labelledby="study-corrupt-heading">
          <AlertTriangle aria-hidden="true" className="study-warning" size={28} />
          <h1 id="study-corrupt-heading">{t("study.corruptHeading")}</h1>
          <p>{t("study.corruptDetail")}</p>
          <button className="secondary-action" type="button" onClick={onDelete}>
            <Trash2 aria-hidden="true" size={16} />
            {t("study.deleteCorrupt")}
          </button>
        </section>
      </main>
    </div>
  );
}
