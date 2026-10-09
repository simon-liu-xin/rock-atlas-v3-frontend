import { ArrowDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ReadyCandidateViewModel } from "../candidate-types.ts";

interface EditorialCandidateProps {
  viewModel: ReadyCandidateViewModel;
  onOpenRelation: (relationId: string) => void;
}

export function EditorialCandidate({
  viewModel,
  onOpenRelation,
}: EditorialCandidateProps) {
  const { t } = useTranslation();
  return (
    <section
      className="candidate-stage editorial-stage"
      data-artist-ids={viewModel.artists.map((artist) => artist.internal_id).join("|")}
      data-evidence-ids={viewModel.evidence.map((record) => record.evidence_id).join("|")}
      data-focus-id={viewModel.question.focus_id}
      data-od-id="candidate-editorial"
      data-recording-ids={viewModel.recordings.map((recording) => recording.internal_id).join("|")}
      data-relation-ids={viewModel.relations.map((relation) => relation.internal_id).join("|")}
    >
      <div className="editorial-path">
        {viewModel.relations.map((relation, index) => (
          <div className="editorial-step" key={relation.internal_id}>
            <div className="step-index">0{index + 1}</div>
            <div>
              <div className="step-meta">
                <span>{relation.relation_type}</span>
                <span className={`assertion assertion-${relation.assertion_kind}`}>
                  {t(`evidence.assertion.${relation.assertion_kind}`)}
                </span>
              </div>
              <h2>{relation.label}</h2>
              <p>{relation.summary}</p>
              <button
                type="button"
                data-action-id={`mw:action:open-relation-${index + 1}`}
                onClick={() => onOpenRelation(relation.internal_id)}
              >
                {t("editorial.openEvidence")}
              </button>
            </div>
            {index < viewModel.relations.length - 1 ? (
              <ArrowDown className="step-arrow" aria-hidden="true" size={18} />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
