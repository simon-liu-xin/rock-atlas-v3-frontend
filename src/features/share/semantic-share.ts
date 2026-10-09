import type {
  CandidateViewModelV1,
  ExperimentViewStateV1,
} from "../../generated/schema-types.ts";

export type ExperimentView = ExperimentViewStateV1["view"];

export type SemanticShareState = ExperimentViewStateV1;

interface ShareSelection {
  relation_id?: string;
  evidence_id?: string;
  filters?: NonNullable<SemanticShareState["filters"]>;
}

const supportedRelationTypes = new Set([
  "subgenre_of",
  "candidate_subgenre_of",
  "associated_with",
  "sounds_like",
  "influenced_by",
  "backlash_against",
  "hybrid_of",
  "likely_precedes",
]);
const supportedAssertionKinds = new Set(["fact", "inferred", "candidate"]);

export function buildSemanticShareUrl(
  origin: string,
  view: ExperimentView,
  viewModel: CandidateViewModelV1,
  selection: ShareSelection = {},
): string {
  const url = new URL(`/experiment/${view}`, origin);
  url.searchParams.set("state_schema_version", "1.0");
  url.searchParams.set("snapshot", viewModel.snapshot_id);
  url.searchParams.set("path", viewModel.path_id);
  url.searchParams.set("focus_id", viewModel.question.focus_id);
  if (selection.relation_id) url.searchParams.set("relation_id", selection.relation_id);
  if (selection.evidence_id) url.searchParams.set("evidence_id", selection.evidence_id);
  for (const relationType of [...(selection.filters?.relation_types ?? [])].sort()) {
    url.searchParams.append("relation_type", relationType);
  }
  for (const assertionKind of [...(selection.filters?.assertion_kinds ?? [])].sort()) {
    url.searchParams.append("assertion_kind", assertionKind);
  }
  if (selection.filters?.from_year !== undefined) {
    url.searchParams.set("from_year", String(selection.filters.from_year));
  }
  if (selection.filters?.to_year !== undefined) {
    url.searchParams.set("to_year", String(selection.filters.to_year));
  }
  return url.toString();
}

export function parseSemanticShareUrl(value: string): SemanticShareState {
  const url = new URL(value, "https://musicwiki.local");
  const match = /^\/experiment\/(3d|2d|editorial)$/.exec(url.pathname);
  const view = match?.[1];
  if (view !== "3d" && view !== "2d" && view !== "editorial") {
    throw new Error(`Unsupported experiment share URL: ${url.pathname}`);
  }

  const stateSchemaVersion = url.searchParams.get("state_schema_version") || "1.0";
  if (stateSchemaVersion !== "1.0") {
    throw new Error(`Unsupported experiment share URL: state schema ${stateSchemaVersion}.`);
  }

  const snapshot = requiredParameter(url, "snapshot");
  const pathId = requiredParameter(url, "path");
  const focusId = requiredParameter(url, "focus_id");
  if (!pathId.startsWith("mw:path:") || !focusId.startsWith("mw:style:")) {
    throw new Error("Unsupported experiment share URL: invalid semantic IDs.");
  }

  const relationId = url.searchParams.get("relation_id") || undefined;
  const evidenceId = url.searchParams.get("evidence_id") || undefined;
  const filters = readSemanticFilters(url);
  return {
    state_schema_version: "1.0",
    view,
    snapshot,
    path_id: pathId,
    focus_id: focusId,
    ...(relationId ? { relation_id: relationId } : {}),
    ...(evidenceId ? { evidence_id: evidenceId } : {}),
    ...(filters ? { filters } : {}),
  };
}

function readSemanticFilters(url: URL): NonNullable<SemanticShareState["filters"]> | undefined {
  const filters: NonNullable<SemanticShareState["filters"]> = {};
  const relationTypes = uniqueSupported(url.searchParams.getAll("relation_type"), supportedRelationTypes);
  const assertionKinds = uniqueSupported(url.searchParams.getAll("assertion_kind"), supportedAssertionKinds);
  const fromYear = parseYear(url.searchParams.get("from_year"));
  const toYear = parseYear(url.searchParams.get("to_year"));

  if (relationTypes.length > 0) {
    filters.relation_types = relationTypes as NonNullable<typeof filters.relation_types>;
  }
  if (assertionKinds.length > 0) {
    filters.assertion_kinds = assertionKinds as NonNullable<typeof filters.assertion_kinds>;
  }
  if (fromYear !== undefined) filters.from_year = fromYear;
  if (toYear !== undefined) filters.to_year = toYear;
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function uniqueSupported(values: string[], supported: ReadonlySet<string>): string[] {
  return [...new Set(values.filter((value) => supported.has(value)))].sort();
}

function parseYear(value: string | null): number | undefined {
  if (!value || !/^\d{4}$/.test(value)) return undefined;
  const year = Number(value);
  return year >= 1800 && year <= 2100 ? year : undefined;
}

function requiredParameter(url: URL, key: string): string {
  const value = url.searchParams.get(key)?.trim();
  if (!value) throw new Error(`Unsupported experiment share URL: missing ${key}.`);
  return value;
}
