import type { UniverseOverviewViewModel } from "../../experiment/viewmodel/universe-overview-model.ts";
import type { UniverseState } from "./universe-navigation.ts";

export type DetailDepth = 0 | 1 | 2;
export type DetailDirection = "none" | "forward" | "back";

export interface SceneDensityProfile {
  backgroundCount: number;
  styleParticleCount: number;
  lowDetailStyleParticleCount: number;
  compactLabels: boolean;
  maxArtistStars: number;
  maxReleaseOrbits: number;
}

export interface UniverseSearchMatch {
  active: boolean;
  artistIds: Set<string>;
  styleIds: Set<string>;
}

export function universeDetailDepth(state: UniverseState): DetailDepth {
  if (state.artist_id) return 2;
  if (state.focus_id) return 1;
  return 0;
}

export function universeDetailDirection(
  previous: DetailDepth,
  next: DetailDepth,
): DetailDirection {
  if (next === previous) return "none";
  return next > previous ? "forward" : "back";
}

export function sceneDensityProfile(width: number, depth: DetailDepth): SceneDensityProfile {
  if (width < 600) {
    return depth === 2
      ? { backgroundCount: 520, styleParticleCount: 160, lowDetailStyleParticleCount: 20, compactLabels: true, maxArtistStars: 60, maxReleaseOrbits: 12 }
      : { backgroundCount: 680, styleParticleCount: 210, lowDetailStyleParticleCount: 24, compactLabels: true, maxArtistStars: 60, maxReleaseOrbits: 12 };
  }
  if (depth === 2) {
    return { backgroundCount: 900, styleParticleCount: 300, lowDetailStyleParticleCount: 32, compactLabels: true, maxArtistStars: 120, maxReleaseOrbits: 24 };
  }
  if (depth === 1) {
    return { backgroundCount: 1_250, styleParticleCount: 410, lowDetailStyleParticleCount: 42, compactLabels: false, maxArtistStars: 120, maxReleaseOrbits: 24 };
  }
  return { backgroundCount: 1_600, styleParticleCount: 520, lowDetailStyleParticleCount: 52, compactLabels: false, maxArtistStars: 120, maxReleaseOrbits: 24 };
}

export function formatAnimatedCount(value: number, minimumDigits = 1): string {
  return Math.max(0, Math.trunc(value)).toString().padStart(minimumDigits, "0");
}

export function buildUniverseSearchMatch(
  model: UniverseOverviewViewModel,
  resultIds: string[],
): UniverseSearchMatch {
  const artistIds = new Set<string>();
  const styleIds = new Set<string>();
  const artistById = new Map(model.artists.map((artist) => [artist.internal_id, artist]));
  const knownStyleIds = new Set(model.styles.map((style) => style.internal_id));

  for (const resultId of resultIds) {
    if (knownStyleIds.has(resultId)) styleIds.add(resultId);
    const artist = artistById.get(resultId);
    if (!artist) continue;
    artistIds.add(resultId);
    styleIds.add(artist.style_id);
  }

  return {
    active: artistIds.size > 0 || styleIds.size > 0,
    artistIds,
    styleIds,
  };
}
