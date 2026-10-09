import * as THREE from "three";

export function buildParticleBridgeGeometry(
  curve: THREE.QuadraticBezierCurve3,
  relationId: string,
  overview: boolean,
): THREE.BufferGeometry {
  const random = seededRandom(
    hashString(`${relationId}:${overview ? "overview" : "focused"}`),
  );
  const count = overview ? 20 : 30;
  const positions = new Float32Array(count * 3);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);

  for (let index = 0; index < count; index += 1) {
    const base = (index + 0.5) / count;
    const jitter = (random() - 0.5) * (overview ? 0.026 : 0.018);
    const t = THREE.MathUtils.clamp(base + jitter, 0.01, 0.99);
    curve.getPoint(t, point);
    curve.getTangent(t, tangent);
    side.crossVectors(tangent, up);
    if (side.lengthSq() < 0.0001) side.set(0, 1, 0);
    side.normalize();
    const lane = ((index + (hashString(relationId) % 3)) % 3) - 1;
    point.addScaledVector(side, lane * 0.0045 + (random() - 0.5) * 0.003);
    point.z += (random() - 0.5) * 0.004;
    point.toArray(positions, index * 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeBoundingSphere();
  return geometry;
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
