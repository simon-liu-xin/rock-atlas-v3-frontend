import { ArrowRight, Search, Shuffle } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ExperimentSample } from "../../experiment/viewmodel/candidate-model.ts";
import type { ExperimentView } from "../../features/share/semantic-share.ts";
import { queryExperiment } from "../../features/query/query.ts";
import { RecentExplorations } from "./RecentExplorations.tsx";

interface SharedEntryProps {
  sample: ExperimentSample;
  assignedView: ExperimentView;
  onNavigate: (href: string) => void;
}

export function SharedEntry({ sample, assignedView, onNavigate }: SharedEntryProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const results = useMemo(() => queryExperiment(sample, query), [query, sample]);

  function openPath(pathId: string) {
    const path = sample.paths.find((candidate) => candidate.path_id === pathId);
    if (!path) return;
    const search = new URLSearchParams({
      snapshot: sample.snapshot_id,
      path: path.path_id,
      focus_id: path.question.focus_id,
    });
    onNavigate(`/experiment/${assignedView}?${search.toString()}`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const firstReady = results.find((result) => result.path_id);
    if (firstReady?.path_id) openPath(firstReady.path_id);
  }

  function openRandomPath() {
    const index = Math.floor(Math.random() * sample.paths.length);
    const path = sample.paths[index];
    if (path) openPath(path.path_id);
  }

  return (
    <div className="entry-shell" data-od-id="experiment-entry">
      <header className="experiment-topbar">
        <a className="wordmark" href="/" onClick={(event) => event.preventDefault()}>
          {t("app.name")}
        </a>
        <div className="snapshot-meta">
          <span className="status-dot" aria-hidden="true" />
          {sample.snapshot_id}
        </div>
      </header>

      <main className="entry-main">
        <section className="entry-prompt" aria-labelledby="entry-heading">
          <p className="section-kicker">{t("entry.kicker")}</p>
          <h1 id="entry-heading">{t("entry.heading")}</h1>

          <form className="entry-search" onSubmit={submit} role="search">
            <Search aria-hidden="true" size={20} strokeWidth={1.8} />
            <input
              autoFocus
              aria-label={t("entry.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("entry.search")}
            />
            <button type="submit" aria-label={t("entry.start")} disabled={!results.some((result) => result.path_id)}>
              <ArrowRight aria-hidden="true" size={20} />
            </button>
          </form>

          {query ? (
            <div className="query-results" aria-live="polite">
              {results.length ? (
                results.map((result) => (
                  <button
                    className="query-result"
                    key={result.result_id}
                    type="button"
                    disabled={!result.path_id}
                    onClick={() => result.path_id && openPath(result.path_id)}
                  >
                    <span>
                      <strong>{result.label}</strong>
                      <small>{result.detail_key ? t(result.detail_key) : result.detail}</small>
                    </span>
                    <span
                      className={`coverage coverage-${result.coverage_state}`}
                      title={t(`coverage.${result.coverage_state}.explanation`)}
                    >
                      {t(`coverage.${result.coverage_state}.label`)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="empty-state">{t("entry.noMatches")}</p>
              )}
            </div>
          ) : (
            <div className="example-paths" aria-label={t("entry.examples")}>
              {sample.paths.map((path) => (
                <button key={path.path_id} type="button" onClick={() => openPath(path.path_id)}>
                  <span>{path.question.text}</span>
                  <ArrowRight aria-hidden="true" size={16} />
                </button>
              ))}
            </div>
          )}

          <button className="random-path" type="button" onClick={openRandomPath}>
            <Shuffle aria-hidden="true" size={16} />
            {t("entry.random")}
          </button>

          <RecentExplorations snapshotId={sample.snapshot_id} onOpenPath={openPath} />
        </section>
      </main>
    </div>
  );
}
