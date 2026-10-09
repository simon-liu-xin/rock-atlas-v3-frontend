import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  clearRecentExplorations,
  getRecentSnapshotStatus,
  loadRecentExplorations,
} from "../../features/recent/recent-explorations.ts";

interface RecentExplorationsProps {
  snapshotId: string;
  onOpenPath: (pathId: string) => void;
  className?: string;
}

export function RecentExplorations({
  snapshotId,
  onOpenPath,
  className = "",
}: RecentExplorationsProps) {
  const { i18n, t } = useTranslation();
  const [entries, setEntries] = useState(() =>
    typeof window === "undefined" ? [] : loadRecentExplorations(window.localStorage),
  );

  function clearRecent() {
    if (typeof window !== "undefined") clearRecentExplorations(window.localStorage);
    setEntries([]);
  }

  if (!entries.length) return null;
  return (
    <section
      aria-labelledby="recent-heading"
      className={`recent-explorations ${className}`.trim()}
      data-od-id="recent-explorations"
    >
      <div className="recent-heading-row">
        <div>
          <p className="section-kicker">{t("recent.kicker")}</p>
          <h2 id="recent-heading">{t("recent.heading")}</h2>
        </div>
        <button
          aria-label={t("recent.clear")}
          className="icon-button"
          onClick={clearRecent}
          title={t("recent.clear")}
          type="button"
        >
          <Trash2 aria-hidden="true" size={17} />
        </button>
      </div>
      <div className="recent-list">
        {entries.map((entry) => (
          <button key={entry.path_id} onClick={() => onOpenPath(entry.path_id)} type="button">
            <span>{entry.question}</span>
            <small>
              {getRecentSnapshotStatus(entry, snapshotId) === "snapshot_changed"
                ? t("recent.snapshotChanged")
                : formatVisitedAt(entry.visited_at, i18n.resolvedLanguage ?? "en", t("recent.visited"))}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

function formatVisitedAt(value: string, locale: string, fallback: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return fallback;
  }
}
