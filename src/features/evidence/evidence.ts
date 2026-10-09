import type { CandidateViewModelV1 } from "../../generated/schema-types.ts";

export interface RelationEvidenceView {
  relation_id: string;
  relation_label: string;
  relation_summary: string;
  source_name: string;
  target_name: string;
  relation_type: CandidateViewModelV1["relations"][number]["relation_type"];
  assertion_kind: CandidateViewModelV1["relations"][number]["assertion_kind"];
  coverage_state: CandidateViewModelV1["relations"][number]["coverage_state"];
  evidence: CandidateViewModelV1["evidence"];
}

export function openRelationEvidence(
  viewModel: CandidateViewModelV1,
  relationId: string,
): RelationEvidenceView {
  const relation = viewModel.relations.find(
    (candidate) => candidate.internal_id === relationId,
  );
  if (!relation) throw new Error(`Unknown relation ${relationId}.`);

  const evidence = relation.evidence_ids.map((evidenceId) => {
    const record = viewModel.evidence.find(
      (candidate) => candidate.evidence_id === evidenceId,
    );
    if (!record) {
      throw new Error(`Relation ${relationId} is missing evidence ${evidenceId}.`);
    }
    return { ...record };
  });

  return {
    relation_id: relation.internal_id,
    relation_label: relation.label,
    relation_summary: relation.summary,
    source_name: relation.source_name,
    target_name: relation.target_name,
    relation_type: relation.relation_type,
    assertion_kind: relation.assertion_kind,
    coverage_state: relation.coverage_state,
    evidence: evidence as CandidateViewModelV1["evidence"],
  };
}
