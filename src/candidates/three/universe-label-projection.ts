import * as THREE from "three";

import type { UniversePoint } from "../../experiment/viewmodel/universe-overview-model.ts";

export type UniverseLabelKind = "style" | "artist" | "orbit";

export interface UniverseLabelDescriptor {
  focused?: boolean;
  id: string;
  kind: UniverseLabelKind;
  point: UniversePoint;
  priority: number;
  text: string;
}

export interface UniverseLabelLayoutMetrics {
  labelSizes: Map<string, UniverseLabelSize>;
  layoutEpoch: number;
  viewportHeight: number;
  viewportWidth: number;
}

export interface ProjectedUniverseLabel {
  anchorX: number;
  anchorY: number;
  scale: number;
  slotX?: number;
  slotY?: number;
  visible: boolean;
  x: number;
  y: number;
}

export interface UniverseLabelProjectionWorkspace {
  cameraPosition: THREE.Vector3;
  layoutEpoch: number;
  offsets: LabelOffset[];
  order: number[];
  placed: LabelRect[];
  projectedPosition: THREE.Vector3;
  result: Record<string, ProjectedUniverseLabel>;
  worldPosition: THREE.Vector3;
}

interface LabelRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface LabelOffset {
  initialized: boolean;
  x: number;
  y: number;
}

interface UniverseLabelSize {
  height: number;
  width: number;
}

const REFERENCE_CAMERA_DISTANCE = 7.45;
const EDGE_PADDING_PX = 8;
const HORIZONTAL_GAP_PX = 6;
const VERTICAL_GAP_PX = 4;
export const UNIVERSE_LABEL_MISSING_ATTRIBUTE = "__projection_attribute_absent__";

export function universeLabelPriority(
  kind: UniverseLabelKind,
  focused: boolean,
): number {
  if (focused) {
    if (kind === "orbit") return 600;
    if (kind === "artist") return 500;
    return 400;
  }
  if (kind === "orbit") return 300;
  if (kind === "artist") return 200;
  return 100;
}

export function createUniverseLabelLayoutMetrics(
  labels: UniverseLabelDescriptor[],
): UniverseLabelLayoutMetrics {
  const labelSizes = new Map<string, UniverseLabelSize>();
  for (const label of labels) labelSizes.set(label.id, { height: 0, width: 0 });
  return { labelSizes, layoutEpoch: 0, viewportHeight: 0, viewportWidth: 0 };
}

export function writeUniverseLabelMeasurement(
  metrics: UniverseLabelLayoutMetrics,
  id: string,
  renderedWidth: number,
  renderedHeight: number,
  appliedScale: number,
): boolean {
  const size = metrics.labelSizes.get(id);
  if (!size) return false;
  const normalizedScale = Number.isFinite(appliedScale) && appliedScale > 0
    ? appliedScale
    : 1;
  const width = renderedWidth / normalizedScale;
  const height = renderedHeight / normalizedScale;
  if (Math.abs(size.width - width) < 0.25 && Math.abs(size.height - height) < 0.25) {
    return false;
  }
  size.width = width;
  size.height = height;
  metrics.layoutEpoch += 1;
  return true;
}

export function writeUniverseLabelViewportMeasurement(
  metrics: UniverseLabelLayoutMetrics,
  width: number,
  height: number,
): boolean {
  if (
    Math.abs(metrics.viewportWidth - width) < 0.25 &&
    Math.abs(metrics.viewportHeight - height) < 0.25
  ) return false;
  metrics.viewportWidth = width;
  metrics.viewportHeight = height;
  metrics.layoutEpoch += 1;
  return true;
}

export function projectUniverseLabels(
  labels: UniverseLabelDescriptor[],
  camera: THREE.Camera,
  metrics: UniverseLabelLayoutMetrics,
): Record<string, ProjectedUniverseLabel> {
  return writeUniverseLabelProjections(
    labels,
    camera,
    metrics,
    createUniverseLabelProjectionWorkspace(labels),
  );
}

export function createUniverseLabelProjectionWorkspace(
  labels: UniverseLabelDescriptor[],
): UniverseLabelProjectionWorkspace {
  const result: Record<string, ProjectedUniverseLabel> = {};
  for (const label of labels) {
    result[label.id] = {
      anchorX: 0,
      anchorY: 0,
      scale: 1,
      slotX: 0,
      slotY: 0,
      visible: false,
      x: 0,
      y: 0,
    };
  }
  return {
    cameraPosition: new THREE.Vector3(),
    layoutEpoch: -1,
    offsets: Array.from({ length: labels.length }, () => ({
      initialized: false,
      x: 0,
      y: 0,
    })),
    order: Array.from({ length: labels.length }, (_, index) => index).sort((left, right) => {
      const priorityDelta = labels[right]!.priority - labels[left]!.priority;
      if (priorityDelta !== 0) return priorityDelta;
      const leftId = labels[left]!.id;
      const rightId = labels[right]!.id;
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    }),
    placed: Array.from({ length: labels.length }, () => ({
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    })),
    projectedPosition: new THREE.Vector3(),
    result,
    worldPosition: new THREE.Vector3(),
  };
}

