import * as THREE from "three";

export function buildRoundParticleTextureData(size = 32): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const denominator = Math.max(1, size - 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x / denominator) * 2 - 1;
      const dy = (y / denominator) * 2 - 1;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const fade = clamp01((1 - radius) / 0.78);
      const alpha = fade * fade * (3 - 2 * fade);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }

  return data;
}

export function buildRoundParticleTexture(size = 32): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    buildRoundParticleTextureData(size),
    size,
    size,
    THREE.RGBAFormat,
  );
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
