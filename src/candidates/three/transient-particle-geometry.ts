import * as THREE from "three";

export type TransientParticleShape = "ring" | "shell";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const geometryCache = new Map<string, THREE.BufferGeometry>();

export function buildTransientParticleGeometry(
  shape: TransientParticleShape,
  pointCount: number,
): THREE.BufferGeometry {
  const count = Math.max(8, Math.trunc(pointCount));
  const cacheKey = `${shape}:${count}`;
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;

  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    if (shape === "ring") {
      const angle = index / count * Math.PI * 2;
      positions[offset] = Math.cos(angle);
      positions[offset + 1] = Math.sin(angle);
      positions[offset + 2] = 0;
      continue;
    }

    const y = 1 - (2 * (index + 0.5)) / count;
    const horizontalRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * GOLDEN_ANGLE;
    positions[offset] = Math.cos(angle) * horizontalRadius;
    positions[offset + 1] = y;
    positions[offset + 2] = Math.sin(angle) * horizontalRadius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  geometryCache.set(cacheKey, geometry);
  return geometry;
}