export function writeUniverseLabelProjections(
  labels: UniverseLabelDescriptor[],
  camera: THREE.Camera,
  metrics: UniverseLabelLayoutMetrics,
  workspace: UniverseLabelProjectionWorkspace,
): Record<string, ProjectedUniverseLabel> {
  if (workspace.layoutEpoch !== metrics.layoutEpoch) {
    workspace.layoutEpoch = metrics.layoutEpoch;
    for (let index = 0; index < workspace.offsets.length; index += 1) {
      workspace.offsets[index]!.initialized = false;
    }
  }
  workspace.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
  let placedCount = 0;

  for (let orderIndex = 0; orderIndex < workspace.order.length; orderIndex += 1) {
    const index = workspace.order[orderIndex]!;
    const label = labels[index]!;
    const projection = workspace.result[label.id];
    if (!projection) {
      throw new Error(`Projection workspace is missing label ${label.id}.`);
    }
    const offset = workspace.offsets[index]!;
    projection.slotX = offset.x;
    projection.slotY = offset.y;
    const worldPosition = workspace.worldPosition.set(
      label.point.x,
      label.point.y,
      label.point.z,
    );
    const projected = workspace.projectedPosition.copy(worldPosition).project(camera);
    const x = (projected.x + 1) * 50;
    const y = (1 - projected.y) * 50;
    const visible = projected.z >= -1 && projected.z <= 1 &&
      x >= -8 && x <= 108 && y >= -8 && y <= 108;
    const maximumScale = label.kind === "style"
      ? label.focused ? 1.05 : 1.14
      : 1.08;
    const scale = clamp(
      REFERENCE_CAMERA_DISTANCE / workspace.cameraPosition.distanceTo(worldPosition),
      0.56,
      maximumScale,
    );

    projection.anchorX = round(x);
    projection.anchorY = round(y);
    projection.scale = round(scale);
    projection.visible = visible;
    projection.x = round(x);
    projection.y = round(y);
    if (!visible) continue;

    const size = metrics.labelSizes.get(label.id);
    if (
      !size || size.width <= 0 || size.height <= 0 ||
      metrics.viewportWidth <= 0 || metrics.viewportHeight <= 0
    ) {
      projection.visible = false;
      continue;
    }
    const scaledWidthPx = size.width * scale;
    const scaledHeightPx = size.height * scale;
    if (
      scaledWidthPx > metrics.viewportWidth - EDGE_PADDING_PX * 2 ||
      scaledHeightPx > metrics.viewportHeight - EDGE_PADDING_PX * 2
    ) {
      projection.visible = false;
      continue;
    }
    const width = scaledWidthPx / metrics.viewportWidth * 100;
    const height = scaledHeightPx / metrics.viewportHeight * 100;
    const edgeX = EDGE_PADDING_PX / metrics.viewportWidth * 100;
    const edgeY = EDGE_PADDING_PX / metrics.viewportHeight * 100;
    const gapX = HORIZONTAL_GAP_PX / metrics.viewportWidth * 100;
    const gapY = VERTICAL_GAP_PX / metrics.viewportHeight * 100;

    const baseX = x;
    const anchorClearancePx = label.kind === "style"
      ? label.focused ? 20 : 8
      : label.kind === "artist"
        ? label.focused ? 16 : 6
        : label.focused ? 4 : 8;
    const anchorOffsetPx = scaledHeightPx / 2 + anchorClearancePx;
    const anchorDirection = label.kind === "style" || (label.kind === "orbit" && label.focused)
      ? -1
      : 1;
    const baseY = y + anchorDirection *
      anchorOffsetPx / metrics.viewportHeight * 100;
    let selectedX: number;
    let selectedY: number;
    let selected: boolean;
    if (offset.initialized) {
      selectedX = baseX + offset.x;
      selectedY = baseY + offset.y;
      selected = candidateFitsBounds(
        selectedX,
        selectedY,
        width,
        height,
        edgeX,
        edgeY,
      ) && candidateIsFree(
        selectedX,
        selectedY,
        width,
        height,
        workspace.placed,
        placedCount,
        gapX,
        gapY,
      );
      if (!selected) {
        projection.visible = false;
        continue;
      }
    } else {
      selectedX = clamp(baseX, width / 2 + edgeX, 100 - edgeX - width / 2);
      selectedY = clamp(baseY, height / 2 + edgeY, 100 - edgeY - height / 2);
      selected = candidateIsFree(
        selectedX,
        selectedY,
        width,
        height,
        workspace.placed,
        placedCount,
        gapX,
        gapY,
      );
    }

    const phase = (index % 8) * (Math.PI / 4);
    for (let ring = 1; ring <= 5 && !offset.initialized && !selected; ring += 1) {
      for (let step = 0; step < 8; step += 1) {
        const angle = phase + step * (Math.PI / 4);
        const candidateX = clamp(
          baseX + Math.cos(angle) * width * 0.72 * ring,
          width / 2 + edgeX,
          100 - edgeX - width / 2,
        );
        const candidateY = clamp(
          baseY + Math.sin(angle) * height * 0.9 * ring,
          height / 2 + edgeY,
          100 - edgeY - height / 2,
        );
        if (!candidateIsFree(
          candidateX,
          candidateY,
          width,
          height,
          workspace.placed,
          placedCount,
          gapX,
          gapY,
        )) continue;
        selectedX = candidateX;
        selectedY = candidateY;
        selected = true;
        break;
      }
    }

    if (!selected) {
      projection.visible = false;
      continue;
    }

    const placed = workspace.placed[placedCount]!;
    placed.x = selectedX;
    placed.y = selectedY;
    placed.width = width;
    placed.height = height;
    placedCount += 1;
    if (!offset.initialized) {
      offset.initialized = true;
      offset.x = selectedX - baseX;
      offset.y = selectedY - baseY;
    }
    projection.slotX = offset.x;
    projection.slotY = offset.y;
    projection.x = round(selectedX);
    projection.y = round(selectedY);
  }

  return workspace.result;
}

