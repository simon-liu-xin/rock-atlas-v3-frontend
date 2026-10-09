export const BRIDGE_FACT_COLOR = "#00e5ff";
export const BRIDGE_HYPOTHESIS_COLOR = "#5b8cff";

export interface BridgeParticlePresentation {
  coreOpacity: number;
  coreSize: number;
  glowOpacity: number;
  glowSize: number;
}

export function bridgeParticlePresentation(
  intensity: number,
  dimmed: boolean,
): BridgeParticlePresentation {
  const safeIntensity = Math.min(
    1,
    Math.max(0, Number.isFinite(intensity) ? intensity : 0),
  );
  return {
    coreOpacity: (dimmed ? 0.2 : 0.88) * safeIntensity,
    coreSize: 0.025,
    glowOpacity: (dimmed ? 0.06 : 0.28) * safeIntensity,
    glowSize: 0.064,
  };
}
