export interface ParticleVisual {
  haloOpacity: number;
  haloScale: number;
  hitRadius: number;
  pointCount: number;
  radius: number;
}

const SELECTED_ARTIST_VISUAL: ParticleVisual = {
  haloOpacity: 0.34,
  haloScale: 5.8,
  hitRadius: 0.2,
  pointCount: 128,
  radius: 0.056,
};

const EXPANDED_ARTIST_VISUAL: ParticleVisual = {
  haloOpacity: 0.24,
  haloScale: 6.4,
  hitRadius: 0.16,
  pointCount: 72,
  radius: 0.039,
};

const OVERVIEW_ARTIST_VISUAL: ParticleVisual = {
  haloOpacity: 0.18,
  haloScale: 6.4,
  hitRadius: 0.13,
  pointCount: 48,
  radius: 0.025,
};

const RELEASE_VISUAL: ParticleVisual = {
  haloOpacity: 0.3,
  haloScale: 7,
  hitRadius: 0.022,
  pointCount: 18,
  radius: 0.011,
};

const SELECTED_RELEASE_VISUAL: ParticleVisual = {
  ...RELEASE_VISUAL,
  haloOpacity: 0.48,
  haloScale: 10,
};

export function getArtistParticleVisual(selected: boolean, expanded: boolean): ParticleVisual {
  if (selected) return SELECTED_ARTIST_VISUAL;
  return expanded ? EXPANDED_ARTIST_VISUAL : OVERVIEW_ARTIST_VISUAL;
}

export function getReleaseOrbitBodyVisual(selected: boolean): ParticleVisual {
  return selected ? SELECTED_RELEASE_VISUAL : RELEASE_VISUAL;
}
