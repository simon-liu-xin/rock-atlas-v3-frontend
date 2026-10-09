import * as THREE from "three";

const geometryCache = new Map<string, THREE.BufferGeometry>();

export function buildParticleOrbitTrackGeometry(
  radius: number,
  trackIndex: number,
): THREE.BufferGeometry {
  const cacheKey = `${radius}:${trackIndex}`;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;

  const slots = Math.max(48, Math.round(48 * radius / 0.09));
  const seed = Math.abs(Math.trunc(trackIndex)) + 1;
  const values: number[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    const phase = slot + seed * 3;
    if (phase % 9 === 0 || phase % 13 === 0) continue;
    const angle = (slot / slots) * Math.PI * 2;
    values.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(values, 3),
  );
  geometry.computeBoundingSphere();
  geometryCache.set(cacheKey, geometry);
  return geometry;
}