export function applyLabelProjection(
  element: HTMLElement,
  projection: ProjectedUniverseLabel,
): void {
  element.style.setProperty("--universe-x", `${projection.x}%`);
  element.style.setProperty("--universe-y", `${projection.y}%`);
  element.style.setProperty("--universe-anchor-x", `${projection.anchorX}%`);
  element.style.setProperty("--universe-anchor-y", `${projection.anchorY}%`);
  element.style.setProperty("--universe-scale", `${projection.scale}`);
  element.style.opacity = projection.visible ? "" : "0";
  element.style.pointerEvents = projection.visible ? "auto" : "none";
  element.dataset.labelScale = `${projection.scale}`;
  if (projection.slotX !== undefined) element.dataset.labelSlotX = `${projection.slotX}`;
  if (projection.slotY !== undefined) element.dataset.labelSlotY = `${projection.slotY}`;
  element.dataset.projectionState = projection.visible ? "visible" : "hidden";
  applyProjectionAccessibility(element, projection.visible);
}

function candidateFitsBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  edgeX: number,
  edgeY: number,
): boolean {
  return x - width / 2 >= edgeX && x + width / 2 <= 100 - edgeX &&
    y - height / 2 >= edgeY && y + height / 2 <= 100 - edgeY;
}

function candidateIsFree(
  x: number,
  y: number,
  width: number,
  height: number,
  placed: LabelRect[],
  placedCount: number,
  gapX: number,
  gapY: number,
): boolean {
  for (let index = 0; index < placedCount; index += 1) {
    const existing = placed[index]!;
    if (
      Math.abs(x - existing.x) < (width + existing.width) / 2 + gapX &&
      Math.abs(y - existing.y) < (height + existing.height) / 2 + gapY
    ) return false;
  }
  return true;
}

function applyProjectionAccessibility(element: HTMLElement, visible: boolean): void {
  cacheProjectionAccessibility(element);
  if (!visible) {
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("inert", "");
    element.setAttribute("tabindex", "-1");
    return;
  }
  restoreAttribute(element, "aria-hidden", element.dataset.projectionOriginalAriaHidden);
  restoreAttribute(element, "inert", element.dataset.projectionOriginalInert);
  restoreAttribute(element, "tabindex", element.dataset.projectionOriginalTabIndex);
}

function cacheProjectionAccessibility(element: HTMLElement): void {
  if (element.dataset.projectionAccessibilityCached === "true") return;
  element.dataset.projectionAccessibilityCached = "true";
  element.dataset.projectionOriginalAriaHidden =
    element.getAttribute("aria-hidden") ?? UNIVERSE_LABEL_MISSING_ATTRIBUTE;
  element.dataset.projectionOriginalInert = element.hasAttribute("inert")
    ? element.getAttribute("inert") ?? ""
    : UNIVERSE_LABEL_MISSING_ATTRIBUTE;
  element.dataset.projectionOriginalTabIndex =
    element.getAttribute("tabindex") ?? UNIVERSE_LABEL_MISSING_ATTRIBUTE;
}

function restoreAttribute(
  element: HTMLElement,
  name: string,
  value: string | undefined,
): void {
  if (value === undefined || value === UNIVERSE_LABEL_MISSING_ATTRIBUTE) {
    element.removeAttribute(name);
  }
  else element.setAttribute(name, value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
