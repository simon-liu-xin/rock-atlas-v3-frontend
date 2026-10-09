import {
  createResearchEventStore,
  exportResearchEvents,
  type ExperimentAssignment,
  type ResearchEvent,
  type ResearchEventExport,
  type ResearchEventStore,
  withdrawResearchConsent,
} from "./research-events.ts";

interface StartResearchSessionInput {
  study_id: string;
  assignment: ExperimentAssignment;
  participant_alias: string;
  consented_at: string;
}

interface PersistedResearchEvents {
  schema_version: "1.0";
  consent: NonNullable<ResearchEventStore["consent"]>;
  events: ResearchEvent[];
}

export interface BrowserResearchSession {
  store: ResearchEventStore;
  record: (event: ResearchEvent) => boolean;
  export: () => ResearchEventExport;
  invalidate: (reason: "webgl_context_lost") => void;
  withdraw: () => void;
}

export type BrowserResearchLoadResult =
  | { status: "missing" }
  | { status: "corrupt"; error_code: "MW_RESEARCH_STORAGE_CORRUPT" }
  | { status: "ready"; session: BrowserResearchSession };

export function startBrowserResearchSession(
  storage: Storage,
  input: StartResearchSessionInput,
): BrowserResearchSession {
  assertStudyId(input.study_id);
  const store = createResearchEventStore(input);
  const keys = storageKeys(input.study_id);
  try {
    storage.setItem(keys.alias, input.participant_alias);
    persistEvents(storage, keys.events, store);
  } catch (error) {
    storage.removeItem(keys.alias);
    storage.removeItem(keys.events);
    throw storageError(error);
  }
  return createSession(storage, keys, store);
}

export function loadBrowserResearchSession(
  storage: Storage,
  studyId: string,
): BrowserResearchLoadResult {
  assertStudyId(studyId);
  const keys = storageKeys(studyId);
  const alias = storage.getItem(keys.alias);
  const persistedText = storage.getItem(keys.events);
  if (alias === null && persistedText === null) return { status: "missing" };
  if (!alias || !persistedText) return corrupt();

  try {
    const persisted = JSON.parse(persistedText) as PersistedResearchEvents;
    if (!isPersistedResearchEvents(persisted, studyId)) return corrupt();
    const store = createResearchEventStore({
      study_id: persisted.consent.study_id,
      assignment: persisted.consent.assignment,
      participant_alias: alias,
      consented_at: persisted.consent.consented_at,
    });
    for (const event of persisted.events) store.record(event);
    return { status: "ready", session: createSession(storage, keys, store) };
  } catch {
    return corrupt();
  }
}

export function clearBrowserResearchSession(storage: Storage, studyId: string): void {
  assertStudyId(studyId);
  const keys = storageKeys(studyId);
  storage.removeItem(keys.alias);
  storage.removeItem(keys.events);
}

function createSession(
  storage: Storage,
  keys: ReturnType<typeof storageKeys>,
  store: ResearchEventStore,
): BrowserResearchSession {
  return {
    store,
    record(event) {
      const added = store.record(event);
      if (!added) return false;
      try {
        persistEvents(storage, keys.events, store);
      } catch (error) {
        const index = store.events.findIndex((candidate) => candidate.event_id === event.event_id);
        if (index >= 0) store.events.splice(index, 1);
        throw storageError(error);
      }
      return true;
    },
    export() {
      return exportResearchEvents(store);
    },
    invalidate() {
      storage.removeItem(keys.alias);
      storage.removeItem(keys.events);
      withdrawResearchConsent(store);
    },
    withdraw() {
      storage.removeItem(keys.alias);
      storage.removeItem(keys.events);
      withdrawResearchConsent(store);
    },
  };
}

function persistEvents(storage: Storage, key: string, store: ResearchEventStore): void {
  if (!store.consent) throw new Error("research consent is required before persistence");
  const persisted: PersistedResearchEvents = {
    schema_version: "1.0",
    consent: { ...store.consent },
    events: store.events.map((event) => ({ ...event })),
  };
  storage.setItem(key, JSON.stringify(persisted));
}

function isPersistedResearchEvents(
  value: unknown,
  studyId: string,
): value is PersistedResearchEvents {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    record.schema_version !== "1.0" ||
    !record.consent ||
    typeof record.consent !== "object" ||
    !Array.isArray(record.events)
  ) {
    return false;
  }
  const consent = record.consent as Record<string, unknown>;
  return (
    consent.study_id === studyId &&
    (consent.assignment === "3d" || consent.assignment === "2d" || consent.assignment === "editorial") &&
    typeof consent.consented_at === "string"
  );
}

function storageKeys(studyId: string) {
  const prefix = `musicwiki:research:${studyId}`;
  return { alias: `${prefix}:alias`, events: `${prefix}:events` };
}

function storageError(error: unknown): Error {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  const code = name === "QuotaExceededError" ? "MW_RESEARCH_STORAGE_QUOTA" : "MW_RESEARCH_STORAGE_FAILED";
  return new Error(`${code}: unable to persist local research events`);
}

function corrupt(): BrowserResearchLoadResult {
  return { status: "corrupt", error_code: "MW_RESEARCH_STORAGE_CORRUPT" };
}

function assertStudyId(studyId: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(studyId)) throw new Error("invalid study ID");
}
