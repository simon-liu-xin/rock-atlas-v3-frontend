import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import type { UniversePoint } from "../../experiment/viewmodel/universe-overview-model.ts";
import {
  createNebulaMotionProfile,
  writeNebulaMotion,
  type NebulaMotionSample,
} from "./ambient-scene-motion.ts";
import {
  useAmbientTime,
  useOptionalAmbientTime,
} from "./AmbientSceneMotion.tsx";
import { buildRoundParticleTexture } from "./round-particle-texture.ts";
import {
  createNebulaSpiralProfile,
  warpParticlesIntoSpiral,
} from "./nebula-spiral-profile.ts";
import { SearchScan, SelectionPulse } from "./TransientSceneMotion.tsx";
import { createUniverseSceneTargetUserData } from "./universe-scene-interaction.ts";

interface StyleNebulaProps {
  backgrounded?: boolean;
  center: UniversePoint;
  color: string;
  colors: Float32Array;
  deemphasized?: boolean;
  filtered: boolean;
  positions: Float32Array;
  searchActive?: boolean;
  searchMatch?: boolean;
  searchToken?: string;
  selected: boolean;
  styleId: string;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}

interface ParticleLayer {
  colors: Float32Array;
  positions: Float32Array;
}

const particleTexture = buildRoundParticleTexture(64);

export function StyleNebula({
  backgrounded = false,
  center,
  color,
  colors,
  deemphasized = false,
  filtered,
  positions,
  searchActive = false,
  searchMatch = false,
  searchToken = "",
  selected,
  styleId,
  onClick,
}: StyleNebulaProps) {
  const visualRef = useRef<THREE.Group>(null);
  const ambientTime = useOptionalAmbientTime();
  const localPositions = useMemo(
    () => localizeParticlePositions(positions, center),
    [center, positions],
  );
  const spiralProfile = useMemo(() => createNebulaSpiralProfile(styleId), [styleId]);
  const spiralStrength = backgrounded
    ? selected ? 0.4 : 0.16
    : selected
      ? 0.58
      : deemphasized
        ? 0.18
        : 0.3;
  const spiralPositions = useMemo(
    () => warpParticlesIntoSpiral(localPositions, spiralProfile, spiralStrength),
    [localPositions, spiralProfile, spiralStrength],
  );
  const layers = useMemo(
    () => splitParticleLayers(spiralPositions, colors, hashString(styleId)),
    [colors, spiralPositions, styleId],
  );
  const hitTarget = useMemo(
    () => createUniverseSceneTargetUserData("style", styleId),
    [styleId],
  );
  const opacity = filtered
    ? 0.07
    : searchActive && !searchMatch && !selected
      ? 0.08
    : backgrounded
      ? selected ? 0.24 : 0.07
      : selected
        ? 0.92
        : deemphasized
          ? 0.14
          : 0.62;

  return (
    <group
      name="ambient-style-nebula"
      position={[center.x, center.y, center.z]}
      userData={{
        armCount: spiralProfile.armCount,
        spiralDirection: spiralProfile.direction,
        styleId,
      }}
    >
      <group name="ambient-style-nebula-visual" ref={visualRef}>
        {ambientTime ? <NebulaAmbientTransform groupRef={visualRef} styleId={styleId} /> : null}
        <ParticleCloud
          layer={layers.fine}
          name="style-nebula-fine-particles"
          opacity={backgrounded ? opacity * 0.38 : opacity}
          size={backgrounded ? 0.048 : selected ? 0.036 : 0.028}
        />
        <ParticleCloud
          layer={layers.large}
          name="style-nebula-large-particles"
          opacity={backgrounded ? opacity * 0.58 : opacity * 0.46}
          size={backgrounded ? 0.12 : selected ? 0.088 : 0.068}
        />
        <ParticleCloud
          alphaTest={0.002}
          layer={layers.haze}
          name="style-nebula-haze-particles"
          opacity={backgrounded ? opacity * 0.72 : opacity * 0.18}
          size={backgrounded ? selected ? 0.42 : 0.32 : selected ? 0.27 : 0.21}
        />
      </group>
      <mesh
        name="style-nebula-hit-proxy"
        userData={hitTarget}
        {...(onClick ? { onClick } : {})}
      >
        <sphereGeometry args={[selected ? 0.34 : 0.25, 16, 12]} />
        <meshBasicMaterial color={color} depthWrite={false} opacity={0} transparent />
      </mesh>
      {searchActive && searchMatch ? (
        <SearchScan
          center={{ x: 0, y: 0, z: 0 }}
          color={color}
          key={searchToken}
        />
      ) : null}
      {selected ? (
        <SelectionPulse color={color} name="style-selection-pulse" radius={0.34} />
      ) : null}
    </group>
  );
}

