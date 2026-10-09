import type { ExperimentSample } from "../../experiment/viewmodel/candidate-model.ts";
import type { CandidateViewModelV1 } from "../../generated/schema-types.ts";

type CoverageState = CandidateViewModelV1["answer"]["coverage_state"];

export interface ExperimentQueryResult {
  result_id: string;
  result_type: "artist" | "style" | "question";
  label: string;
  detail: string;
  detail_key?: "query.styleNotResolved" | "query.editorialPath";
  match_reason: "exact" | "prefix" | "contains";
  path_id: string | null;
  coverage_state: CoverageState;
}

interface SearchCandidate {
  result_id: string;
  result_type: ExperimentQueryResult["result_type"];
  label: string;
  detail: string;
  detail_key?: ExperimentQueryResult["detail_key"];
  path_id: string | null;
}

export function queryExperiment(
  sample: ExperimentSample,
  input: string,
  limit = 8,
): ExperimentQueryResult[] {
  const query = normalize(input);
  if (!query) return [];

  const styleById = new Map(sample.styles.map((style) => [style.internal_id, style]));
  const candidates: SearchCandidate[] = [
    ...sample.styles.map((style) => ({
      result_id: style.internal_id,
      result_type: "style" as const,
      label: style.canonical_name,
      detail: `${style.era} · ${style.region}`,
      path_id:
        sample.paths.find((path) => path.question.focus_id === style.internal_id)?.path_id ??
        null,
    })),
    ...sample.artists.map((artist) => {
      const styleName = styleById.get(artist.style_id)?.canonical_name;
      return {
        result_id: artist.internal_id,
        result_type: "artist" as const,
        label: artist.canonical_name,
        detail: styleName ?? "",
        ...(!styleName ? { detail_key: "query.styleNotResolved" as const } : {}),
        path_id:
          sample.paths.find((path) => path.artist_ids.includes(artist.internal_id))?.path_id ??
          null,
      };
    }),
    ...sample.paths.map((path) => {
      const styleName = styleById.get(path.question.focus_id)?.canonical_name;
      return {
        result_id: path.path_id,
        result_type: "question" as const,
        label: path.question.text,
        detail: styleName ?? "",
        ...(!styleName ? { detail_key: "query.editorialPath" as const } : {}),
        path_id: path.path_id,
      };
    }),
  ];

  const results: ExperimentQueryResult[] = [];
  for (const candidate of candidates) {
    const matchReason = match(normalize(candidate.label), query);
    if (matchReason) {
      results.push({
        result_id: candidate.result_id,
        result_type: candidate.result_type,
        label: candidate.label,
        detail: candidate.detail,
        ...(candidate.detail_key ? { detail_key: candidate.detail_key } : {}),
        path_id: candidate.path_id,
        match_reason: matchReason,
        coverage_state: candidate.path_id ? "ready" : "not_reviewed",
      });
    }
  }

  return results.sort(
      (left, right) =>
        matchRank(left.match_reason) - matchRank(right.match_reason) ||
        typeRank(left.result_type) - typeRank(right.result_type) ||
        left.label.localeCompare(right.label, "zh-CN"),
    )
    .slice(0, Math.max(0, limit));
}

function match(
  candidate: string,
  query: string,
): ExperimentQueryResult["match_reason"] | null {
  if (candidate === query) return "exact";
  if (candidate.startsWith(query)) return "prefix";
  if (candidate.includes(query)) return "contains";
  return null;
}

function matchRank(reason: ExperimentQueryResult["match_reason"]): number {
  return { exact: 0, prefix: 1, contains: 2 }[reason];
}

function typeRank(type: ExperimentQueryResult["result_type"]): number {
  return { style: 0, artist: 1, question: 2 }[type];
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}
