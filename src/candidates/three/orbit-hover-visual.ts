export type OrbitInteractionState = "dimmed" | "hovered" | "idle" | "selected";

export interface OrbitHoverPresentation {
  bodyOpacity: number;
  interactionState: OrbitInteractionState;
  speedScale: number;
  trackOpacity: number;
  trackSize: number;
}

export const ORBIT_HOVER_SPEED_SCALE = 0.28;

export function orbitHoverPresentation(
  releaseGroupId: string,
  hoveredReleaseGroupId: string | null,
  selected: boolean,
): OrbitHoverPresentation {
  if (hoveredReleaseGroupId === releaseGroupId) {
    return {
      bodyOpacity: 1,
      interactionState: "hovered",
      speedScale: ORBIT_HOVER_SPEED_SCALE,
      trackOpacity: 1,
      trackSize: 0.032,
    };
  }
  if (hoveredReleaseGroupId) {
    return {
      bodyOpacity: 0.32,
      interactionState: "dimmed",
      speedScale: 1,
      trackOpacity: 0.24,
      trackSize: 0.016,
    };
  }
  return selected
    ? {
        bodyOpacity: 1,
        interactionState: "selected",
        speedScale: 1,
        trackOpacity: 0.96,
        trackSize: 0.026,
      }
    : {
        bodyOpacity: 1,
        interactionState: "idle",
        speedScale: 1,
        trackOpacity: 0.68,
        trackSize: 0.02,
      };
}

export function advanceInteractiveOrbitAngle(
  angle: number,
  elapsedDelta: number,
  angularVelocity: number,
  speedScale: number,
): number {
  if (
    !Number.isFinite(elapsedDelta) ||
    elapsedDelta <= 0 ||
    !Number.isFinite(angularVelocity) ||
    !Number.isFinite(speedScale)
  ) return angle;
  const next = angle + elapsedDelta * angularVelocity * Math.max(0, speedScale);
  const wrapped = next % (Math.PI * 2);
  return wrapped < 0 ? wrapped + Math.PI * 2 : wrapped;
}