function NebulaAmbientTransform({
  groupRef,
  styleId,
}: {
  groupRef: RefObject<THREE.Group | null>;
  styleId: string;
}) {
  const { active, elapsed } = useAmbientTime();
  const profile = useMemo(() => createNebulaMotionProfile(styleId), [styleId]);
  const sampleRef = useRef<NebulaMotionSample>({ rotation: 0, scale: 1 });

  useFrame(() => {
    const group = groupRef.current;
    if (!active || !group) return;
    const sample = writeNebulaMotion(elapsed.current, profile, sampleRef.current);
    group.rotation.z = sample.rotation;
    group.scale.setScalar(sample.scale);
  });

  return null;
}

export function localizeParticlePositions(
  positions: Float32Array,
  center: UniversePoint,
): Float32Array {
  const localized = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    localized[index] = positions[index]! - center.x;
    localized[index + 1] = positions[index + 1]! - center.y;
    localized[index + 2] = positions[index + 2]! - center.z;
  }
  return localized;
}

function ParticleCloud({
  alphaTest = 0.015,
  layer,
  name,
  opacity,
  size,
}: {
  alphaTest?: number;
  layer: ParticleLayer;
  name: string;
  opacity: number;
  size: number;
}) {
  return (
    <points name={name}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[layer.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[layer.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        alphaTest={alphaTest}
        blending={THREE.AdditiveBlending}
        color="#ffffff"
        depthWrite={false}
        map={particleTexture}
        opacity={opacity}
        size={size}
        sizeAttenuation
        transparent
        toneMapped={false}
        vertexColors
      />
    </points>
  );
}

function splitParticleLayers(
  positions: Float32Array,
  colors: Float32Array,
  seed: number,
): { fine: ParticleLayer; large: ParticleLayer; haze: ParticleLayer } {
  const finePositions: number[] = [];
  const fineColors: number[] = [];
  const largePositions: number[] = [];
  const largeColors: number[] = [];
  const hazePositions: number[] = [];
  const hazeColors: number[] = [];
  const phase = seed % 23;

  for (let index = 0; index < positions.length; index += 3) {
    const particleIndex = index / 3;
    const selector = (particleIndex + phase) % 23;
    const isHaze = selector === 0;
    const isLarge = !isHaze && selector % 6 === 0;
    const targetPositions = isHaze
      ? hazePositions
      : isLarge
        ? largePositions
        : finePositions;
    const targetColors = isHaze ? hazeColors : isLarge ? largeColors : fineColors;
    targetPositions.push(positions[index]!, positions[index + 1]!, positions[index + 2]!);
    targetColors.push(colors[index]!, colors[index + 1]!, colors[index + 2]!);
  }

  return {
    fine: {
      colors: new Float32Array(fineColors),
      positions: new Float32Array(finePositions),
    },
    large: {
      colors: new Float32Array(largeColors),
      positions: new Float32Array(largePositions),
    },
    haze: {
      colors: new Float32Array(hazeColors),
      positions: new Float32Array(hazePositions),
    },
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
