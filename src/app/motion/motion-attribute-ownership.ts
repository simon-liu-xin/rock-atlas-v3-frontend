import type { MotionMode } from "./motion-mode.ts";

export interface MotionAttributeRoot {
  dataset: {
    motionActive?: string;
    motionMode?: string;
  };
}

interface MotionAttributeOwner {
  active: boolean;
  mode: MotionMode;
  owner: object;
}

const owners = new WeakMap<MotionAttributeRoot, MotionAttributeOwner[]>();

export function syncMotionAttributes(
  root: MotionAttributeRoot,
  owner: object,
  mode: MotionMode,
  active: boolean,
): void {
  const entries = owners.get(root) ?? [];
  const existing = entries.findIndex((entry) => entry.owner === owner);
  if (existing >= 0) entries.splice(existing, 1);

  const entry = { active, mode, owner };
  entries.push(entry);
  owners.set(root, entries);
  writeMotionAttributes(root, entry);
}

export function clearMotionAttributes(root: MotionAttributeRoot, owner: object): void {
  const entries = owners.get(root);
  if (!entries) return;

  const existing = entries.findIndex((entry) => entry.owner === owner);
  if (existing < 0) return;

  entries.splice(existing, 1);
  const current = entries.at(-1);
  if (current) {
    writeMotionAttributes(root, current);
    return;
  }

  owners.delete(root);
  delete root.dataset.motionMode;
  delete root.dataset.motionActive;
}

function writeMotionAttributes(root: MotionAttributeRoot, entry: MotionAttributeOwner): void {
  root.dataset.motionMode = entry.mode;
  root.dataset.motionActive = String(entry.active);
}
