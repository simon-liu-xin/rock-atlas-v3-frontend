import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

import { useMotionMode } from "../../app/motion/MotionModeProvider.tsx";
import type { UniversePoint } from "../../experiment/viewmodel/universe-overview-model.ts";
import {
  createBridgeMotionProfile,
  writeBridgeMotion,
  type BridgeMotionSample,
} from "./ambient-scene-motion.ts";
import {
  isDocumentVisible,
  useAmbientTime,
} from "./AmbientSceneMotion.tsx";
import {
  bridgeSignalColor,
  createTransientLifecycle,
  readTransientLifecycle,
  transientProgress,
  writeBreathingHalo,
  writeBridgeSignal,
  writeOrbitRunner,
  writeSearchScan,
  type BreathingHaloSample,
  type BridgeAssertionKind,
  type BridgeSignalSample,
  type OrbitRunnerSample,
  type SearchScanSample,
  type TransientLifecycle,
} from "./transient-scene-motion.ts";
import { buildRoundParticleTexture } from "./round-particle-texture.ts";
import { buildTransientParticleGeometry } from "./transient-particle-geometry.ts";

const ignoreRaycast: THREE.Object3D["raycast"] = () => undefined;
const bridgeSignalTexture = buildRoundParticleTexture(32);
const bridgeSignalPosition = new Float32Array([0, 0, 0]);
const transientRingGeometry = buildTransientParticleGeometry("ring", 48);
const transientShellGeometry = buildTransientParticleGeometry("shell", 72);

export function BridgeSignal({
  assertionKind,
  curve,
  dimmed = false,
}: {
  assertionKind: BridgeAssertionKind;
  curve: THREE.QuadraticBezierCurve3;
  dimmed?: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const sampleRef = useRef<BridgeSignalSample>({ position: 0, opacity: 0 });
  const apply = useCallback((progress: number) => {
    const sample = writeBridgeSignal(progress, sampleRef.current);
    if (pointsRef.current) curve.getPoint(sample.position, pointsRef.current.position);
    if (materialRef.current) materialRef.current.opacity = sample.opacity * (dimmed ? 0.28 : 1);
  }, [curve, dimmed]);
  useTransientFrame(900, apply);

  return (
    <points name="bridge-signal" raycast={ignoreRaycast} ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[bridgeSignalPosition, 3]} />
      </bufferGeometry>
      <pointsMaterial
        alphaTest={0.02}
        blending={THREE.AdditiveBlending}
        color={bridgeSignalColor(assertionKind)}
        depthTest
        depthWrite={false}
        map={bridgeSignalTexture}
        opacity={0}
        ref={materialRef}
        size={0.04}
        sizeAttenuation
        toneMapped={false}
        transparent
      />
    </points>
  );
}

export function AmbientBridgeSignal({
  assertionKind,
  curve,
  dimmed = false,
  intensity = 1,
  relationId,
}: {
  assertionKind: BridgeAssertionKind;
  curve: THREE.QuadraticBezierCurve3;
  dimmed?: boolean;
  intensity?: number;
  relationId: string;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const { active, elapsed } = useAmbientTime();
  const { invalidate } = useThree();
  const profile = useMemo(
    () => createBridgeMotionProfile(relationId, assertionKind),
    [assertionKind, relationId],
  );
  const sampleRef = useRef<BridgeMotionSample>({
    color: bridgeSignalColor(assertionKind),
    opacity: 0,
    position: 0,
  });

  useFrame(() => {
    const points = pointsRef.current;
    const material = materialRef.current;
    if (!active || !points || !material) return;
    const sample = writeBridgeMotion(elapsed.current, profile, sampleRef.current);
    curve.getPoint(sample.position, points.position);
    material.opacity = sample.opacity * (dimmed ? 0.18 : 0.98) * intensity;
  });

  useEffect(() => {
    if (active || !materialRef.current) return;
    materialRef.current.opacity = 0;
    invalidate();
  }, [active, invalidate]);

  return (
    <points name="ambient-bridge-signal" raycast={ignoreRaycast} ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[bridgeSignalPosition, 3]} />
      </bufferGeometry>
      <pointsMaterial
        alphaTest={0.02}
        blending={THREE.AdditiveBlending}
        color={bridgeSignalColor(assertionKind)}
        depthTest
        depthWrite={false}
        map={bridgeSignalTexture}
        opacity={0}
        ref={materialRef}
        size={0.036}
        sizeAttenuation
        toneMapped={false}
        transparent
      />
    </points>
  );
}

