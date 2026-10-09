import graph from "../../data/fixtures/nirvana-v1/graph.json";
import manifest from "../../data/fixtures/nirvana-v1/manifest.json";
import { useTranslation } from "react-i18next";
import { buildEvidenceViewModel } from "./evidence-model.ts";

const model = buildEvidenceViewModel(graph, manifest.entry_evidence_id);

export function LegacyEvidencePage() {
  const { t } = useTranslation();
  return (
    <div className="app-shell legacy-evidence">
      <header className="masthead">
        <a className="brand" href="/" aria-label={t("legacy.home")}>
          {t("legacy.brand")}
        </a>
        <div className="snapshot" aria-label={t("legacy.snapshot")}>
          <span className="status-dot" aria-hidden="true" />
          {manifest.snapshot_id}
        </div>
      </header>

      <main>
        <section className="relation-section" aria-labelledby="relation-heading">
          <div className="section-label">{t("legacy.evidencePath")}</div>
          <h1 id="relation-heading">{model.heading}</h1>
          <p className="relation-conclusion">{model.relationLabel}</p>

          <div className="relation-visual" aria-label={model.relationLabel}>
            <div className="style-node parent-node">
              <span className="node-class">{t("legacy.parentStyle")}</span>
              <strong>Alternative Rock</strong>
            </div>
            <div className="bridge" aria-hidden="true">
              <span className="bridge-line" />
              <span className="bridge-label">{t("legacy.subgenreOf")}</span>
            </div>
            <div className="style-node child-node">
              <span className="node-class">{t("legacy.childStyle")}</span>
              <strong>Grunge</strong>
            </div>
          </div>

          <p className="storage-note">{model.storageNote}</p>
        </section>

        <section className="evidence-section" aria-labelledby="evidence-heading">
          <div className="section-heading-row">
            <div>
              <div className="section-label">{t("legacy.verifiedAssertion")}</div>
              <h2 id="evidence-heading">{t("legacy.sourceEvidence")}</h2>
            </div>
            <span className="assertion-badge">{model.assertionKind}</span>
          </div>

          <p className="claim">{model.evidence.claim}</p>
          <dl className="evidence-metadata">
            <div><dt>{t("legacy.dataset")}</dt><dd>{model.evidence.sourceDataset}</dd></div>
            <div><dt>{t("legacy.record")}</dt><dd>{model.evidence.sourceRecordId}</dd></div>
            <div><dt>{t("legacy.licensePartition")}</dt><dd>{model.evidence.licensePartition}</dd></div>
            <div><dt>{t("legacy.retrieved")}</dt><dd>{model.evidence.retrievedAt.slice(0, 10)}</dd></div>
          </dl>
          <a className="source-link" href={model.evidence.sourceUrl} target="_blank" rel="noreferrer noopener">
            {t("legacy.openSource")} <span aria-hidden="true">↗</span>
          </a>
        </section>

        <section className="fixture-section" aria-labelledby="artists-heading">
          <div className="section-label">{t("legacy.fixtureCohort")}</div>
          <h2 id="artists-heading">{t("legacy.artists")}</h2>
          <ul className="artist-grid">
            {model.artists.map((artist) => (
              <li key={artist}><span className="artist-star" aria-hidden="true" />{artist}</li>
            ))}
          </ul>
        </section>

        <section className="releases-section" aria-labelledby="releases-heading">
          <div className="section-label">{t("legacy.discography")}</div>
          <h2 id="releases-heading">{t("legacy.releaseGroups")}</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">{t("legacy.title")}</th><th scope="col">{t("legacy.type")}</th><th scope="col">{t("legacy.firstRelease")}</th></tr></thead>
              <tbody>
                {model.releaseGroups.map((releaseGroup) => (
                  <tr key={releaseGroup.title}>
                    <th scope="row">{releaseGroup.title}</th>
                    <td><span className={`type-marker type-${releaseGroup.type.toLowerCase()}`} />{releaseGroup.type}</td>
                    <td>{releaseGroup.date ?? t("legacy.unknown")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer><span>{t("legacy.canonicalFixture")}</span><code>{manifest.payload_sha256.slice(0, 23)}...</code></footer>
    </div>
  );
}
