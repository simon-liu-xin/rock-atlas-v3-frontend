import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import {
  loadMotionMode,
  resolveMotionActive,
  saveMotionMode,
  type MotionMode,
} from "./motion-mode.ts";
import { clearMotionAttributes, syncMotionAttributes } from "./motion-attribute-ownership.ts";

type MotionModeStorage = Pick<Storage, "getItem" | "setItem">;

interface MotionModeContextValue {
  active: boolean;
  mode: MotionMode;
  setMode: (mode: MotionMode) => void;
}

interface MotionModeProviderProps extends PropsWithChildren {
  initialMode?: MotionMode;
  storage?: MotionModeStorage;
}

const MotionModeContext = createContext<MotionModeContextValue | undefined>(undefined);
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function MotionModeProvider({
  children,
  initialMode,
  storage,
}: MotionModeProviderProps) {
  const ownerRef = useRef<object | null>(null);
  if (!ownerRef.current) ownerRef.current = {};
  const resolvedStorage = storage ?? browserStorage();
  const [mode, setModeState] = useState<MotionMode>(
    () => initialMode ?? loadMotionMode(resolvedStorage),
  );
  const [systemReduced, setSystemReduced] = useState(browserReducedMotion);
  const active = resolveMotionActive(mode, systemReduced);

  useEffect(() => subscribeToReducedMotion(setSystemReduced), []);

  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined") return undefined;

    const root = document.documentElement;
    const owner = ownerRef.current!;
    syncMotionAttributes(root, owner, mode, active);

    return () => {
      clearMotionAttributes(root, owner);
    };
  }, [active, mode]);

  const setMode = useCallback((nextMode: MotionMode) => {
    setModeState(nextMode);
    saveMotionMode(resolvedStorage, nextMode);
  }, [resolvedStorage]);

  const value = useMemo(
    () => ({ active, mode, setMode }),
    [active, mode, setMode],
  );

  return <MotionModeContext.Provider value={value}>{children}</MotionModeContext.Provider>;
}

export function useMotionMode(): MotionModeContextValue {
  const value = useContext(MotionModeContext);
  if (!value) throw new Error("useMotionMode must be used within MotionModeProvider.");
  return value;
}

function browserStorage(): MotionModeStorage | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeToReducedMotion(onChange: (reduced: boolean) => void): (() => void) | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;

  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const update = () => onChange(media.matches);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
