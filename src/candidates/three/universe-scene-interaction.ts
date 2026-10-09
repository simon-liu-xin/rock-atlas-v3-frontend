import * as THREE from "three";

export const UNIVERSE_RELEASE_HIT_PROXY_NAME = "universe-release-hit-proxy";
export const UNIVERSE_SCENE_TARGET_USER_DATA_KEY = "universeSceneTarget";

export type UniverseSceneTargetKind = "style" | "artist" | "release";

export interface UniverseSceneTarget {
  id: string;
  kind: UniverseSceneTargetKind;
}

interface SceneIntersection {
  object: Pick<THREE.Object3D, "userData">;
}

interface PositionedSceneIntersection {
  object: Pick<THREE.Object3D, "getWorldPosition" | "userData">;
}

export function createUniverseSceneTargetUserData(
  kind: UniverseSceneTargetKind,
  id: string,
): Record<string, unknown> {
  return {
    [UNIVERSE_SCENE_TARGET_USER_DATA_KEY]: { id, kind },
  };
}

export function readUniverseSceneTarget(
  object: Pick<THREE.Object3D, "userData">,
): UniverseSceneTarget | null {
  const candidate: unknown = object.userData[UNIVERSE_SCENE_TARGET_USER_DATA_KEY];
  if (!candidate || typeof candidate !== "object") return null;

  const target = candidate as Record<string, unknown>;
  if (typeof target.id !== "string" || !isUniverseSceneTargetKind(target.kind)) return null;
  return { id: target.id, kind: target.kind };
}

export function shouldDeferToReleaseTarget(
  intersections: readonly SceneIntersection[],
): boolean {
  return intersections.some(({ object }) => readUniverseSceneTarget(object)?.kind === "release");
}

export function shouldDeferToCloserStyleTarget(
  intersections: readonly PositionedSceneIntersection[],
  currentStyleId: string,
  ray: Pick<THREE.Ray, "distanceSqToPoint">,
): boolean {
  const worldPosition = new THREE.Vector3();
  let closestStyleId: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const { object } of intersections) {
    const target = readUniverseSceneTarget(object);
    if (target?.kind !== "style") continue;
    object.getWorldPosition(worldPosition);
    const distance = ray.distanceSqToPoint(worldPosition);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestStyleId = target.id;
    }
  }

  return closestStyleId !== null && closestStyleId !== currentStyleId;
}

function isUniverseSceneTargetKind(value: unknown): value is UniverseSceneTargetKind {
  return value === "style" || value === "artist" || value === "release";
}
