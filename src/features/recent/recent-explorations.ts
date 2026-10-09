import type { ExperimentView } from "../share/semantic-share.ts";

const storageKey = "musicwiki:recent-explorations:v1";
const maximumEntries = 5;
const allowedKeys = new Set([
  "state_schema_version",
  "snapshot",
  "view",
  "path_id",
  "focus_id",
  "question",
  "visited_at",
]);

export interface RecentExploration {
  state_schema_version: "1.0";
  snapshot: string;
  view: ExperimentView;
  path_id: string;
  focus_id: string;
  question: string;
  visited_at: string;
}

export type RecentSnapshotStatus = "current" | "snapshot_changed";

export function loadRecentExplorations(storage: Storage): RecentExploration[] {
  const text = storage.getItem(storageKey);
  if (!text) return [];
  try {
    const input = JSON.parse(text) as unknown;
    if (!Array.isArray(input)) return [];
    return input
      .filter(isRecentExploration)
      .sort((left, right) => right.visited_at.localeCompare(left.visited_at))
      .slice(0, maximumEntries)
      .map((entry) => ({ ...entry }));
  } catch {
    return [];
  }
}

export function recordRecentExploration(storage: Storage, entry: RecentExploration): boolean {
  if (!isRecentExploration(entry)) return false;
  const next = [
    { ...entry },
    ...loadRecentExplorations(storage).filter((candidate) => candidate.path_id !== entry.path_id),
  ].slice(0, maximumEntries);
  try {
    storage.setItem(storageKey, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function clearRecentExplorations(storage: Storage): void {
  storage.removeItem(storageKey);
}

export function getRecentSnapshotStatus(
  entry: RecentExploration,
  currentSnapshot: string,
): RecentSnapshotStatus {
  return entry.snapshot === currentSnapshot ? "current" : "snapshot_changed";
}

function isRecentExploration(value: unknown): value is RecentExploration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return false;
  return (
    record.state_schema_version === "1.0" &&
    typeof record.snapshot === "string" &&
    record.snapshot.length > 0 &&
    (record.view === "3d" || record.view === "2d" || record.view === "editorial") &&
    typeof record.path_id === "string" &&
    /^mw:path:[a-z0-9][a-z0-9-]*$/.test(record.path_id) &&
    typeof record.focus_id === "string" &&
    /^mw:(style|artist|release-group|recording):/.test(record.focus_id) &&
    typeof record.question === "string" &&
    record.question.trim().length > 0 &&
    typeof record.visited_at === "string" &&
    Number.isFinite(Date.parse(record.visited_at))
  );
}
