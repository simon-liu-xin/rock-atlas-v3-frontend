import {
  bridgeSignalColor,
  type BridgeAssertionKind,
  type BridgeSignalColor,
} from "./transient-scene-motion.ts";

const TWO_PI = Math.PI * 2;

export type AmbientAssertionKind = BridgeAssertionKind;

export interface NebulaMotionProfile {
  breathingPeriod: number;
  breathingPhase: number;
  rotationPeriod: number;
  rotationPhase: number;
}

export interface NebulaMotionSample {
  rotation: number;
  scale: number;
}

export interface StarMotionProfile {
  period: number;
  phase: number;
}

export interface StarMotionSample {
  halo: number;
  scale: number;
}

export interface BackgroundMotionSample {
  rotationX: number;
  rotationZ: number;
}

export interface BridgeMotionProfile {
  color: BridgeSignalColor;
  period: number;
  phase: number;
  speed: number;
}

export interface BridgeMotionSample {
  color: BridgeSignalColor;
  opacity: number;
  position: number;
}

export function stableMotionPhase(id: string): number {
  return (hashString(id) / 0x1_0000_0000) * TWO_PI;
}

export function sampleNebulaMotion(
  elapsed: number,
  id: string,
): NebulaMotionSample {
  return writeNebulaMotion(
    elapsed,
    createNebulaMotionProfile(id),
    { rotation: 0, scale: 1 },
  );
}

export function createNebulaMotionProfile(id: string): NebulaMotionProfile {
  return {
    breathingPeriod: stablePeriod(`${id}:breathing`, 2, 4),
    breathingPhase: stableMotionPhase(id),
    rotationPeriod: stablePeriod(`${id}:rotation`, 36, 72),
    rotationPhase: stableMotionPhase(`${id}:rotation`),
  };
}

export function writeNebulaMotion(
  elapsed: number,
  profile: NebulaMotionProfile,
  target: NebulaMotionSample,
): NebulaMotionSample {
  const breathingCycle = periodicAngle(
    elapsed,
    profile.breathingPeriod,
    profile.breathingPhase,
  );
  const rotationCycle = periodicAngle(
    elapsed,
    profile.rotationPeriod,
    profile.rotationPhase,
  );

  target.rotation = rotationCycle;
  target.scale = clamp(1 + Math.sin(breathingCycle) * 0.09, 0.91, 1.09);
  return target;
}

export function sampleStarMotion(
  elapsed: number,
  id: string,
): StarMotionSample {
  return writeStarMotion(
    elapsed,
    createStarMotionProfile(id),
    { halo: 1, scale: 1 },
  );
}

export function createStarMotionProfile(id: string): StarMotionProfile {
  return {
    period: stablePeriod(`${id}:twinkle`, 2, 4),
    phase: stableMotionPhase(id),
  };
}

export function writeStarMotion(
  elapsed: number,
  profile: StarMotionProfile,
  target: StarMotionSample,
): StarMotionSample {
  const cycle = periodicAngle(
    elapsed,
    profile.period,
    profile.phase,
  );
  const wave = Math.sin(cycle);

  target.halo = clamp(0.86 + wave * 0.14, 0.72, 1);
  target.scale = clamp(1 + wave * 0.03, 0.97, 1.03);
  return target;
}

export function sampleBackgroundMotion(
  elapsed: number,
): BackgroundMotionSample {
  return writeBackgroundMotion(elapsed, { rotationX: 0, rotationZ: 0 });
}

export function writeBackgroundMotion(
  elapsed: number,
  target: BackgroundMotionSample,
): BackgroundMotionSample {
  const time = finiteElapsed(elapsed);
  target.rotationX = Math.sin(periodicAngle(time, TWO_PI / 0.16, 0)) * 0.012;
  target.rotationZ = Math.sin(periodicAngle(time, TWO_PI / 0.11, Math.PI / 3)) * 0.018;
  return target;
}

export function sampleBridgeMotion(
  elapsed: number,
  relationId: string,
  assertionKind: AmbientAssertionKind = "fact",
): BridgeMotionSample {
  return writeBridgeMotion(
    elapsed,
    createBridgeMotionProfile(relationId, assertionKind),
    { color: bridgeSignalColor(assertionKind), opacity: 0, position: 0 },
  );
}

export function createBridgeMotionProfile(
  relationId: string,
  assertionKind: AmbientAssertionKind = "fact",
): BridgeMotionProfile {
  const speed = 0.12 + stableMotionPhase(`${relationId}:speed`) / TWO_PI * 0.1;
  return {
    color: bridgeSignalColor(assertionKind),
    period: 1 / speed,
    phase: stableMotionPhase(relationId) / TWO_PI,
    speed,
  };
}

export function writeBridgeMotion(
  elapsed: number,
  profile: BridgeMotionProfile,
  target: BridgeMotionSample,
): BridgeMotionSample {
  const position = wrapUnit(
    profile.phase + periodicElapsed(elapsed, profile.period) * profile.speed,
  );
  target.color = profile.color;
  target.opacity = Math.sin(position * Math.PI) * 0.82;
  target.position = position;
  return target;
}

export function sampleOrbitAngle(
  elapsed: number,
  initialAngle: number,
  speed: number,
): number {
  const initial = finiteValue(initialAngle);
  const velocity = finiteValue(speed);
  if (velocity === 0) return wrapRadians(initial);

  const period = TWO_PI / Math.abs(velocity);
  const offset = periodicElapsed(elapsed, period) * velocity;
  return wrapRadians(initial + offset);
}

function stablePeriod(id: string, minimum: number, maximum: number): number {
  return minimum + stableMotionPhase(`${id}:period`) / TWO_PI * (maximum - minimum);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function finiteElapsed(elapsed: number): number {
  return finiteValue(elapsed);
}

function finiteValue(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function periodicAngle(elapsed: number, period: number, phase: number): number {
  return wrapRadians(phase + periodicElapsed(elapsed, period) / period * TWO_PI);
}

function periodicElapsed(elapsed: number, period: number): number {
  const time = finiteElapsed(elapsed);
  if (!Number.isFinite(period) || period <= 0) return time;
  const remainder = time % period;
  return remainder < 0 ? remainder + period : remainder;
}

function wrapRadians(value: number): number {
  const remainder = value % TWO_PI;
  return remainder < 0 ? remainder + TWO_PI : remainder;
}

function wrapUnit(value: number): number {
  const remainder = value % 1;
  return remainder < 0 ? remainder + 1 : remainder;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
