import { ExternalLink, FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { RelationEvidenceView } from "../../features/evidence/evidence.ts";

interface EvidenceDrawerProps {
  evidence: RelationEvidenceView;
  online: boolean;
  onClose: () => void;
}

export function EvidenceDrawer({ evidence, online, onClose }: EvidenceDrawerProps) {
  const { t } = useTranslation();
  const directionKey = evidence.relation_type === "subgenre_of"
    ? "evidence.direction.childParent"
    : evidence.relation_type === "influenced_by"
      ? "evidence.direction.influencedBy"
      : "evidence.direction.undirected";
  return (
    <aside
      className="evidence-drawer"
      aria-labelledby="drawer-heading"
      aria-modal="true"
      data-evidence-ids={evidence.evidence.map((record) => record.evidence_id).join("|")}
      role="dialog"
    >
      <header>
        <div>
          <p className="section-kicker">{t("evidence.kicker")}</p>
          <h2 id="drawer-heading">{evidence.relation_label}</h2>
        </div>
        <button
          autoFocus
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label={t("candidate.closeEvidence")}
        >
          <X aria-hidden="true" size={20} />
        </button>
      </header>

      <div className="drawer-relation-meta">
        <span className={`assertion assertion-${evidence.assertion_kind}`}>
          {t(`evidence.assertion.${evidence.assertion_kind}`)}
        </span>
        <span title={t(`coverage.${evidence.coverage_state}.explanation`)}>
          {t(`coverage.${evidence.coverage_state}.label`)}
        </span>
      </div>
      <p className="drawer-summary">{evidence.relation_summary}</p>

      <div className="drawer-path" aria-label={t("evidence.direction")}>
        <strong>{evidence.source_name}</strong>
        <span>{evidence.relation_type}</span>
        <strong>{evidence.target_name}</strong>
        <small>{t(directionKey)}</small>
      </div>

      <div className="evidence-records">
        {evidence.evidence.map((record) => (
          <section key={record.evidence_id}>
            <div className="evidence-source-row">
              <FileText aria-hidden="true" size={16} />
              <strong>{record.source_dataset}</strong>
            </div>
            <p>{record.claim}</p>
            <dl>
              <div>
                <dt>{t("evidence.record")}</dt>
                <dd>{record.source_record_id}</dd>
              </div>
              <div>
                <dt>{t("evidence.snapshot")}</dt>
                <dd>{record.snapshot_version}</dd>
              </div>
              <div>
                <dt>{t("evidence.license")}</dt>
                <dd>{record.license_partition}</dd>
              </div>
            </dl>
            {record.source_url.startsWith("https://") ? (
              <a href={record.source_url} target="_blank" rel="noreferrer noopener">
                {t("evidence.openSource")}
                {!online ? <small className="network-required">{t("common.networkRequired")}</small> : null}
                <ExternalLink aria-hidden="true" size={15} />
              </a>
            ) : (
              <code>{record.source_url}</code>
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}
