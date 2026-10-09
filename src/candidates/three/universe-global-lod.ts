export const GLOBAL_STYLE_COUNT = 828;
export const GLOBAL_VISIBLE_STYLE_BUDGET = 70;
export const GLOBAL_OVERVIEW_LABEL_BUDGET = 18;
export const GLOBAL_LABEL_REVEAL_ZOOM = 1.35;
export const GLOBAL_BRIDGE_INTENSITY = 0.5;

export type GlobalLabelTier = "overview" | "expanded";

interface StyleBridgeEndpoints {
  source_id: string | null;
  target_id: string | null;
}

export function globalLabelTier(zoom: number): GlobalLabelTier {
  return zoom >= GLOBAL_LABEL_REVEAL_ZOOM ? "expanded" : "overview";
}

export function bridgeIntensity(overview: boolean): number {
  return overview ? GLOBAL_BRIDGE_INTENSITY : 1;
}

export function overviewZoomRatio(
  cameraDistance: number,
  overviewDistance: number,
): number {
  if (!Number.isFinite(cameraDistance) || cameraDistance <= 0) return 1;
  if (!Number.isFinite(overviewDistance) || overviewDistance <= 0) return 1;
  return overviewDistance / cameraDistance;
}

export function filterBridgesForVisibleStyleLabels<T extends StyleBridgeEndpoints>(
  bridges: readonly T[],
  visibleStyleLabelIds: ReadonlySet<string>,
  overview: boolean,
): T[] {
  if (!overview) return [...bridges];
  return bridges.filter((bridge) =>
    bridge.source_id !== null &&
    bridge.target_id !== null &&
    visibleStyleLabelIds.has(bridge.source_id) &&
    visibleStyleLabelIds.has(bridge.target_id)
  );
}
