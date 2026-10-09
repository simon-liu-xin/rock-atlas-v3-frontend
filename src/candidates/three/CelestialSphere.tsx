import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import * as THREE from "three";

import { buildRoundParticleTexture } from "./round-particle-texture.ts";

interface CelestialSphereProps {
  radius: number;
  shadowColor: string;
  baseColor: string;
  highlightColor: string;
  opacity?: number;
  surfaceOpacityScale?: number;
  haloScale?: number;
  haloOpacity?: number;
  outerHaloScale?: number;
  outerHaloOpacity?: number;
  hitRadius?: number;
  hitProxyName?: string;
  hitProxyUserData?: Record<string, unknown>;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  visualRef?: RefObject<THREE.Group | null>;
}

const sharedHaloTexture = buildRoundParticleTexture(64);

export function buildGradientSphereGeometry(
  radius: number,
  shadowColor: string,
  baseColor: string,
  highlightColor: string,
): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(radius, 32, 24);
  const position = geometry.getAttribute("position");
  const shadow = new THREE.Color(shadowColor);
  const base = new THREE.Color(baseColor);
  const highlight = new THREE.Color(highlightColor);
  const lightDirection = new THREE.Vector3(-0.48, 0.72, 0.5).normalize();
  const normal = new THREE.Vector3();
  const color = new THREE.Color();
  const colors = new Float32Array(position.count * 3);

  for (let index = 0; index < position.count; index += 1) {
    normal.fromBufferAttribute(position, index).normalize();
    const verticalMix = THREE.MathUtils.smoothstep(normal.y, -0.72, 0.82);
    const highlightMix = Math.pow(Math.max(0, normal.dot(lightDirection)), 3.2) * 0.78;
    color.copy(shadow).lerp(base, verticalMix).lerp(highlight, highlightMix);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

export function CelestialSphere({
  radius,
  shadowColor,
  baseColor,
  highlightColor,
  opacity = 1,
  surfaceOpacityScale = 1,
  haloScale = 3.6,
  haloOpacity = 0.24,
  outerHaloScale = 6.4,
  outerHaloOpacity = 0,
  hitRadius = radius * 2.4,
  hitProxyName = "celestial-hit-proxy",
  hitProxyUserData,
  onClick,
  visualRef,
}: CelestialSphereProps) {
  const surfaceOpacity = opacity * surfaceOpacityScale;
  const geometry = useMemo(
    () => buildGradientSphereGeometry(radius, shadowColor, baseColor, highlightColor),
    [baseColor, highlightColor, radius, shadowColor],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group name="celestial-body">
      <group name="celestial-visual" {...(visualRef ? { ref: visualRef } : {})}>
        <mesh geometry={geometry} name="celestial-surface" {...(onClick ? { onClick } : {})}>
          <meshStandardMaterial
            depthWrite={surfaceOpacity >= 0.98}
            emissive={baseColor}
            emissiveIntensity={surfaceOpacity < 0.5 ? 0.18 : 0.06}
            metalness={0.04}
            opacity={surfaceOpacity}
            roughness={0.58}
            transparent={surfaceOpacity < 1}
            vertexColors
          />
        </mesh>
        <mesh geometry={geometry} name="celestial-rim" scale={1.08}>
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={highlightColor}
            depthWrite={false}
            opacity={haloOpacity * opacity * 0.72 * Math.sqrt(surfaceOpacityScale)}
            side={THREE.BackSide}
            transparent
          />
        </mesh>
        {outerHaloOpacity > 0 ? (
          <sprite
            name="celestial-outer-halo"
            scale={[radius * outerHaloScale, radius * outerHaloScale, 1]}
          >
            <spriteMaterial
              blending={THREE.AdditiveBlending}
              color={baseColor}
              depthWrite={false}
              map={sharedHaloTexture}
              opacity={outerHaloOpacity * opacity}
              toneMapped={false}
              transparent
            />
          </sprite>
        ) : null}
        <sprite name="celestial-halo" scale={[radius * haloScale, radius * haloScale, 1]}>
          <spriteMaterial
            blending={THREE.AdditiveBlending}
            color={baseColor}
            depthWrite={false}
            map={sharedHaloTexture}
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
