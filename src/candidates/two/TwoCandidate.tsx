import { useTranslation } from "react-i18next";

import type { ReadyCandidateViewModel } from "../candidate-types.ts";

interface TwoCandidateProps {
  viewModel: ReadyCandidateViewModel;
  onOpenRelation: (relationId: string) => void;
}

const positions = [
  { x: 18, y: 22 },
  { x: 78, y: 20 },
  { x: 79, y: 72 },
] as const;

export function TwoCandidate({ viewModel, onOpenRelation }: TwoCandidateProps) {
  const { t } = useTranslation();
  return (
    <section
      className="candidate-stage two-stage"
      data-artist-ids={viewModel.artists.map((artist) => artist.internal_id).join("|")}
      data-evidence-ids={viewModel.evidence.map((record) => record.evidence_id).join("|")}
      data-focus-id={viewModel.question.focus_id}
      data-od-id="candidate-2d"
      data-recording-ids={viewModel.recordings.map((recording) => recording.internal_id).join("|")}
      data-relation-ids={viewModel.relations.map((relation) => relation.internal_id).join("|")}
    >
      <div className="two-map" aria-label={t("two.mapLabel")}>
        <svg viewBox="0 0 100 88" role="img" aria-labelledby="two-map-title">
          <title id="two-map-title">{viewModel.question.text}</title>
          <defs>
            <marker id="fact-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill="var(--relation-fact)" />
            </marker>
          </defs>
          {viewModel.relations.map((relation, index) => (
            <line
              key={relation.internal_id}
              className={`map-edge edge-${relation.assertion_kind}`}
              x1="50"
              y1="45"
              x2={positions[index]?.x ?? 50}
              y2={positions[index]?.y ?? 10}
              markerEnd={relation.assertion_kind === "fact" ? "url(#fact-arrow)" : undefined}
            />
          ))}
          <circle className="focus-halo" cx="50" cy="45" r="12" />
          <circle className="focus-core" cx="50" cy="45" r="4.5" />
          {positions.map((position, index) => (
            <g key={viewModel.relations[index]?.internal_id}>
              <circle
                className={`target-node target-${viewModel.relations[index]?.assertion_kind}`}
                cx={position.x}
                cy={position.y}
                r="4"
              />
            </g>
          ))}
          {viewModel.artists.map((artist, index) => {
            const angle = (Math.PI * 2 * index) / viewModel.artists.length + 0.4;
            return (
              <circle
                className="artist-node"
                cx={50 + Math.cos(angle) * 18}
                cy={45 + Math.sin(angle) * 18}
                key={artist.internal_id}
                r={index === 0 ? 1.7 : 1.2}
              />
            );
          })}
        </svg>
        <div className="map-focus-label">
          <small>{t("two.focusStyle")}</small>
          <strong>{viewModel.relations[0].source_name}</strong>
        </div>
        {viewModel.relations.map((relation, index) => (
          <button
            className={`map-label map-label-${index + 1}`}
            data-action-id={`mw:action:open-relation-${index + 1}`}
            key={relation.internal_id}
            type="button"
            onClick={() => onOpenRelation(relation.internal_id)}
          >
            <span>{relation.target_name}</span>
            <small>{t(`evidence.assertion.${relation.assertion_kind}`)}</small>
            <span className="sr-only">{relation.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
