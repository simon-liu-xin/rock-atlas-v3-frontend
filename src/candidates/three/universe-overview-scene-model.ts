import type { UniverseState } from "../../app/experiment/universe-navigation.ts";
import type {
  UniverseAssertionKind,
  UniverseOverviewViewModel,
  UniversePoint,
} from "../../experiment/viewmodel/universe-overview-model.ts";
import {
  projectStyleRelations,
  type StyleRelationProjection,
  type StyleRelationSegment,
} from "../../graph/style-relation-projection.ts";
import {
  GLOBAL_OVERVIEW_LABEL_BUDGET,
  GLOBAL_VISIBLE_STYLE_BUDGET,
} from "./universe-global-lod.ts";

export interface UniverseStyleParticleRange {
  style_id: string;
  offset: number;
  count: number;
  color: string;
  detail: "high" | "low";
}

export interface UniverseStyleNucleus {
  style_id: string;
  canonical_name: string;
  position: UniversePoint;
  color: string;
  contextual: boolean;
  detail: "high" | "low";
  selected: boolean;
  filtered: boolean;
}

export interface UniverseArtistStar {
  artist_id: string;
  style_id: string;
  canonical_name: string;
  position: UniversePoint;
  selected: boolean;
  emphasized: boolean;
  dimmed: boolean;
  filtered: boolean;
}

export interface UniverseBridge {
  relation_id: string;
  segment_id: string;
  source_id: string | null;
  target_id: string | null;
  flow_source_id: string | null;
  flow_target_id: string | null;
  source: UniversePoint;
  target: UniversePoint;
  assertion_kind: UniverseAssertionKind;
  relation_type: string;
  visual_kind: StyleRelationProjection["visual_kind"];
  segment_role:
    | "directed"
    | "fusion_input"
    | "fusion_output"
    | "undirected"
    | "gap_terminal";
  label: string;
}

export interface UniverseOrbitBody {
  release_group_id: string;
  artist_id: string;
  canonical_name: string;
  center: UniversePoint;
  position: UniversePoint;
  radius: number;
  tilt: number;
  track_index: number;
  initial_angle: number;
  /** Positive angular velocity in radians per second. */
  angular_velocity: number;
  selected: boolean;
}

export interface UniverseOverviewSceneModel {
  background_positions: Float32Array;
  density_positions: Float32Array;
  density_colors: Float32Array;
  style_particle_ranges: UniverseStyleParticleRange[];
  style_nuclei: UniverseStyleNucleus[];
  artist_stars: UniverseArtistStar[];
  visible_artist_star_ids: string[];
  visible_style_label_ids: string[];
  overview_style_label_ids: string[];
  expanded_style_label_ids: string[];
  visible_artist_label_ids: string[];
  show_style_layer: boolean;
  bridges: UniverseBridge[];
  orbit_bodies: UniverseOrbitBody[];
}

export interface UniverseSceneDensityOptions {
  backgroundCount: number;
  styleParticleCount: number;
  lowDetailStyleParticleCount?: number;
  maxArtistStars?: number;
  maxReleaseOrbits?: number;
}

const styleColors = [
  "#9ea7b3",
  "#71ad91",
  "#70bdc8",
  "#bf789b",
  "#c4a364",
  "#8592ac",
] as const;

const defaultDensity: UniverseSceneDensityOptions = {
  backgroundCount: 1_600,
  styleParticleCount: 520,
  maxArtistStars: 120,
  maxReleaseOrbits: 24,
};

const compactOrbitTracks = [
  { radius: 0.2, tilt: -0.42 },
  { radius: 0.29, tilt: 0.34 },
  { radius: 0.38, tilt: -0.08 },
] as const;

export function compactOrbitTrack(index: number): {
  trackIndex: number;
  radius: number;
  tilt: number;
} {
  const trackIndex = Math.abs(Math.trunc(index)) % 3;
  return { trackIndex, ...compactOrbitTracks[trackIndex]! };
}

export function sampleOrbitPoint(
  center: UniversePoint,
  radius: number,
  tilt: number,
  angle: number,
): UniversePoint {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius * Math.cos(tilt),
    z: center.z + Math.sin(angle) * radius * Math.sin(tilt),
  };
}

export function keplerianOrbitVelocity(radius: number, speedFactor = 1): number {
  const safeRadius = Math.max(0.001, Number.isFinite(radius) ? radius : 0.2);
  const safeFactor = Math.max(0, Number.isFinite(speedFactor) ? speedFactor : 1);
  return 0.28 * Math.pow(0.2 / safeRadius, 1.5) * safeFactor;
}

