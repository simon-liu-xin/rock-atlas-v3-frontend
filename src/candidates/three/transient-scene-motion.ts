import type { AssertionRecordV1 } from "../../generated/schema-types.ts";
import {
  BRIDGE_FACT_COLOR,
  BRIDGE_HYPOTHESIS_COLOR,
} from "./bridge-visual.ts";

export type BridgeAssertionKind = AssertionRecordV1["assertion_kind"];
export type BridgeSignalColor = typeof BRIDGE_FACT_COLOR | typeof BRIDGE_HYPOTHESIS_COLOR;

export function bridgeSignalColor(assertionKind: BridgeAssertionKind): BridgeSignalColor {
  return assertionKind === "fact" ? BRIDGE_FACT_COLOR : BRIDGE_HYPOTHESIS_COLOR;
}

export function transientProgress(
  now: number,
  startedAt: number,
  duration: number,
): number {
  if (duration <= 0) return 1;
  return clamp01((now - startedAt) / duration);
}

export function representativeTransientProgress(reducedMotion: boolean): number {
  return reducedMotion ? 0.5 : 0;
}

export interface TransientLifecycle {
  duration: number;
  startedAt: number;
}

export interface TransientLifecycleSample {
  progress: number;
  shouldRender: boolean;
  shouldSchedule: boolean;
}

export function createTransientLifecycle(
  startedAt: number,
  duration: number,
): TransientLifecycle {
  return { duration, startedAt };
}

export function readTransientLifecycle(
  lifecycle: TransientLifecycle,
  now: number,
  motionActive: boolean,
): TransientLifecycleSample {
  const progress = transientProgress(now, lifecycle.startedAt, lifecycle.duration);
  return {
    progress,
    shouldRender: motionActive,
    shouldSchedule: motionActive && progress < 1,
  };
}

export interface BridgeSignalSample {
  position: number;
  opacity: number;
}

export interface BreathingHaloSample {
  scale: number;
  opacity: number;
}

export interface OrbitRunnerSample {
  angle: number;
  opacity: number;
}

export interface SearchScanSample {
  scale: number;
  opacity: number;
}

export function sampleBridgeSignal(progress: number): BridgeSignalSample {
  return writeBridgeSignal(progress, { position: 0, opacity: 0 });
}

export function writeBridgeSignal(
  progress: number,
  target: BridgeSignalSample,
): BridgeSignalSample {
  const value = clamp01(progress);
  target.position = value;
  target.opacity = pulse(value);
  return target;
}

export function sampleBreathingHalo(progress: number): BreathingHaloSample {
  return writeBreathingHalo(progress, { scale: 1, opacity: 0 });
}

export function writeBreathingHalo(
  progress: number,
  target: BreathingHaloSample,
): BreathingHaloSample {
  const amount = pulse(clamp01(progress));
  target.scale = 1 + amount * 0.16;
  target.opacity = amount * 0.42;
  return target;
}

export function sampleOrbitRunner(progress: number): OrbitRunnerSample {
  return writeOrbitRunner(progress, { angle: 0, opacity: 0 });
}

export function writeOrbitRunner(
  progress: number,
  target: OrbitRunnerSample,
): OrbitRunnerSample {
  const value = clamp01(progress);
  target.angle = value * Math.PI * 2;
  target.opacity = pulse(value);
  return target;
}

export function sampleSearchScan(progress: number): SearchScanSample {
  return writeSearchScan(progress, { scale: 1, opacity: 0 });
}

export function writeSearchScan(
  progress: number,
  target: SearchScanSample,
): SearchScanSample {
  const value = clamp01(progress);
  target.scale = 0.72 + value * 0.72;
  target.opacity = (1 - value) * 0.58;
  return target;
}

function pulse(value: number): number {
  if (value <= 0 || value >= 1) return 0;
  return Math.sin(value * Math.PI);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
