export type MotionMode = "full" | "reduced" | "system";

export const MOTION_MODE_STORAGE_KEY = "rock-atlas:motion-mode:v1";

export function parseMotionMode(value: unknown): MotionMode {
  if (value === "full" || value === "reduced" || value === "system") {
    return value;
  }

  return "full";
}

export function resolveMotionActive(mode: MotionMode, systemReduced: boolean): boolean {
  if (mode === "system") {
    return !systemReduced;
  }

  return mode === "full";
}

export function loadMotionMode(storage?: { getItem(key: string): string | null }): MotionMode {
  if (!storage) {
    return "full";
  }

  try {
    return parseMotionMode(storage.getItem(MOTION_MODE_STORAGE_KEY));
  } catch {
    return "full";
  }
}

export function saveMotionMode(
  storage: { setItem(key: string, value: string): void } | undefined,
  mode: MotionMode,
): { persistent: boolean } {
  if (!storage) {
    return { persistent: false };
  }

  try {
    storage.setItem(MOTION_MODE_STORAGE_KEY, mode);
    return { persistent: true };
  } catch {
    return { persistent: false };
  }
}
