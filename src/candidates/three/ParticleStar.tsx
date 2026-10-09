import type { ThreeEvent } from "@react-three/fiber";
import type { RefObject } from "react";
import * as THREE from "three";

import { buildRoundParticleTexture } from "./round-particle-texture.ts";

export interface ParticleStarPalette {
  body: string;
  highlight: string;
  shadow: string;
}

interface ParticleStarProps {
  depthOcclusion?: boolean;
  radius: number;
  pointCount: number;
  hitRadius: number;
  palette: ParticleStarPalette;
  opacity?: number;
  haloOpacity?: number;
  haloScale?: number;
  hitProxyName?: string;
  hitProxyUserData?: Record<string, unknown>;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  visualRef?: RefObject<THREE.Group | null>;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LIGHT_DIRECTION = new THREE.Vector3(-0.48, 0.72, 0.5).normalize();
const sharedRoundTexture = buildRoundParticleTexture(64);
const geometryCache = new Map<string, THREE.BufferGeometry>();

export function patchParticleDepthShaders(
  vertexShader: string,
  fragmentShader: string,
): { vertexShader: string; fragmentShader: string } {
  return {
    vertexShader: vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vParticleFacing;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvec3 particleNormal = normalize(normalMatrix * normalize(position));\nvParticleFacing = particleNormal.z;",
      ),
    fragmentShader: fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vParticleFacing;",
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "float particleRearFade = mix(0.14, 1.0, smoothstep(-0.35, 0.5, vParticleFacing));\nfloat particleLimb = smoothstep(0.28, 0.94, 1.0 - abs(vParticleFacing));\nvec4 diffuseColor = vec4(diffuse * (1.0 + particleLimb * 0.18), opacity * particleRearFade);",
      ),
  };
}

function applyParticleDepthShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  const patched = patchParticleDepthShaders(shader.vertexShader, shader.fragmentShader);
  shader.vertexShader = patched.vertexShader;
  shader.fragmentShader = patched.fragmentShader;
}

export function buildParticleStarGeometry(
  radius: number,
  pointCount: number,
  palette: ParticleStarPalette,
): THREE.BufferGeometry {
  const cacheKey = [
    radius,
    pointCount,
    palette.shadow,
    palette.body,
    palette.highlight,
  ].join("|");
  const cached = geometryCache.get(cacheKey);
  if (cached) return cached;

  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const shadow = new THREE.Color(palette.shadow);
  const body = new THREE.Color(palette.body);
  const highlight = new THREE.Color(palette.highlight);
  const normal = new THREE.Vector3();
  const color = new THREE.Color();

  for (let index = 0; index < pointCount; index += 1) {
    const y = 1 - (2 * (index + 0.5)) / pointCount;
    const horizontalRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * GOLDEN_ANGLE;
    const x = Math.cos(angle) * horizontalRadius;
    const z = Math.sin(angle) * horizontalRadius;
    const offset = index * 3;

    positions[offset] = x * radius;
    positions[offset + 1] = y * radius;
    positions[offset + 2] = z * radius;

    normal.set(x, y, z);
    const bodyMix = THREE.MathUtils.smoothstep(y, -0.72, 0.82);
    const highlightMix = Math.pow(Math.max(0, normal.dot(LIGHT_DIRECTION)), 3);
    color.copy(shadow).lerp(body, bodyMix).lerp(highlight, highlightMix);
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  geometryCache.set(cacheKey, geometry);
  return geometry;
}

export function ParticleStar({
  depthOcclusion = false,
  radius,
  pointCount,
  hitRadius,
  palette,
  opacity = 1,
  haloOpacity = 0.24,
  haloScale = 6.4,
  hitProxyName = "particle-star-hit-proxy",
  hitProxyUserData,
  onClick,
  visualRef,
}: ParticleStarProps) {
  const geometry = buildParticleStarGeometry(radius, pointCount, palette);

  return (
    <group name="particle-star">
      <group name="particle-star-visual" {...(visualRef ? { ref: visualRef } : {})}>
        {depthOcclusion ? (
          <mesh name="particle-star-depth-core" renderOrder={-1}>
            <sphereGeometry args={[radius * 0.58, 14, 10]} />
            <meshBasicMaterial colorWrite={false} depthTest depthWrite />
          </mesh>
        ) : null}
        <points geometry={geometry} name="particle-star-core">
          <pointsMaterial
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            map={sharedRoundTexture}
            opacity={opacity}
            onBeforeCompile={applyParticleDepthShader}
            size={Math.max(radius * 0.24, 0.004)}
            sizeAttenuation
            toneMapped={false}
            transparent
            vertexColors
          />
        </points>
        <sprite name="particle-star-halo" scale={[radius * haloScale, radius * haloScale, 1]}>
          <spriteMaterial
            blending={THREE.AdditiveBlending}
            color={palette.body}
            depthTest={false}
            depthWrite={false}
            map={sharedRoundTexture}
            opacity={haloOpacity * opacity}
            toneMapped={false}
            transparent
          />
        </sprite>
      </group>
      <mesh
        name={hitProxyName}
        {...(hitProxyUserData ? { userData: hitProxyUserData } : {})}
        {...(onClick ? { onClick } : {})}
      >
        <sphereGeometry args={[hitRadius, 16, 12]} />
        <meshBasicMaterial depthWrite={false} opacity={0} transparent />
      </mesh>
    </group>
  );
}
