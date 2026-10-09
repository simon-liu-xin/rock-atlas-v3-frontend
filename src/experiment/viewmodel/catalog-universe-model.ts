import type { ArtistSummary, ReleaseGroupSummary, RelationDetail, UniverseOverview } from '../../data/catalog/catalog-repository.ts';
import type { CatalogRootManifestV3 } from '../../data/publication/catalog-exporter-v3.ts';
import type { StyleRelationAssertionV2 } from '../../generated/schema-types.ts';
import type { UniverseOverviewViewModel, UniverseRelation } from './universe-overview-model.ts';

export function buildCatalogUniverseModel(input: {
  generation_id: string; overview: UniverseOverview; counts: CatalogRootManifestV3['counts'];
  focus_id: string | null; artists: readonly ArtistSummary[]; releases: readonly ReleaseGroupSummary[];
  relations: readonly RelationDetail[];
}): UniverseOverviewViewModel {
  const names = new Map(input.overview.styles.map((style) => [style.entity_id, style.name]));
  const artists = input.artists.map((artist) => ({ internal_id: artist.entity_id, canonical_name: artist.name,
    style_id: input.focus_id && (artist.presentation_style_ids ?? artist.style_ids).includes(input.focus_id)
      ? input.focus_id : artist.style_ids.find((id) => names.has(id)) ?? input.focus_id ?? '',
    source_url: safeUrl(artist.source_url),
  })).filter((artist) => names.has(artist.style_id));
  const records = new Map([...input.overview.relations, ...input.relations].map((relation) => [relation.entity_id, relation]));
  const assertions = [...records.values()].map((relation): StyleRelationAssertionV2 => relation.assertion ?? {
    assertion_id: `mw:assertion:projection:${relation.entity_id.slice('mw:relation:'.length)}`,
    relation_id: relation.entity_id, claim_key: `mw:claim:${relation.entity_id.slice('mw:relation:'.length)}`,
    relation_type: relation.relation_type as StyleRelationAssertionV2['relation_type'], direction: relation.direction,
    participants: relationParticipants(relation), assertion_kind: relation.assertion_kind ?? 'fact',
    stance: 'supports', review_status: 'accepted', metadata_completeness: 'participants_only',
    claim_scope: { geographies: [], contexts: [] }, time_context: null,
    confidence_band: relation.confidence_band ?? 'medium', evidence_ids: relationEvidence(relation),
    source_datasets: relationSources(relation), snapshot_version: input.generation_id,
    pipeline_version: 'catalog-v3-projection', license_partition: 'unknown',
  });
  const relations = [...records.values()].map((relation): UniverseRelation => {
    const sources = relation.participants.filter((p) => p.role === 'source' || p.role === 'peer');
    const targets = relation.participants.filter((p) => p.role === 'target');
    const from = sources[0]?.style_id ?? '';
    const to = targets[0]?.style_id ?? sources[1]?.style_id ?? '';
    const label = relation.label ?? `${sources.map((p) => names.get(p.style_id) ?? p.style_id).join(' + ')} ${relation.direction === 'directed' ? '→' : '↔'} ${names.get(to) ?? to}`;
    return { internal_id: relation.entity_id, source_id: from, target_id: to,
      source_name: names.get(from) ?? from, target_name: names.get(to) ?? to,
      relation_type: relation.relation_type, direction: relation.direction, assertion_kind: relation.assertion_kind ?? 'fact',
      label, summary: relation.summary ?? label, score: null, coverage_state: 'partial',
      evidence_ids: [...(relation.evidence_ids ?? [])], related_style_ids: relation.participants.map((p) => p.style_id),
    };
  });
  const particleSeed = input.overview.particle_seed ?? hash(input.generation_id);
  const artistPositions = Object.fromEntries(artists.map((artist) => {
    const parent = input.overview.layout[artist.style_id] ?? { x: 0, y: 0, z: 0 };
    const seed = hash(`${artist.internal_id}:${artist.style_id}`);
    const angle = seed / 0xffffffff * Math.PI * 2;
    const radius = 0.25 + (seed % 1000) / 1000 * 0.3;
    return [artist.internal_id, { x: parent.x + Math.cos(angle) * radius,
      y: parent.y + Math.sin(angle) * radius * 0.58, z: parent.z + ((seed % 100) / 100 - 0.5) * 0.25 }];
  }));
  return { snapshot_id: input.generation_id,
    counts: { styles: input.counts.canonical.styles ?? input.overview.styles.length,
      artists: input.counts.canonical.artists ?? 0, release_groups: input.counts.canonical.release_groups ?? 0,
      relations: input.counts.canonical.relations ?? records.size },
    styles: input.overview.styles.map((style) => ({ internal_id: style.entity_id, canonical_name: style.name,
      era: style.era ?? 'unknown', region: style.region ?? '', source_url: safeUrl(style.source_url),
      artist_ids: artists.filter((artist) => artist.style_id === style.entity_id).map((artist) => artist.internal_id),
      representative_artist_ids: artists.filter((artist) => artist.style_id === style.entity_id).slice(0, 2).map((artist) => artist.internal_id),
      path_id: style.path_id ?? null,
    })), artists,
    release_groups: input.releases.map((release) => ({ internal_id: release.entity_id, canonical_name: release.name,
      artist_ids: [...release.artist_ids], primary_type: release.primary_type ?? 'Other', secondary_types: [...release.secondary_types],
      first_release_date: release.first_release_date, source_url: safeUrl(release.source_url) })),
    relations, style_relations_v2: assertions,
    eras: [...new Set(input.overview.styles.map((style) => style.era ?? 'unknown'))],
    regions: [...new Set(input.overview.styles.map((style) => style.region ?? ''))],
    relation_types: [...new Set(relations.map((relation) => relation.relation_type))],
    layout: { style_positions: { ...input.overview.layout }, artist_positions: artistPositions, particle_seed: particleSeed },
  };
}
function hash(value: string) { let v = 2166136261; for (let i = 0; i < value.length; i++) v = Math.imul(v ^ value.charCodeAt(i), 16777619); return v >>> 0; }
function relationParticipants(relation: RelationDetail): StyleRelationAssertionV2['participants'] {
  if (relation.participants.length < 2) throw new Error('A relation requires at least two participants');
  return [...relation.participants] as StyleRelationAssertionV2['participants'];
}
function relationEvidence(relation: RelationDetail): StyleRelationAssertionV2['evidence_ids'] {
  if (!relation.evidence_ids?.length) throw new Error('A published relation requires evidence');
  return [...relation.evidence_ids] as StyleRelationAssertionV2['evidence_ids'];
}
function relationSources(relation: RelationDetail): StyleRelationAssertionV2['source_datasets'] {
  if (!relation.source_datasets?.length) throw new Error('A published relation requires source lineage');
  return [...relation.source_datasets] as StyleRelationAssertionV2['source_datasets'];
}
function safeUrl(value: string | null) { if (!value) return ''; const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