export function ArtistBreathingHalo({ radius }: { radius: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const sampleRef = useRef<BreathingHaloSample>({ scale: 1, opacity: 0 });
  const apply = useCallback((progress: number) => {
    const sample = writeBreathingHalo(progress, sampleRef.current);
    pointsRef.current?.scale.setScalar(sample.scale);
    if (materialRef.current) materialRef.current.opacity = sample.opacity;
  }, []);
  useTransientFrame(1_100, apply);

  return (
    <group scale={[radius * 2.25, radius * 2.25, radius * 2.25]}>
      <points
        name="artist-selection-pulse"
        geometry={transientShellGeometry}
        raycast={ignoreRaycast}
        ref={pointsRef}
      >
        <TransientPointsMaterial color="#f0c46f" materialRef={materialRef} size={0.018} />
      </points>
    </group>
  );
}

export function OrbitRunner({
  center,
  radius,
  tilt,
}: {
  center: UniversePoint;
  radius: number;
  tilt: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const sampleRef = useRef<OrbitRunnerSample>({ angle: 0, opacity: 0 });
  const apply = useCallback((progress: number) => {
    const sample = writeOrbitRunner(progress, sampleRef.current);
    pointsRef.current?.position.set(
      Math.cos(sample.angle) * radius,
      Math.sin(sample.angle) * radius,
      0,
    );
    if (materialRef.current) materialRef.current.opacity = sample.opacity * 0.94;
  }, [radius]);
  useTransientFrame(1_000, apply);

  return (
    <group position={[center.x, center.y, center.z]} rotation={[Math.PI / 2 + tilt, 0, 0.22]}>
      <points name="orbit-runner" raycast={ignoreRaycast} ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[bridgeSignalPosition, 3]} />
        </bufferGeometry>
        <TransientPointsMaterial color="#eaffff" materialRef={materialRef} size={0.024} />
      </points>
    </group>
  );
}

export function SearchScan({ center, color }: { center: UniversePoint; color: string }) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const sampleRef = useRef<SearchScanSample>({ scale: 1, opacity: 0 });
  const apply = useCallback((progress: number) => {
    const sample = writeSearchScan(progress, sampleRef.current);
    pointsRef.current?.scale.setScalar(sample.scale);
    if (materialRef.current) materialRef.current.opacity = sample.opacity;
  }, []);
  useTransientFrame(700, apply);

  return (
    <group position={[center.x, center.y, center.z]} scale={[0.58, 0.58, 0.58]}>
      <points
        name="search-scan"
        geometry={transientShellGeometry}
        raycast={ignoreRaycast}
        ref={pointsRef}
      >
        <TransientPointsMaterial color={color} materialRef={materialRef} size={0.024} />
      </points>
    </group>
  );
}

export function SelectionPulse({
  color,
  name = "selection-pulse",
  radius,
}: {
  color: string;
  name?: string;
  radius: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const sampleRef = useRef<SearchScanSample>({ scale: 1, opacity: 0 });
  const apply = useCallback((progress: number) => {
    const sample = writeSearchScan(progress, sampleRef.current);
    pointsRef.current?.scale.setScalar(sample.scale);
    if (materialRef.current) materialRef.current.opacity = sample.opacity * 0.86;
  }, []);
  useTransientFrame(720, apply);

  return (
    <group scale={[radius, radius, radius]}>
      <points
        geometry={transientRingGeometry}
        name={name}
        raycast={ignoreRaycast}
        ref={pointsRef}
      >
        <TransientPointsMaterial color={color} materialRef={materialRef} size={0.022} />
      </points>
    </group>
  );
}

function TransientPointsMaterial({
  color,
  materialRef,
  size,
}: {
  color: string;
  materialRef: RefObject<THREE.PointsMaterial | null>;
  size: number;
}) {
  return (
    <pointsMaterial
      alphaTest={0.02}
      blending={THREE.AdditiveBlending}
      color={color}
      depthTest
      depthWrite={false}
      map={bridgeSignalTexture}
      opacity={0}
      ref={materialRef}
      size={size}
      sizeAttenuation
      toneMapped={false}
      transparent
    />
  );
}

function useTransientFrame(
  duration: number,
  apply: (progress: number) => void,
): void {
  const { invalidate } = useThree();
  const { active: motionActive } = useMotionMode();
  const { visible } = useAmbientTime();
  const lifecycleRef = useRef<TransientLifecycle | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = createTransientLifecycle(performance.now(), duration);
  }

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle) return;
    if (!visible) return;
    let frame = 0;
    const animate = (now: number) => {
      if (!isDocumentVisible()) return;
      const progress = transientProgress(now, lifecycle.startedAt, lifecycle.duration);
      apply(progress);
      invalidate();
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };

    const sample = readTransientLifecycle(lifecycle, performance.now(), motionActive);
    apply(sample.shouldRender ? sample.progress : 1);
    invalidate();
    if (!sample.shouldSchedule) return;

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [apply, invalidate, motionActive, visible]);
}
