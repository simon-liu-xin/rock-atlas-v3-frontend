import * as THREE from "three";

export function buildLightBridgeCurves(
  startCentroid: THREE.Vector3,
  endCentroid: THREE.Vector3,
  seed: number,
  memberEdgeCount = 3,
): THREE.CatmullRomCurve3[] {
  const direction = endCentroid.clone().sub(startCentroid).normalize();
  const start = startCentroid.clone().addScaledVector(direction, 0.82);
  const end = endCentroid.clone().addScaledVector(direction, -0.58);
  const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0);
  if (perpendicular.lengthSq() < 0.001) perpendicular.set(0, 1, 0);
  perpendicular.normalize();
  const depthNormal = direction.clone().cross(perpendicular).normalize();
  const bendSign = seed % 2 === 0 ? -1 : 1;
  const strandCount = Math.min(3, Math.max(1, Math.floor(memberEdgeCount)));
  const strandOffsets = [[0], [-0.08, 0.08], [-0.12, 0, 0.12]][strandCount - 1]!;

  return strandOffsets.map((strandOffset, strand) => {
    const midpoint = start
      .clone()
      .lerp(end, 0.5)
      .addScaledVector(perpendicular, 0.34 * bendSign + strandOffset)
      .addScaledVector(depthNormal, (strand - (strandCount - 1) / 2) * 0.13);
    return new THREE.CatmullRomCurve3([start, midpoint, end]);
  });
}
