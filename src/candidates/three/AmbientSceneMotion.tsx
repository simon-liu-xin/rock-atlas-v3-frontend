import { useFrame, useThree } from "@react-three/fiber";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type MutableRefObject,
  type PropsWithChildren,
} from "react";

import {
  createAmbientFrameScheduler,
  type AmbientScheduler,
} from "./ambient-frame-scheduler.ts";

const AMBIENT_FPS = 30;
const MAX_AMBIENT_DELTA_SECONDS = 0.05;

interface AmbientTimeContextValue {
  active: boolean;
  elapsed: MutableRefObject<number>;
  visible: boolean;
}

interface AmbientSceneMotionProps extends PropsWithChildren {
  active: boolean;
}

interface AmbientClockLifecycleOptions {
  active: boolean;
  isVisible(): boolean;
  scheduler: AmbientScheduler;
  subscribeVisibility(listener: () => void): () => void;
}

interface AmbientClockLifecycle {
  dispose(): void;
  setActive(active: boolean): void;
}

const AmbientTimeContext = createContext<AmbientTimeContextValue | null>(null);
const visibilitySubscribers = new Set<() => void>();
let removeDocumentVisibilityListener: (() => void) | null = null;

export function AmbientSceneMotion({ active, children }: AmbientSceneMotionProps) {
  const elapsed = useRef(0);
  const visible = useSyncExternalStore(
    subscribeDocumentVisibility,
    isDocumentVisible,
    () => true,
  );
  const value = useMemo(() => ({ active, elapsed, visible }), [active, visible]);

  return (
    <AmbientTimeContext.Provider value={value}>
      <AmbientClock active={active} elapsed={elapsed} />
      {children}
    </AmbientTimeContext.Provider>
  );
}

export function useAmbientTime(): AmbientTimeContextValue {
  const value = useContext(AmbientTimeContext);
  if (!value) throw new Error("useAmbientTime must be used within AmbientSceneMotion.");
  return value;
}

export function useOptionalAmbientTime(): AmbientTimeContextValue | null {
  return useContext(AmbientTimeContext);
}

export function advanceAmbientElapsed(
  elapsed: number,
  delta: number,
  active: boolean,
  visible: boolean,
  resumePending = false,
): number {
  if (!active || !visible || resumePending) return elapsed;
  const safeDelta = Number.isFinite(delta)
    ? Math.min(MAX_AMBIENT_DELTA_SECONDS, Math.max(0, delta))
    : 0;
  return elapsed + safeDelta;
}

export function createAmbientClockLifecycle({
  active: initialActive,
  isVisible,
  scheduler,
  subscribeVisibility,
}: AmbientClockLifecycleOptions): AmbientClockLifecycle {
  let active = initialActive;
  let disposed = false;
  let running = false;

  const sync = () => {
    if (disposed) return;
    const shouldRun = active && isVisible();
    if (shouldRun === running) return;
    running = shouldRun;
    if (running) scheduler.start();
    else scheduler.stop();
  };
  const unsubscribe = subscribeVisibility(sync);
  sync();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      if (running) scheduler.stop();
      running = false;
    },
    setActive(nextActive) {
      if (disposed || active === nextActive) return;
      active = nextActive;
      sync();
    },
  };
}

function AmbientClock({
  active,
  elapsed,
}: {
  active: boolean;
  elapsed: MutableRefObject<number>;
}) {
  const { gl, invalidate } = useThree();
  const visibleRef = useRef(isDocumentVisible());
  const lifecycleRef = useRef<AmbientClockLifecycle | null>(null);
  const activeRef = useRef(active);
  const resumePendingRef = useRef(false);
  if (activeRef.current !== active) {
    activeRef.current = active;
    resumePendingRef.current = active;
  }

  useFrame((_, delta) => {
    const resumePending = activeRef.current && resumePendingRef.current;
    resumePendingRef.current = false;
    elapsed.current = advanceAmbientElapsed(
      elapsed.current,
      delta,
      activeRef.current,
      visibleRef.current,
      resumePending,
    );
  }, -100);

  useEffect(() => {
    const scheduler = createAmbientFrameScheduler({
      fps: AMBIENT_FPS,
      invalidate,
      now: () => performance.now(),
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: (handle) => window.clearTimeout(handle),
    });
    const lifecycle = createAmbientClockLifecycle({
      active: activeRef.current,
      isVisible: () => visibleRef.current,
      scheduler,
      subscribeVisibility: (listener) => {
        return subscribeDocumentVisibility(() => {
          visibleRef.current = isDocumentVisible();
          listener();
        });
      },
    });
    const handleContextLost = () => lifecycle.setActive(false);
    gl.domElement.addEventListener("webglcontextlost", handleContextLost);
    lifecycleRef.current = lifecycle;

    return () => {
      lifecycleRef.current = null;
      gl.domElement.removeEventListener("webglcontextlost", handleContextLost);
      lifecycle.dispose();
    };
  }, [gl, invalidate]);

  useEffect(() => {
    lifecycleRef.current?.setActive(active);
  }, [active]);

  return null;
}

export function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function subscribeDocumentVisibility(listener: () => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  visibilitySubscribers.add(listener);
  if (!removeDocumentVisibilityListener) {
    const notify = () => {
      for (const subscriber of visibilitySubscribers) subscriber();
    };
    document.addEventListener("visibilitychange", notify);
    removeDocumentVisibilityListener = () => {
      document.removeEventListener("visibilitychange", notify);
      removeDocumentVisibilityListener = null;
    };
  }

  return () => {
    visibilitySubscribers.delete(listener);
    if (visibilitySubscribers.size === 0) removeDocumentVisibilityListener?.();
  };
}