export function particlePositionsForDetail(
  positions: Float32Array,
  ranges: readonly UniverseStyleParticleRange[],
  detail: UniverseStyleParticleRange["detail"],
): Float32Array {
  const targetRanges = ranges.filter((range) => range.detail === detail);
  const result = new Float32Array(
    targetRanges.reduce((total, range) => total + range.count, 0) * 3,
  );
  let resultOffset = 0;
  for (const range of targetRanges) {
    const start = range.offset * 3;
    const end = start + range.count * 3;
    result.set(positions.subarray(start, end), resultOffset);
    resultOffset += end - start;
  }
  return result;
}

function selectStyleLod(
  model: UniverseOverviewViewModel,
  state: UniverseState,
  focusedStyleContextIds: ReadonlySet<string>,
): {
  overviewStyleLabelIds: string[];
  expandedStyleLabelIds: string[];
} {
  const relationDegree = new Map(model.styles.map((style) => [style.internal_id, 0]));
  for (const relation of model.style_relations_v2) {
    if (
      relation.stance !== "supports" ||
      relation.review_status !== "accepted" ||
      relation.assertion_kind === "candidate"
    ) continue;
    for (const participant of relation.participants) {
      relationDegree.set(
        participant.style_id,
        (relationDegree.get(participant.style_id) ?? 0) + 1,
      );
    }
  }

  const rankedStyleIds = model.styles
    .map((style) => ({
      id: style.internal_id,
      score:
        (style.internal_id === state.focus_id ? 1_000_000 : 0) +
        (focusedStyleContextIds.has(style.internal_id) ? 500_000 : 0) +
        (style.internal_id === "mw:style:rock" ? 100_000 : 0) +
        (style.path_id ? 50_000 : 0) +
        (isExtendedCatalogStyle(style.internal_id) ? 0 : 10_000) +
        (relationDegree.get(style.internal_id) ?? 0) * 1_000,
    }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map(({ id }) => id);
  const expandedStyleLabelIds = rankedStyleIds.slice(0, GLOBAL_VISIBLE_STYLE_BUDGET);

  return {
    overviewStyleLabelIds: expandedStyleLabelIds.slice(0, GLOBAL_OVERVIEW_LABEL_BUDGET),
    expandedStyleLabelIds,
  };
}

function isExtendedCatalogStyle(styleId: string): boolean {
  return styleId.startsWith("mw:style:wikidata:") || styleId.startsWith("mw:mock:style:");
}

export function buildUniverseOverviewSceneModel(
  model: UniverseOverviewViewModel,
  state: UniverseState,
  density: UniverseSceneDensityOptions = defaultDensity,
): UniverseOverviewSceneModel {
  const backgroundParticleCount = Math.max(1, Math.trunc(density.backgroundCount));
  const particlesPerStyle = Math.max(1, Math.trunc(density.styleParticleCount));
  const lowDetailParticlesPerStyle = Math.max(
    1,
    Math.trunc(
      density.lowDetailStyleParticleCount ?? Math.max(24, particlesPerStyle * 0.1),
    ),
  );
  const random = seededRandom(model.layout.particle_seed);
  const backgroundPositions = buildBackgroundPositions(random, backgroundParticleCount);
  const selectedStyle = model.styles.find((style) => style.internal_id === state.focus_id);
  const visibleRelations = model.style_relations_v2
    .filter((relation) =>
      (!selectedStyle ||
        relation.participants.some(
          (participant) => participant.style_id === selectedStyle.internal_id,
        )) &&
      (!state.relation_type || matchesLegacyRelationFilter(relation.relation_type, state.relation_type)),
    );
  const legacyLabelByRelationId = new Map(
    model.relations.map((relation) => [relation.internal_id, relation.label]),
  );
  const bridges = projectStyleRelations(
    visibleRelations,
    model.layout.style_positions,
  ).flatMap((projection) =>
    projectionToBridges(
      projection,
      legacyLabelByRelationId.get(projection.relation_id) ?? projection.relation_type,
    )
  );
  const focusedStyleContextSet = new Set<string>();
  if (selectedStyle) {
    focusedStyleContextSet.add(selectedStyle.internal_id);
    for (const bridge of bridges) {
      if (bridge.source_id) focusedStyleContextSet.add(bridge.source_id);
      if (bridge.target_id) focusedStyleContextSet.add(bridge.target_id);
    }
  }
  const focusedStyleContextIds = selectedStyle
    ? [
        selectedStyle.internal_id,
        ...model.styles
          .map((style) => style.internal_id)
          .filter((styleId) =>
            styleId !== selectedStyle.internal_id && focusedStyleContextSet.has(styleId)
          ),
      ]
    : [];
  const styleLod = selectStyleLod(model, state, focusedStyleContextSet);
  const highDetailStyleIds = new Set(styleLod.expandedStyleLabelIds);
  const totalStyleParticles = model.styles.reduce(
    (total, style) => total + (
      highDetailStyleIds.has(style.internal_id)
        ? particlesPerStyle
        : lowDetailParticlesPerStyle
    ),
    0,
  );
  const densityPositions = new Float32Array(totalStyleParticles * 3);
  const densityColors = new Float32Array(densityPositions.length);
  const styleParticleRanges: UniverseStyleParticleRange[] = [];
  let particleOffset = 0;

  model.styles.forEach((style, styleIndex) => {
    const center = requiredPoint(model.layout.style_positions, style.internal_id);
    const color = styleColors[styleIndex % styleColors.length]!;
    const rgb = hexToRgb(color);
    const styleRandom = seededRandom(hashString(`${model.snapshot_id}:${style.internal_id}:density`));
    const detail = highDetailStyleIds.has(style.internal_id) ? "high" : "low";
    const particleCount = detail === "high" ? particlesPerStyle : lowDetailParticlesPerStyle;
    const offset = particleOffset;
    particleOffset += particleCount;
    styleParticleRanges.push({
      style_id: style.internal_id,
      offset,
      count: particleCount,
      color,
      detail,
    });

    for (let particleIndex = 0; particleIndex < particleCount; particleIndex += 1) {
      const angle = styleRandom() * Math.PI * 2;
      const coreParticle = styleRandom() < 0.78;
      const radius = coreParticle
        ? Math.pow(styleRandom(), 1.38) * (0.34 + styleRandom() * 0.34)
        : 0.42 + Math.pow(styleRandom(), 0.72) * 0.36;
      const lobe = Math.sin(angle * 3 + styleRandom() * 1.2) * 0.1;
      const arrayIndex = (offset + particleIndex) * 3;
      densityPositions[arrayIndex] = center.x + Math.cos(angle) * radius + lobe;
      densityPositions[arrayIndex + 1] = center.y + Math.sin(angle) * radius * 0.56;
      densityPositions[arrayIndex + 2] = center.z + (styleRandom() - 0.5) * radius * 0.52;
      const brightness = 0.8 + styleRandom() * 0.34;
      densityColors[arrayIndex] = rgb.r * brightness;
      densityColors[arrayIndex + 1] = rgb.g * brightness;
      densityColors[arrayIndex + 2] = rgb.b * brightness;
    }
  });

  const visibleArtistLabelIds = selectedStyle
    ? selectPinnedStableIds(
        selectedStyle.artist_ids,
        density.maxArtistStars ?? 120,
        state.artist_id,
      )
    : [];
  const styleById = new Map(model.styles.map((style) => [style.internal_id, style]));

  const artistStars = model.artists.map((artist): UniverseArtistStar => {
    const selected = artist.internal_id === state.artist_id;
    return {
      artist_id: artist.internal_id,
      style_id: artist.style_id,
      canonical_name: artist.canonical_name,
      position: requiredPoint(model.layout.artist_positions, artist.internal_id),
      selected,
      emphasized: state.artist_id ? selected : !state.focus_id || artist.style_id === state.focus_id,
      dimmed: Boolean(state.artist_id && !selected),
      filtered: Boolean(state.era && styleById.get(artist.style_id)?.era !== state.era),
    };
  });

  const selectedArtist = model.artists.find((artist) => artist.internal_id === state.artist_id);
  const visibleArtistStarIds = visibleArtistLabelIds;
  const orbitBodies = selectedArtist
    ? selectPinnedStableItems(
        model.release_groups.filter((releaseGroup) =>
          releaseGroup.artist_ids.includes(selectedArtist.internal_id)
        ),
        density.maxReleaseOrbits ?? 24,
        state.release_group_id,
        (releaseGroup) => releaseGroup.internal_id,
      )
        .map((releaseGroup, index): UniverseOrbitBody => {
          const center = requiredPoint(model.layout.artist_positions, selectedArtist.internal_id);
          const { radius, tilt, trackIndex } = compactOrbitTrack(index);
          const orbitRandom = seededRandom(hashString(
            `${model.snapshot_id}:${selectedArtist.internal_id}:${releaseGroup.internal_id}:orbit`,
          ));
          const initialAngle = wrapRadians(
            0.72 + index * Math.PI * (3 - Math.sqrt(5)) + (orbitRandom() - 0.5) * 0.42,
          );
          const angularVelocity = round(keplerianOrbitVelocity(
            radius,
            0.96 + orbitRandom() * 0.08,
          ));
          return {
            release_group_id: releaseGroup.internal_id,
            artist_id: selectedArtist.internal_id,
            canonical_name: releaseGroup.canonical_name,
            center,
            position: sampleOrbitPoint(center, radius, tilt, initialAngle),
            radius,
            tilt,
            track_index: trackIndex,
            initial_angle: initialAngle,
            angular_velocity: angularVelocity,
            selected: releaseGroup.internal_id === state.release_group_id,
          };
        })
    : [];

  return {
    background_positions: backgroundPositions,
    density_positions: densityPositions,
    density_colors: densityColors,
    style_particle_ranges: styleParticleRanges,
    style_nuclei: model.styles.map((style, index): UniverseStyleNucleus => ({
      style_id: style.internal_id,
      canonical_name: style.canonical_name,
      position: requiredPoint(model.layout.style_positions, style.internal_id),
      color: styleColors[index % styleColors.length]!,
      contextual: !selectedStyle || focusedStyleContextSet.has(style.internal_id),
      detail: highDetailStyleIds.has(style.internal_id) ? "high" : "low",
      selected: style.internal_id === state.focus_id,
      filtered: Boolean(state.era && style.era !== state.era),
    })),
    artist_stars: artistStars,
    visible_artist_star_ids: visibleArtistStarIds,
    visible_style_label_ids: selectedStyle
      ? focusedStyleContextIds
      : styleLod.overviewStyleLabelIds,
    overview_style_label_ids: styleLod.overviewStyleLabelIds,
    expanded_style_label_ids: styleLod.expandedStyleLabelIds,
    visible_artist_label_ids: visibleArtistLabelIds,
    show_style_layer: true,
    bridges,
    orbit_bodies: orbitBodies,
  };
}

function selectPinnedStableIds(
  ids: readonly string[],
  limit: number,
  pinnedId: string | null,
): string[] {
  return selectPinnedStableItems(ids, limit, pinnedId, (id) => id);
}

function selectPinnedStableItems<T>(
  items: readonly T[],
  limit: number,
  pinnedId: string | null,
  idOf: (item: T) => string,
): T[] {
  const boundedLimit = Math.max(0, Math.trunc(limit));
  if (boundedLimit === 0) return [];
  const pinned = pinnedId ? items.find((item) => idOf(item) === pinnedId) : undefined;
  return [
    ...(pinned ? [pinned] : []),
    ...items.filter((item) => !pinned || idOf(item) !== pinnedId),
  ].slice(0, boundedLimit);
}

function projectionToBridges(
  projection: StyleRelationProjection,
  label: string,
): UniverseBridge[] {
  const build = (
    segment: StyleRelationSegment,
    segmentRole: UniverseBridge["segment_role"],
    index: number,
  ): UniverseBridge => {
    const reverseSignal = projection.relation_type === "subgenre_of";
    return {
      relation_id: projection.relation_id,
      segment_id: `${projection.relation_id}:${segmentRole}:${index}`,
      source_id: segment.from_style_id,
      target_id: segment.to_style_id,
      flow_source_id: reverseSignal ? segment.to_style_id : segment.from_style_id,
      flow_target_id: reverseSignal ? segment.from_style_id : segment.to_style_id,
      source: reverseSignal ? segment.to : segment.from,
      target: reverseSignal ? segment.from : segment.to,
      assertion_kind: projection.assertion_kind,
      relation_type: projection.relation_type,
      visual_kind: projection.visual_kind,
      segment_role: segmentRole,
      label,
    };
  };

  if (projection.visual_kind === "fusion_bundle") {
    return [
      ...projection.input_segments.map((segment, index) =>
        build(segment, "fusion_input", index)
      ),
      ...projection.output_segments.map((segment, index) =>
        build(segment, "fusion_output", index)
      ),
    ];
  }
  if (projection.visual_kind === "verified_gap") {
    return projection.terminal_segments.map((segment, index) =>
      build(segment, "gap_terminal", index)
    );
  }
  return projection.output_segments.map((segment, index) =>
    build(
      segment,
      projection.visual_kind === "undirected_bridge" ? "undirected" : "directed",
      index,
    )
  );
}

function matchesLegacyRelationFilter(
  relationType: string,
  legacyFilter: string,
): boolean {
  if (legacyFilter === "influenced_by") return relationType === "influences";
  if (legacyFilter === "candidate_subgenre_of") return relationType === "subgenre_of";
  return relationType === legacyFilter;
}

function buildBackgroundPositions(random: () => number, count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), 0.58);
    const spiral = angle + radius * 2.1;
    positions[index * 3] = Math.cos(spiral) * radius * 4.75 + (random() - 0.5) * 0.48;
    positions[index * 3 + 1] = Math.sin(spiral) * radius * 2.72 + (random() - 0.5) * 0.32;
    positions[index * 3 + 2] = (random() - 0.5) * (0.5 + radius * 1.2);
  }
  return positions;
}

function requiredPoint(
  positions: Record<string, UniversePoint>,
  id: string,
): UniversePoint {
  const point = positions[id];
  if (!point) throw new Error(`Universe scene is missing layout point ${id}.`);
  return point;
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(color.slice(1), 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapRadians(value: number): number {
  const fullTurn = Math.PI * 2;
  const remainder = value % fullTurn;
  return remainder < 0 ? remainder + fullTurn : remainder;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
