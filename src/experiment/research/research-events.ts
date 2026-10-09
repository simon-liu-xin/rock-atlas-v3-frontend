export type ExperimentAssignment = "3d" | "2d" | "editorial";

export type ResearchEventType =
  | "path_opened"
  | "relation_opened"
  | "artist_opened"
  | "recording_opened"
  | "next_hop"
  | "share_created";

export interface ResearchEvent {
  event_id: string;
  event_type: ResearchEventType;
  occurred_at: string;
  path_id: string;
  action_id: string | null;
}

export interface ResearchConsent {
  study_id: string;
  assignment: ExperimentAssignment;
  consented_at: string;
}

export interface ResearchEventExport {
  schema_version: "1.0";
  study_id: string;
  assignment: ExperimentAssignment;
  events: ResearchEvent[];
}

interface ResearchEventStoreInput {
  study_id: string;
  assignment: ExperimentAssignment;
  participant_alias: string;
  consented_at: string | null;
}

export interface ResearchEventStore {
  alias: string | null;
  consent: ResearchConsent | null;
  events: ResearchEvent[];
  record: (event: ResearchEvent) => boolean;
}

const eventKeys = new Set(["event_id", "event_type", "occurred_at", "path_id", "action_id"]);
const eventTypes = new Set<ResearchEventType>([
  "path_opened",
  "relation_opened",
  "artist_opened",
  "recording_opened",
  "next_hop",
  "share_created",
]);

export function createResearchEventStore(input: ResearchEventStoreInput): ResearchEventStore {
  if (!input.study_id || !input.participant_alias) throw new Error("study and alias are required");
  const events: ResearchEvent[] = [];
  const consent = input.consented_at
    ? {
        study_id: input.study_id,
        assignment: input.assignment,
        consented_at: input.consented_at,
      }
    : null;

  const store: ResearchEventStore = {
    alias: input.participant_alias,
    consent,
    events,
    record(event) {
      validateEvent(event);
      if (!store.consent) throw new Error("research consent is required before recording events");
      if (events.some((candidate) => candidate.event_id === event.event_id)) return false;
      events.push({ ...event });
      return true;
    },
  };
  return store;
}

export function exportResearchEvents(store: ResearchEventStore): ResearchEventExport {
  if (!store.consent) throw new Error("research consent is required before export");
  return {
    schema_version: "1.0",
    study_id: store.consent.study_id,
    assignment: store.consent.assignment,
    events: store.events.map((event) => ({ ...event })),
  };
}

export function withdrawResearchConsent(store: ResearchEventStore): void {
  store.events.splice(0, store.events.length);
  store.alias = null;
  store.consent = null;
}

function validateEvent(event: ResearchEvent): void {
  const unknownKeys = Object.keys(event).filter((key) => !eventKeys.has(key));
  if (unknownKeys.length) throw new Error(`unknown field in research event: ${unknownKeys.join(", ")}`);
  if (!event.event_id || !event.path_id || !event.occurred_at) {
    throw new Error("research event ID, path, and timestamp are required");
  }
  if (!eventTypes.has(event.event_type)) throw new Error("unknown research event type");
  if (!Number.isFinite(Date.parse(event.occurred_at))) throw new Error("invalid event timestamp");
  if (event.action_id !== null && !event.action_id.startsWith("mw:action:")) {
    throw new Error("invalid research action ID");
  }
}
