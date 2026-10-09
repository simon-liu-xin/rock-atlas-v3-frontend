export interface NebulaSpiralProfile {
  armCount: number;
  depthScale: number;
  direction: -1 | 1;
  ellipticity: number;
  phase: number;
  twist: number;
}

export function createNebulaSpiralProfile(
  styleId: string,
): NebulaSpiralProfile {
  const random = seededRandom(hashString(styleId));
  return {
    armCount: 2 + Math.floor(random() * 3),
    depthScale: 0.68 + random() * 0.2,
    direction: random() < 0.5 ? -1 : 1,
    ellipticity: 0.72 + random() * 0.2,
    phase: random() * Math.PI * 2,
    twist: 1.65 + random() * 1.05,
  };
}

export function warpParticlesIntoSpiral(
  source: Float32Array,
  profile: NebulaSpiralProfile,
  requestedStrength: number,
): Float32Array {
  if (source.length === 0) return new Float32Array();
  const strength = clamp(requestedStrength, 0, 1);
  const originalCenter = centroid(source);
  let maxRadius = 0;
  for (let index = 0; index < source.length; index += 3) {
    maxRadius = Math.max(
      maxRadius,
      Math.hypot(
        source[index]! - originalCenter.x,
        source[index + 1]! - originalCenter.y,
      ),
    );
  }
  maxRadius = Math.max(maxRadius, 0.0001);

  const result = new Float32Array(source.length);
  for (let index = 0; index < source.length; index += 3) {
    const particleIndex = index / 3;
    const x = source[index]! - originalCenter.x;
    const y = source[index + 1]! - originalCenter.y;
    const z = source[index + 2]! - originalCenter.z;
    const radius = Math.hypot(x, y);
    const normalizedRadius = radius / maxRadius;
    const sourceAngle = Math.atan2(y, x);
    const armAngle =
      profile.phase +
      ((particleIndex % profile.armCount) * Math.PI * 2) / profile.armCount +
      profile.direction * profile.twist * normalizedRadius;
    const angleDelta = Math.atan2(
      Math.sin(armAngle - sourceAngle),
      Math.cos(armAngle - sourceAngle),
    );
    const warpedAngle = sourceAngle + angleDelta * strength;
    const yScale = 1 - strength * (1 - profile.ellipticity);

    result[index] = Math.cos(warpedAngle) * radius;
    result[index + 1] = Math.sin(warpedAngle) * radius * yScale;
    result[index + 2] = z * (1 - strength * (1 - profile.depthScale));
  }

  const warpedCenter = centroid(result);
  for (let index = 0; index < result.length; index += 3) {
    result[index] = result[index]! + originalCenter.x - warpedCenter.x;
    result[index + 1] = result[index + 1]! + originalCenter.y - warpedCenter.y;
    result[index + 2] = result[index + 2]! + originalCenter.z - warpedCenter.z;
  }
  return result;
}

function centroid(values: Float32Array): { x: number; y: number; z: number } {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < values.length; index += 3) {
    x += values[index]!;
    y += values[index + 1]!;
    z += values[index + 2]!;
  }
  const count = values.length / 3;
  return { x: x / count, y: y / count, z: z / count };
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(
    maximum,
    Math.max(minimum, Number.isFinite(value) ? value : 0),
  );
}
