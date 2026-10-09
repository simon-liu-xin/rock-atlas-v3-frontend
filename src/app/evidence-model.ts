interface StyleRecord {
  internal_id: string;
  canonical_name: string;
}

interface ArtistRecord {
  canonical_name: string;
}

interface ReleaseGroupRecord {
  canonical_name: string;
  first_release_date: string | null;
  primary_type: string;
  secondary_types: string[];
}

interface RelationRecord {
  source_id: string;
  target_id: string;
  relation_type: string;
  assertion_kind: string;
  evidence_ids: string[];
}

interface EvidenceRecord {
  evidence_id: string;
  source_dataset: string;
  source_record_id: string;
  source_url: string;
  claim: string;
  retrieved_at: string;
  license_partition: string;
}

interface EvidenceGraph {
  entities: {
    styles: StyleRecord[];
    artists: ArtistRecord[];
    release_groups: ReleaseGroupRecord[];
  };
  relations: RelationRecord[];
  evidence: EvidenceRecord[];
}

export interface EvidenceViewModel {
  heading: string;
  relationLabel: string;
  storageNote: string;
  assertionKind: string;
  evidence: {
    sourceDataset: string;
    sourceRecordId: string;
    sourceUrl: string;
    claim: string;
    retrievedAt: string;
    licensePartition: string;
  };
  artists: string[];
  releaseGroups: Array<{
    title: string;
    date: string | null;
    type: string;
  }>;
}

export function buildEvidenceViewModel(
  graph: EvidenceGraph,
  evidenceId: string,
): EvidenceViewModel {
  const evidence = graph.evidence.find((record) => record.evidence_id === evidenceId);
  const relation = graph.relations.find((record) => record.evidence_ids.includes(evidenceId));
  if (!evidence || !relation) {
    throw new Error(`Evidence path ${evidenceId} is incomplete.`);
  }

  const source = graph.entities.styles.find((style) => style.internal_id === relation.source_id);
  const target = graph.entities.styles.find((style) => style.internal_id === relation.target_id);
  if (!source || !target) {
    throw new Error(`Relation ${relation.source_id} -> ${relation.target_id} cannot be resolved.`);
  }

  return {
    heading: `${target.canonical_name} → ${source.canonical_name}`,
    relationLabel: `${source.canonical_name} is a subgenre of ${target.canonical_name}`,
    storageNote: `Stored direction: ${source.canonical_name} → ${target.canonical_name} (child → parent)`,
    assertionKind: relation.assertion_kind,
    evidence: {
      sourceDataset: evidence.source_dataset,
      sourceRecordId: evidence.source_record_id,
      sourceUrl: evidence.source_url,
      claim: evidence.claim,
      retrievedAt: evidence.retrieved_at,
      licensePartition: evidence.license_partition,
    },
    artists: graph.entities.artists
      .map((artist) => artist.canonical_name)
      .sort((left, right) => left.localeCompare(right, "en")),
    releaseGroups: [...graph.entities.release_groups]
      .sort((left, right) =>
        (left.first_release_date ?? "9999").localeCompare(right.first_release_date ?? "9999"),
      )
      .map((releaseGroup) => ({
        title: releaseGroup.canonical_name,
        date: releaseGroup.first_release_date,
        type: releaseGroup.secondary_types[0] ?? releaseGroup.primary_type,
      })),
  };
}
