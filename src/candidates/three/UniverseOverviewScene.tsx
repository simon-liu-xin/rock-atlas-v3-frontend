import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
  type RefObject,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { UniverseState } from "../../app/experiment/universe-navigation.ts";
import { useMotionMode } from "../../app/motion/MotionModeProvider.tsx";
import {
  sceneDensityProfile,
  type UniverseSearchMatch,
  universeDetailDepth,
} from "../../app/experiment/ui-motion.ts";
import type { UniverseOverviewViewModel, UniversePoint } from "../../experiment/viewmodel/universe-overview-model.ts";
import {
  buildUniverseOverviewSceneModel,
  particlePositionsForDetail,
  type UniverseArtistStar,
  type UniverseBridge,
  type UniverseOrbitBody,
} from "./universe-overview-scene-model.ts";
import {
  applyLabelProjection,
  createUniverseLabelLayoutMetrics,
  createUniverseLabelProjectionWorkspace,
  universeLabelPriority,
  writeUniverseLabelMeasurement,
  type ProjectedUniverseLabel,
  type UniverseLabelDescriptor,
  type UniverseLabelLayoutMetrics,
  UNIVERSE_LABEL_MISSING_ATTRIBUTE,
  writeUniverseLabelViewportMeasurement,
  writeUniverseLabelProjections,
} from "./universe-label-projection.ts";
import { buildRoundParticleTexture } from "./round-particle-texture.ts";
import { buildParticleBridgeGeometry } from "./particle-bridge-geometry.ts";
import {
  BRIDGE_FACT_COLOR,
  BRIDGE_HYPOTHESIS_COLOR,
  bridgeParticlePresentation,
} from "./bridge-visual.ts";
import { buildParticleOrbitTrackGeometry } from "./particle-orbit-track.ts";
import {
  advanceInteractiveOrbitAngle,
  ORBIT_HOVER_SPEED_SCALE,
  orbitHoverPresentation,
} from "./orbit-hover-visual.ts";
import {
  getArtistParticleVisual,
  getReleaseOrbitBodyVisual,
} from "./orbit-body-visual.ts";
import { ParticleStar, type ParticleStarPalette } from "./ParticleStar.tsx";
import {
  createUniverseSceneTargetUserData,
  shouldDeferToCloserStyleTarget,
  shouldDeferToReleaseTarget,
  UNIVERSE_RELEASE_HIT_PROXY_NAME,
} from "./universe-scene-interaction.ts";
import { StyleNebula } from "./StyleNebula.tsx";
import {
  createStarMotionProfile,
  writeBackgroundMotion,
  writeStarMotion,
  type BackgroundMotionSample,
  type StarMotionSample,
} from "./ambient-scene-motion.ts";
import {
  AmbientSceneMotion,
  useAmbientTime,
} from "./AmbientSceneMotion.tsx";
import {
  bridgeSignalColor,
} from "./transient-scene-motion.ts";
import {
  GLOBAL_BRIDGE_INTENSITY,
  GLOBAL_LABEL_REVEAL_ZOOM,
  bridgeIntensity,
  filterBridgesForVisibleStyleLabels,
  globalLabelTier,
  overviewZoomRatio,
  type GlobalLabelTier,
} from "./universe-global-lod.ts";
import {
  AmbientBridgeSignal,
  ArtistBreathingHalo,
  BridgeSignal,
  SelectionPulse,
} from "./TransientSceneMotion.tsx";

interface UniverseOverviewSceneProps {
  model: UniverseOverviewViewModel;
  state: UniverseState;
  onSelectStyle: (styleId: string) => void;
  onSelectArtist: (artistId: string) => void;
  onSelectReleaseGroup: (releaseGroupId: string) => void;
  onContextLost: () => void;
  searchMatch: UniverseSearchMatch;
  searchToken: string;
}

const SELECTED_ARTIST_PALETTE = {
  body: "#f0c46f",
  highlight: "#fff1bd",
  shadow: "#563610",
} as const satisfies ParticleStarPalette;

const DEFAULT_ARTIST_PALETTE = {
  body: "#7F8995",
  highlight: "#C2C7CF",
  shadow: "#464C55",
} as const satisfies ParticleStarPalette;

const SELECTED_RELEASE_PALETTE = {
  body: "#f0c46f",
  highlight: "#fff1bd",
  shadow: "#563610",
} as const satisfies ParticleStarPalette;

const DEFAULT_RELEASE_PALETTE = {
  body: "#74d9e7",
  highlight: "#eaffff",
  shadow: "#123743",
} as const satisfies ParticleStarPalette;

const bridgeParticleTexture = buildRoundParticleTexture(48);

export function UniverseOverviewScene({
  model,
  state,
  onSelectStyle,
  onSelectArtist,
  onSelectReleaseGroup,
  onContextLost,
  searchMatch,
  searchToken,
}: UniverseOverviewSceneProps) {
  const viewportWidth = useViewportWidth();
  const density = useMemo(
    () => sceneDensityProfile(viewportWidth, universeDetailDepth(state)),
    [state, viewportWidth],
  );
  const scene = useMemo(
    () => buildUniverseOverviewSceneModel(model, state, density),
    [density, model, state],
  );
  const orbitMaxRadius = String(
    scene.orbit_bodies.reduce((maximum, body) => Math.max(maximum, body.radius), 0),
  );
  const [sceneReady, setSceneReady] = useState(false);
  const [globalLabelTier, setGlobalLabelTier] = useState<GlobalLabelTier>("overview");
  const [projectedStyleLabelIds, setProjectedStyleLabelIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [hoveredReleaseGroupId, setHoveredReleaseGroupId] = useState<string | null>(null);
  const boundaryRef = useRef<HTMLDivElement | null>(null);
  const labelElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const orbitObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const markReady = useCallback(() => setSceneReady(true), []);
  const registerOrbitObject = useCallback((id: string, object: THREE.Object3D | null) => {
    if (object) orbitObjectsRef.current.set(id, object);
    else orbitObjectsRef.current.delete(id);
  }, []);
  const compactLabels = density.compactLabels;
  const effectiveLabelTier = state.focus_id ? "expanded" : globalLabelTier;
  const eligibleStyleLabelIds = useMemo(() => {
    const ids = new Set(
      state.focus_id
        ? scene.visible_style_label_ids
        : effectiveLabelTier === "expanded"
          ? scene.expanded_style_label_ids
          : scene.overview_style_label_ids,
    );
    if (state.focus_id) ids.add(state.focus_id);
    if (!state.focus_id) {
      for (const styleId of searchMatch.styleIds) ids.add(styleId);
    }
    return ids;
  }, [effectiveLabelTier, scene.expanded_style_label_ids, scene.overview_style_label_ids, scene.visible_style_label_ids, searchMatch.styleIds, state.focus_id]);
  const eligibleStyleNuclei = useMemo(
    () => scene.style_nuclei.filter((style) => eligibleStyleLabelIds.has(style.style_id)),
    [eligibleStyleLabelIds, scene.style_nuclei],
  );
  const visibleBridges = useMemo(
    () => filterBridgesForVisibleStyleLabels(
      scene.bridges,
      projectedStyleLabelIds,
      !state.focus_id,
    ),
    [projectedStyleLabelIds, scene.bridges, state.focus_id],
  );
  const handleVisibleStyleLabelsChange = useCallback((ids: ReadonlySet<string>) => {
    setProjectedStyleLabelIds((current) => setsEqual(current, ids) ? current : new Set(ids));
  }, []);
  useEffect(() => {
    setProjectedStyleLabelIds(new Set());
  }, [eligibleStyleLabelIds]);
  const renderedArtistIds = useMemo(
    () => new Set(scene.visible_artist_star_ids),
    [scene.visible_artist_star_ids],
  );
  const renderedArtists = useMemo(
    () => scene.artist_stars.filter((artist) => renderedArtistIds.has(artist.artist_id)),
    [renderedArtistIds, scene.artist_stars],
  );
  const visibleArtists = useMemo(
    () => renderedArtists.filter((artist) =>
      scene.visible_artist_label_ids.includes(artist.artist_id),
    ),
    [renderedArtists, scene.visible_artist_label_ids],
  );
  const activeHoveredReleaseGroupId = scene.orbit_bodies.some(
    (body) => body.release_group_id === hoveredReleaseGroupId,
  ) ? hoveredReleaseGroupId : null;
  const nebulaClouds = useMemo(() => scene.style_particle_ranges
    .filter((range) => range.detail === "high")
    .map((range) => {
      const start = range.offset * 3;
      const end = start + range.count * 3;
      const style = scene.style_nuclei.find((candidate) => candidate.style_id === range.style_id)!;
      return {
        ...style,
        colors: scene.density_colors.slice(start, end),
        positions: scene.density_positions.slice(start, end),
      };
    }), [scene.density_colors, scene.density_positions, scene.style_nuclei, scene.style_particle_ranges]);
  const lowDetailPositions = useMemo(
    () => particlePositionsForDetail(
      scene.density_positions,
      scene.style_particle_ranges,
      "low",
    ),
    [scene.density_positions, scene.style_particle_ranges],
  );
  const lowDetailColors = useMemo(
    () => particlePositionsForDetail(
      scene.density_colors,
      scene.style_particle_ranges,
      "low",
    ),
    [scene.density_colors, scene.style_particle_ranges],
  );
  const labelDescriptors = useMemo<UniverseLabelDescriptor[]>(() => [
    ...(scene.show_style_layer ? eligibleStyleNuclei.map((style) => ({
      focused: style.selected,
      id: style.style_id,
      kind: "style" as const,
      point: style.position,
      priority: universeLabelPriority("style", style.selected),
      text: style.canonical_name,
    })) : []),
    ...visibleArtists.map((artist) => ({
      focused: artist.selected,
      id: artist.artist_id,
      kind: "artist" as const,
      point: artist.position,
      priority: universeLabelPriority("artist", artist.selected),
      text: artist.canonical_name,
    })),
    ...scene.orbit_bodies.map((body) => ({
      focused: body.selected,
      id: body.release_group_id,
      kind: "orbit" as const,
      point: { ...body.position },
      priority: universeLabelPriority("orbit", body.selected),
      text: body.canonical_name,
    })),
  ], [eligibleStyleNuclei, scene.orbit_bodies, scene.show_style_layer, visibleArtists]);
  const labelMetrics = useMemo(
    () => createUniverseLabelLayoutMetrics(labelDescriptors),
    [labelDescriptors],
  );
  const registerLabelElement = useCallback((id: string, element: HTMLElement | null) => {
    if (!element) {
      labelElementsRef.current.delete(id);
      return;
    }
    labelElementsRef.current.set(id, element);
    measureLabelElement(labelMetrics, id, element);
  }, [labelMetrics]);
  const labelStyles = useMemo(() => {
    const styles = new Map<string, CSSProperties>();
    for (const label of labelDescriptors) {
      styles.set(label.id, labelStyle(undefined, label.point));
    }
    return styles;
  }, [labelDescriptors]);
  useEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    const preventPinchZoom = (event: WheelEvent) => {
      if (event.ctrlKey && event.cancelable) event.preventDefault();
    };
    const preventGestureZoom = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    const gestureEvents = ["gesturestart", "gesturechange", "gestureend"] as const;
    boundary.addEventListener("webglcontextlost", handleContextLost, true);
    boundary.addEventListener("wheel", preventPinchZoom, { capture: true, passive: false });
    boundary.addEventListener("contextmenu", preventGestureZoom);
    gestureEvents.forEach((eventName) => {
      boundary.addEventListener(eventName, preventGestureZoom, { passive: false });
    });
    return () => {
      boundary.removeEventListener("webglcontextlost", handleContextLost, true);
      boundary.removeEventListener("wheel", preventPinchZoom, true);
      boundary.removeEventListener("contextmenu", preventGestureZoom);
      gestureEvents.forEach((eventName) => {
        boundary.removeEventListener(eventName, preventGestureZoom);
      });
    };
  }, [onContextLost]);

  return (
    <section
      className="universe-overview-scene"
      data-artist-stars={scene.artist_stars.length}
      data-ambient-bridge-signals={visibleBridges.filter((bridge) => bridge.segment_role !== "undirected").length}
      data-background-particles={density.backgroundCount}
      data-background-context={state.artist_id ? "blurred" : "normal"}
      data-bridge-count={visibleBridges.length}
      data-relation-count={new Set(visibleBridges.map((bridge) => bridge.relation_id)).size}
      data-bridge-mode={state.focus_id ? "focused" : "overview"}
      data-bridge-palette={`fact:${BRIDGE_FACT_COLOR}|hypothesis:${BRIDGE_HYPOTHESIS_COLOR}`}
      data-bridge-flows={visibleBridges
        .map((bridge) =>
          `${bridge.flow_source_id ?? "anonymous-merge-point"}>${bridge.flow_target_id ?? "anonymous-merge-point"}`
        )
        .join("|")}
      data-bridge-signal-count={visibleBridges.filter((bridge) => bridge.segment_role !== "undirected").length}
      data-bridge-visual="semantic-particle-strands-v3"
      data-camera-controls="orbit-rotate-pan-zoom"
      data-pan-gestures="shift-primary|middle|secondary|two-finger"
      data-global-bridge-intensity={state.focus_id ? 1 : GLOBAL_BRIDGE_INTENSITY}
      data-global-style-target={model.styles.length}
      data-focus-context-style-count={state.focus_id ? scene.visible_style_label_ids.length : 0}
      data-focus-context-style-ids={state.focus_id ? scene.visible_style_label_ids.join("|") : ""}
      data-high-detail-style-count={scene.style_nuclei.filter((style) => style.detail === "high").length}
      data-low-detail-style-count={scene.style_nuclei.filter((style) => style.detail === "low").length}
      data-low-detail-style-batches={lowDetailPositions.length > 0 ? 1 : 0}
      data-nebula-color-mode="style-palette"
      data-style-label-tier={effectiveLabelTier}
      data-eligible-style-labels={eligibleStyleLabelIds.size}
      data-visible-style-labels={projectedStyleLabelIds.size}
      data-semantic-style-count={projectedStyleLabelIds.size}
      data-semantic-style-ids={[...projectedStyleLabelIds].sort().join("|")}
      data-artist-material="particle-star-depth-v2"
      data-nebula-visual="seeded-spiral-arms-v1"
      data-od-id="universe-overview-scene"
      data-rendered-artist-stars={renderedArtists.length}
      data-artist-breathing={state.artist_id ? "true" : "false"}
      data-orbit-body-count={scene.orbit_bodies.length}
      data-orbit-max-radius={orbitMaxRadius}
      data-orbit-visual="kepler-particle-rings-v4"
      data-hovered-orbit-speed-scale={activeHoveredReleaseGroupId ? ORBIT_HOVER_SPEED_SCALE : 1}
      data-hovered-release-group-id={activeHoveredReleaseGroupId ?? ""}
      data-search-active={searchMatch.active ? "true" : "false"}
      data-search-scan-count={searchMatch.styleIds.size}
      data-scene-ready={sceneReady ? "true" : "false"}
      data-transient-visual="particle-pulses-v1"
      data-style-layer={scene.show_style_layer ? "true" : "false"}
      data-style-particles={density.styleParticleCount}
      data-visible-artist-labels={scene.visible_artist_label_ids.length}
      ref={boundaryRef}
    >
      <div aria-hidden="true" className="universe-overview-canvas">
        <Canvas
          camera={{ position: [0, 0.1, initialCameraDistance()], fov: 46, near: 0.1, far: 40 }}
          dpr={[1, 1.4]}
          frameloop="demand"
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#03050a"]} />
          <fog attach="fog" args={["#03050a", 8.8, 16]} />
          <hemisphereLight color="#dbe8f2" groundColor="#071018" intensity={0.72} />
          <directionalLight color="#fff3d6" intensity={1.4} position={[-3.5, 5, 6]} />
          <UniverseMotionLayer
            artistId={state.artist_id}
            model={model}
            onGlobalLabelTierChange={setGlobalLabelTier}
            onReady={markReady}
            styleId={state.focus_id}
          >
            <BackgroundField positions={scene.background_positions} />
            {scene.show_style_layer ? (
              <LowDetailNebulaField
                colors={lowDetailColors}
                dimmed={Boolean(state.focus_id || state.artist_id)}
                positions={lowDetailPositions}
              />
            ) : null}
            {scene.show_style_layer ? nebulaClouds.map((style) => (
              <StyleNebula
                backgrounded={Boolean(state.artist_id)}
                center={style.position}
                color={style.color}
                colors={style.colors}
                deemphasized={Boolean(state.focus_id && !style.contextual)}
                filtered={style.filtered}
                key={style.style_id}
                onClick={(event: ThreeEvent<MouseEvent>) => {
                  if (shouldDeferToReleaseTarget(event.intersections)) return;
                  if (shouldDeferToCloserStyleTarget(
                    event.intersections,
                    style.style_id,
                    event.ray,
                  )) return;
                  event.stopPropagation();
                  onSelectStyle(style.style_id);
                }}
                positions={style.positions}
                searchActive={searchMatch.active}
                searchMatch={searchMatch.styleIds.has(style.style_id)}
                searchToken={searchToken}
                selected={style.selected}
                styleId={style.style_id}
              />
            )) : null}
            {scene.show_style_layer
              ? visibleBridges.map((bridge) => (
                  <LightBridge
                    bridge={bridge}
                    dimmed={Boolean(state.artist_id)}
                    key={bridge.segment_id}
                    overview={!state.focus_id}
                  />
                ))
              : null}
            {renderedArtists.map((artist) => (
              <ArtistStar
                artist={artist}
                expanded={Boolean(state.focus_id)}
                key={artist.artist_id}
                onSelect={onSelectArtist}
                searchActive={searchMatch.active}
                searchMatch={searchMatch.artistIds.has(artist.artist_id)}
              />
            ))}
            {scene.orbit_bodies.map((body) => (
              <ReleaseOrbit
                body={body}
                hoveredReleaseGroupId={activeHoveredReleaseGroupId}
                key={body.release_group_id}
                onHover={setHoveredReleaseGroupId}
                onSelect={onSelectReleaseGroup}
                registerObject={registerOrbitObject}
              />
            ))}
            <UniverseLabelProjection
              boundaryRef={boundaryRef}
              compact={compactLabels}
              labelElementsRef={labelElementsRef}
              labels={labelDescriptors}
              metrics={labelMetrics}
              onVisibleStyleLabelsChange={handleVisibleStyleLabelsChange}
              orbitObjectsRef={orbitObjectsRef}
            />
          </UniverseMotionLayer>
        </Canvas>
      </div>

      <div className="universe-scene-labels">
        {scene.show_style_layer ? eligibleStyleNuclei.map((style) => {
          const record = model.styles.find((candidate) => candidate.internal_id === style.style_id)!;
          return (
            <button
              aria-pressed={style.selected}
              className={`universe-style-label${style.selected ? " is-selected" : ""}${style.filtered ? " is-filtered" : ""}${state.artist_id ? style.selected ? " is-context" : " is-deemphasized" : ""}${searchMatch.active ? searchMatch.styleIds.has(style.style_id) ? " is-search-match" : " is-search-dimmed" : ""}`}
              data-label-scale="1"
              data-style-id={style.style_id}
              data-world-position={`${style.position.x},${style.position.y},${style.position.z}`}
              key={style.style_id}
              onClick={() => onSelectStyle(style.style_id)}
              ref={(element) => registerLabelElement(style.style_id, element)}
              style={labelStyles.get(style.style_id)}
              {...INITIAL_LABEL_ACCESSIBILITY}
              type="button"
            >
              <strong>{style.canonical_name}</strong>
              <small>{record.era}</small>
            </button>
          );
        }) : null}
        {visibleArtists.map((artist) => {
            const parent = model.styles.find((style) => style.internal_id === artist.style_id)!;
            const mobileVisible = state.focus_id === artist.style_id ||
              parent.representative_artist_ids[0] === artist.artist_id;
            return (
              <button
                aria-pressed={artist.selected}
                className={`universe-artist-label${artist.selected ? " is-selected" : ""}${artist.filtered ? " is-filtered" : ""}${artist.dimmed ? " is-deemphasized" : ""}${searchMatch.active ? searchMatch.artistIds.has(artist.artist_id) ? " is-search-match" : " is-search-dimmed" : ""}`}
                data-label-scale="1"
                data-mobile-visible={mobileVisible ? "true" : "false"}
                data-scene-artist-id={artist.artist_id}
                key={artist.artist_id}
                onClick={() => onSelectArtist(artist.artist_id)}
                ref={(element) => registerLabelElement(artist.artist_id, element)}
                style={labelStyles.get(artist.artist_id)}
                {...INITIAL_LABEL_ACCESSIBILITY}
                type="button"
              >
                <span aria-hidden="true" />
                {artist.canonical_name}
              </button>
            );
          })}
        {scene.orbit_bodies.map((body) => {
          const interaction = orbitHoverPresentation(
            body.release_group_id,
            activeHoveredReleaseGroupId,
            body.selected,
          );
          return <button
            aria-pressed={body.selected}
            className={`universe-orbit-label${body.selected ? " is-selected" : ""}${interaction.interactionState === "hovered" ? " is-hovered" : ""}${interaction.interactionState === "dimmed" ? " is-orbit-dimmed" : ""}`}
            data-label-scale="1"
            data-orbit-interaction-state={interaction.interactionState}
            data-scene-release-group-id={body.release_group_id}
            key={body.release_group_id}
            onBlur={() => setHoveredReleaseGroupId((current) =>
              current === body.release_group_id ? null : current
            )}
            onClick={() => onSelectReleaseGroup(body.release_group_id)}
            onFocus={() => setHoveredReleaseGroupId(body.release_group_id)}
            onPointerEnter={() => setHoveredReleaseGroupId(body.release_group_id)}
            onPointerLeave={(event) => {
              if (document.activeElement === event.currentTarget) return;
              setHoveredReleaseGroupId((current) =>
                current === body.release_group_id ? null : current
              );
            }}
            ref={(element) => registerLabelElement(body.release_group_id, element)}
            style={labelStyles.get(body.release_group_id)}
            {...INITIAL_LABEL_ACCESSIBILITY}
            type="button"
          >
            <span aria-hidden="true" />
            {body.canonical_name}
          </button>;
        })}
      </div>
    </section>
  );
}

function UniverseMotionLayer({
  artistId,
  children,
  model,
  onGlobalLabelTierChange,
  onReady,
  styleId,
}: PropsWithChildren<{
  artistId: string | null;
  model: UniverseOverviewViewModel;
  onGlobalLabelTierChange: (tier: GlobalLabelTier) => void;
  onReady: () => void;
  styleId: string | null;
}>) {
  const { active } = useMotionMode();
  return (
    <AmbientSceneMotion active={active}>
      {children}
      <UniverseCameraController
        artistId={artistId}
        model={model}
        motionActive={active}
        onGlobalLabelTierChange={onGlobalLabelTierChange}
        onReady={onReady}
        styleId={styleId}
      />
    </AmbientSceneMotion>
  );
}

function BackgroundField({ positions }: { positions: Float32Array }) {
  const pointsRef = useRef<THREE.Points>(null);
  const sampleRef = useRef<BackgroundMotionSample>({ rotationX: 0, rotationZ: 0 });
  const { active, elapsed } = useAmbientTime();
  const texture = useMemo(() => buildRoundParticleTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    const points = pointsRef.current;
    if (!active || !points) return;
    const sample = writeBackgroundMotion(elapsed.current, sampleRef.current);
    points.rotation.x = sample.rotationX;
    points.rotation.z = sample.rotationZ;
  });
  return (
    <points name="ambient-background-field" ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        blending={THREE.AdditiveBlending}
        color="#728092"
        depthWrite={false}
        map={texture}
        opacity={0.35}
        size={0.028}
        sizeAttenuation
        transparent
      />
    </points>
  );
}

function LowDetailNebulaField({
  colors,
  dimmed,
  positions,
}: {
  colors: Float32Array;
  dimmed: boolean;
  positions: Float32Array;
}) {
  if (positions.length === 0) return null;
  return (
    <points name="low-detail-nebula-field">
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        alphaTest={0.02}
        blending={THREE.AdditiveBlending}
        color="#ffffff"
        depthWrite={false}
        map={bridgeParticleTexture}
        opacity={dimmed ? 0.12 : 0.34}
        size={0.032}
        sizeAttenuation
        toneMapped={false}
        transparent
        vertexColors
      />
    </points>
  );
}

function ArtistStar({
  artist,
  expanded,
  onSelect,
  searchActive,
  searchMatch,
}: {
  artist: UniverseArtistStar;
  expanded: boolean;
  onSelect: (artistId: string) => void;
  searchActive: boolean;
  searchMatch: boolean;
}) {
  const visualRef = useRef<THREE.Group>(null);
  const stopAndSelect = (event: ThreeEvent<MouseEvent>) => {
    if (shouldDeferToReleaseTarget(event.intersections)) return;
    event.stopPropagation();
    onSelect(artist.artist_id);
  };
  const opacity = artist.filtered
    ? 0.08
    : searchActive && !searchMatch && !artist.selected
      ? 0.1
      : artist.dimmed
        ? 0.22
        : artist.emphasized
          ? 1
          : 0.46;
  const visual = getArtistParticleVisual(artist.selected, expanded);
  const palette = artist.selected ? SELECTED_ARTIST_PALETTE : DEFAULT_ARTIST_PALETTE;
  const coreOpacity = artist.dimmed ? 0 : opacity;
  const particleHaloOpacity = artist.dimmed ? 0 : visual.haloOpacity;
  return (
    <group position={pointTuple(artist.position)}>
      <ParticleStar
        depthOcclusion={artist.selected}
        haloOpacity={particleHaloOpacity}
        haloScale={visual.haloScale}
        hitRadius={visual.hitRadius}
        onClick={stopAndSelect}
        opacity={coreOpacity}
        palette={palette}
        pointCount={visual.pointCount}
        radius={visual.radius}
        visualRef={visualRef}
      />
      {artist.selected ? <ArtistBreathingHalo radius={visual.radius} /> : null}
      <ArtistAmbientMotion
        artistId={artist.artist_id}
        coreOpacity={coreOpacity}
        haloOpacity={particleHaloOpacity * opacity}
        visualRef={visualRef}
      />
    </group>
  );
}

function ArtistAmbientMotion({
  artistId,
  coreOpacity,
  haloOpacity,
  visualRef,
}: {
  artistId: string;
  coreOpacity: number;
  haloOpacity: number;
  visualRef: RefObject<THREE.Group | null>;
}) {
  const { active, elapsed } = useAmbientTime();
  const profile = useMemo(() => createStarMotionProfile(artistId), [artistId]);
  const sampleRef = useRef<StarMotionSample>({ halo: 1, scale: 1 });

  useFrame(() => {
    const visual = visualRef.current;
    if (!active || !visual) return;
    const sample = writeStarMotion(elapsed.current, profile, sampleRef.current);
    visual.scale.setScalar(sample.scale);

    const halo = visual.getObjectByName("particle-star-halo") as THREE.Sprite | undefined;
    if (halo) halo.material.opacity = haloOpacity * sample.halo;
    const core = visual.getObjectByName("particle-star-core") as
      | THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
      | undefined;
    if (core) core.material.opacity = coreOpacity * sample.halo;
  });

  return null;
}

export function LightBridge({
  bridge,
  dimmed = false,
  overview = false,
}: {
  bridge: UniverseBridge;
  dimmed?: boolean;
  overview?: boolean;
}) {
  const curve = useMemo(() => {
    const start = vector(bridge.source);
    const end = vector(bridge.target);
    const midpoint = start.clone().lerp(end, 0.5);
    const direction = end.clone().sub(start);
    midpoint.add(new THREE.Vector3(-direction.y, direction.x, 0).normalize().multiplyScalar(0.18));
    midpoint.z += 0.16;
    return new THREE.QuadraticBezierCurve3(start, midpoint, end);
  }, [bridge]);
  const color = bridgeSignalColor(bridge.assertion_kind);
  const geometry = useMemo(
    () => buildParticleBridgeGeometry(curve, bridge.segment_id, overview),
    [bridge.segment_id, curve, overview],
  );
  const intensity = bridgeIntensity(overview);
  const presentation = bridgeParticlePresentation(intensity, dimmed);
  return (
    <group>
      <points geometry={geometry} name="particle-light-bridge">
        <pointsMaterial
          alphaTest={0.02}
          blending={THREE.AdditiveBlending}
          color={color}
          depthTest
          depthWrite={false}
          map={bridgeParticleTexture}
          opacity={presentation.coreOpacity}
          size={presentation.coreSize}
          sizeAttenuation
          toneMapped={false}
          transparent
        />
      </points>
      <points geometry={geometry} name="particle-light-bridge-glow">
        <pointsMaterial
          alphaTest={0.005}
          blending={THREE.AdditiveBlending}
          color={color}
          depthTest
          depthWrite={false}
          map={bridgeParticleTexture}
          opacity={presentation.glowOpacity}
          size={presentation.glowSize}
          sizeAttenuation
          toneMapped={false}
          transparent
        />
      </points>
      {bridge.segment_role === "undirected" ? null : (
        <AmbientBridgeSignal
          assertionKind={bridge.assertion_kind}
          curve={curve}
          dimmed={dimmed}
          intensity={intensity}
          relationId={bridge.segment_id}
        />
      )}
      {overview || bridge.segment_role === "undirected" ? null : (
        <BridgeSignal
          assertionKind={bridge.assertion_kind}
          curve={curve}
          dimmed={dimmed}
        />
      )}
    </group>
  );
}

function ReleaseOrbit({
  body,
  hoveredReleaseGroupId,
  onHover,
  onSelect,
  registerObject,
}: {
  body: UniverseOrbitBody;
  hoveredReleaseGroupId: string | null;
  onHover: (releaseGroupId: string | null) => void;
  onSelect: (releaseGroupId: string) => void;
  registerObject: (releaseGroupId: string, object: THREE.Object3D | null) => void;
}) {
  const { elapsed } = useAmbientTime();
  const orbitRef = useRef<THREE.Group>(null);
  const angleRef = useRef(body.initial_angle);
  const lastElapsedRef = useRef<number | null>(null);
  const visual = getReleaseOrbitBodyVisual(body.selected);
  const interaction = orbitHoverPresentation(
    body.release_group_id,
    hoveredReleaseGroupId,
    body.selected,
  );
  const trackGeometry = useMemo(
    () => buildParticleOrbitTrackGeometry(body.radius, body.track_index),
    [body.radius, body.track_index],
  );
  const palette = body.selected ? SELECTED_RELEASE_PALETTE : DEFAULT_RELEASE_PALETTE;
  const hitProxyUserData = useMemo(
    () => createUniverseSceneTargetUserData("release", body.release_group_id),
    [body.release_group_id],
  );
  const registerBody = useCallback((object: THREE.Group | null) => {
    registerObject(body.release_group_id, object);
  }, [body.release_group_id, registerObject]);
  const stopAndSelect = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(body.release_group_id);
  };
  useFrame(() => {
    const orbit = orbitRef.current;
    if (!orbit) return;
    const previousElapsed = lastElapsedRef.current;
    lastElapsedRef.current = elapsed.current;
    if (previousElapsed !== null) {
      angleRef.current = advanceInteractiveOrbitAngle(
        angleRef.current,
        elapsed.current - previousElapsed,
        body.angular_velocity,
        interaction.speedScale,
      );
    }
    orbit.rotation.z = angleRef.current;
  });
  const beginHover = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(body.release_group_id);
  };
  const endHover = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(null);
  };
  return (
    <group name="release-orbit-system">
      <group position={pointTuple(body.center)} rotation={[body.tilt, 0, 0]}>
        <points geometry={trackGeometry} name="release-orbit-track">
          <pointsMaterial
            alphaTest={0.02}
            blending={THREE.AdditiveBlending}
            color="#74d9e7"
            depthTest
            depthWrite={false}
            map={bridgeParticleTexture}
            opacity={interaction.trackOpacity}
            size={interaction.trackSize}
            sizeAttenuation
            toneMapped={false}
            transparent
          />
        </points>
        <group ref={orbitRef} rotation={[0, 0, body.initial_angle]}>
          <group
            name="release-orbit-body"
            onPointerEnter={beginHover}
            onPointerLeave={endHover}
            position={[body.radius, 0, 0]}
            ref={registerBody}
          >
            <ParticleStar
              haloOpacity={visual.haloOpacity}
              haloScale={visual.haloScale}
              hitRadius={visual.hitRadius}
              hitProxyName={UNIVERSE_RELEASE_HIT_PROXY_NAME}
              hitProxyUserData={hitProxyUserData}
              onClick={stopAndSelect}
              opacity={interaction.bodyOpacity}
              palette={palette}
              pointCount={visual.pointCount}
              radius={visual.radius}
            />
            {body.selected ? (
              <SelectionPulse color="#f0c46f" name="release-selection-pulse" radius={0.045} />
            ) : null}
          </group>
        </group>
      </group>
    </group>
  );
}

function UniverseCameraController({
  model,
  styleId,
  artistId,
  motionActive,
  onGlobalLabelTierChange,
  onReady,
}: {
  model: UniverseOverviewViewModel;
  styleId: string | null;
  artistId: string | null;
  motionActive: boolean;
  onGlobalLabelTierChange: (tier: GlobalLabelTier) => void;
  onReady: () => void;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.panSpeed = 1;
    controls.minDistance = 2.1;
    controls.maxDistance = 10.5;
    controls.minPolarAngle = Math.PI * 0.32;
    controls.maxPolarAngle = Math.PI * 0.68;
    const handleChange = () => {
      const distance = camera.position.distanceTo(controls.target);
      gl.domElement.dataset.cameraDistance = String(distance);
      gl.domElement.dataset.cameraTarget = controls.target.toArray().join(",");
      const zoom = styleId
        ? GLOBAL_LABEL_REVEAL_ZOOM
        : overviewZoomRatio(distance, overviewCameraDistance(size.width, size.height));
      onGlobalLabelTierChange(globalLabelTier(zoom));
      invalidate();
    };
    controls.addEventListener("change", handleChange);
    controlsRef.current = controls;
    controls.update();
    handleChange();
    const readyFrame = window.requestAnimationFrame(onReady);
    return () => {
      window.cancelAnimationFrame(readyFrame);
      controls.removeEventListener("change", handleChange);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate, onGlobalLabelTierChange, onReady, size.height, size.width, styleId]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const focus = artistId
      ? model.layout.artist_positions[artistId]
      : styleId
        ? model.layout.style_positions[styleId]
        : { x: 0, y: 0, z: 0 };
    if (!focus) return;
    const distance = artistId ? 3.8 : styleId ? 4.5 : overviewCameraDistance(size.width, size.height);
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const endPosition = new THREE.Vector3(focus.x, focus.y + 0.06, focus.z + distance);
    const endTarget = vector(focus);
    const duration = motionActive ? 320 : 0;
    let frame = 0;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = duration === 0 ? 1 : Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(startPosition, endPosition, eased);
      controls.target.lerpVectors(startTarget, endTarget, eased);
      controls.update();
      invalidate();
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [artistId, camera, invalidate, model, motionActive, size.height, size.width, styleId]);

  return null;
}

function UniverseLabelProjection({
  boundaryRef,
  compact,
  labelElementsRef,
  labels,
  metrics,
  onVisibleStyleLabelsChange,
  orbitObjectsRef,
}: {
  boundaryRef: RefObject<HTMLDivElement | null>;
  compact: boolean;
  labelElementsRef: RefObject<Map<string, HTMLElement>>;
  labels: UniverseLabelDescriptor[];
  metrics: UniverseLabelLayoutMetrics;
  onVisibleStyleLabelsChange: (ids: ReadonlySet<string>) => void;
  orbitObjectsRef: RefObject<Map<string, THREE.Object3D>>;
}) {
  const { invalidate } = useThree();
  const { active } = useAmbientTime();
  const hasOrbitLabels = useMemo(
    () => labels.some((label) => label.kind === "orbit"),
    [labels],
  );
  const orbitWorldPosition = useMemo(() => new THREE.Vector3(), []);
  const workspace = useMemo(
    () => createUniverseLabelProjectionWorkspace(labels),
    [labels],
  );
  const lastApplied = useMemo(() => createProjectionCache(labels), [labels]);
  const cameraSignatureRef = useRef<CameraSignature>({
    initialized: false,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    projectionX: 0,
    projectionY: 0,
    quaternionW: 0,
    quaternionX: 0,
    quaternionY: 0,
    quaternionZ: 0,
  });
  const visibleStyleLabelIdsRef = useRef<ReadonlySet<string>>(new Set());

  useLayoutEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;
    let disposed = false;
    let firstMeasureFrame = 0;
    let secondMeasureFrame = 0;
    const measure = () => {
      let changed = false;
      const boundaryRect = boundary.getBoundingClientRect();
      changed = writeUniverseLabelViewportMeasurement(
        metrics,
        boundaryRect.width,
        boundaryRect.height,
      ) || changed;
      for (const label of labels) {
        const element = labelElementsRef.current.get(label.id);
        if (element) changed = measureLabelElement(metrics, label.id, element) || changed;
      }
      if (!changed) return;
      cameraSignatureRef.current.initialized = false;
      invalidate();
    };
    const scheduleSettledMeasure = () => {
      window.cancelAnimationFrame(firstMeasureFrame);
      window.cancelAnimationFrame(secondMeasureFrame);
      firstMeasureFrame = window.requestAnimationFrame(() => {
        secondMeasureFrame = window.requestAnimationFrame(measure);
      });
    };
    measure();
    scheduleSettledMeasure();
    const observer = new ResizeObserver(scheduleSettledMeasure);
    observer.observe(boundary);
    for (const label of labels) {
      const element = labelElementsRef.current.get(label.id);
      if (element) observer.observe(element);
    }
    void document.fonts.ready.then(() => {
      if (!disposed) scheduleSettledMeasure();
    });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(firstMeasureFrame);
      window.cancelAnimationFrame(secondMeasureFrame);
      observer.disconnect();
    };
  }, [boundaryRef, invalidate, labelElementsRef, labels, metrics]);

  useEffect(() => {
    cameraSignatureRef.current.initialized = false;
    for (const projection of Object.values(lastApplied)) {
      projection.anchorX = Number.NaN;
      projection.anchorY = Number.NaN;
      projection.scale = Number.NaN;
      projection.visible = false;
      projection.x = Number.NaN;
      projection.y = Number.NaN;
    }
    visibleStyleLabelIdsRef.current = new Set();
    onVisibleStyleLabelsChange(visibleStyleLabelIdsRef.current);
    invalidate();
  }, [compact, invalidate, labels, lastApplied, onVisibleStyleLabelsChange]);
  useFrame(({ camera }) => {
    const signature = cameraSignatureRef.current;
    const projectionX = camera.projectionMatrix.elements[0]!;
    const projectionY = camera.projectionMatrix.elements[5]!;
    const cameraUnchanged = signature.initialized &&
      signature.positionX === camera.position.x &&
      signature.positionY === camera.position.y &&
      signature.positionZ === camera.position.z &&
      signature.quaternionX === camera.quaternion.x &&
      signature.quaternionY === camera.quaternion.y &&
      signature.quaternionZ === camera.quaternion.z &&
      signature.quaternionW === camera.quaternion.w &&
      signature.projectionX === projectionX &&
      signature.projectionY === projectionY;
    if (cameraUnchanged && (!active || !hasOrbitLabels)) return;
    signature.initialized = true;
    signature.positionX = camera.position.x;
    signature.positionY = camera.position.y;
    signature.positionZ = camera.position.z;
    signature.quaternionX = camera.quaternion.x;
    signature.quaternionY = camera.quaternion.y;
    signature.quaternionZ = camera.quaternion.z;
    signature.quaternionW = camera.quaternion.w;
    signature.projectionX = projectionX;
    signature.projectionY = projectionY;

    for (const label of labels) {
      if (label.kind !== "orbit") continue;
      const object = orbitObjectsRef.current.get(label.id);
      if (!object) continue;
      object.getWorldPosition(orbitWorldPosition);
      label.point.x = orbitWorldPosition.x;
      label.point.y = orbitWorldPosition.y;
      label.point.z = orbitWorldPosition.z;
    }

    const projection = writeUniverseLabelProjections(labels, camera, metrics, workspace);
    const visibleStyleLabelIds = new Set<string>();
    for (const label of labels) {
      const element = labelElementsRef.current.get(label.id);
      const next = projection[label.id];
      const previous = lastApplied[label.id];
      if (label.kind === "style" && next?.visible) visibleStyleLabelIds.add(label.id);
      if (!element || !next || !previous || !projectionChanged(previous, next)) continue;
      applyLabelProjection(element, next);
      previous.anchorX = next.anchorX;
      previous.anchorY = next.anchorY;
      previous.scale = next.scale;
      previous.visible = next.visible;
      previous.x = next.x;
      previous.y = next.y;
    }
    if (!setsEqual(visibleStyleLabelIdsRef.current, visibleStyleLabelIds)) {
      visibleStyleLabelIdsRef.current = visibleStyleLabelIds;
      onVisibleStyleLabelsChange(visibleStyleLabelIds);
    }
  });

  return null;
}

function createProjectionCache(
  labels: UniverseLabelDescriptor[],
): Record<string, ProjectedUniverseLabel> {
  const cache: Record<string, ProjectedUniverseLabel> = {};
  for (const label of labels) {
    cache[label.id] = {
      anchorX: Number.NaN,
      anchorY: Number.NaN,
      scale: Number.NaN,
      visible: false,
      x: Number.NaN,
      y: Number.NaN,
    };
  }
  return cache;
}

function projectionChanged(
  previous: ProjectedUniverseLabel,
  next: ProjectedUniverseLabel,
): boolean {
  if (previous.visible !== next.visible) return true;
  if (!next.visible) return false;
  return Math.abs(previous.anchorX - next.anchorX) >= 0.01 ||
    Math.abs(previous.anchorY - next.anchorY) >= 0.01 ||
    Math.abs(previous.x - next.x) >= 0.01 ||
    Math.abs(previous.y - next.y) >= 0.01 ||
    Math.abs(previous.scale - next.scale) >= 0.002;
}

interface CameraSignature {
  initialized: boolean;
  positionX: number;
  positionY: number;
  positionZ: number;
  projectionX: number;
  projectionY: number;
  quaternionW: number;
  quaternionX: number;
  quaternionY: number;
  quaternionZ: number;
}

const INITIAL_LABEL_ACCESSIBILITY = {
  "aria-hidden": true,
  "data-projection-accessibility-cached": "true",
  "data-projection-original-aria-hidden": UNIVERSE_LABEL_MISSING_ATTRIBUTE,
  "data-projection-original-inert": UNIVERSE_LABEL_MISSING_ATTRIBUTE,
  "data-projection-original-tab-index": UNIVERSE_LABEL_MISSING_ATTRIBUTE,
  inert: true,
  tabIndex: -1,
} as const;

function measureLabelElement(
  metrics: UniverseLabelLayoutMetrics,
  id: string,
  element: HTMLElement,
): boolean {
  const rect = element.getBoundingClientRect();
  const appliedScale = Number.parseFloat(
    getComputedStyle(element).getPropertyValue("--universe-scale"),
  );
  const normalizedScale = Number.isFinite(appliedScale) && appliedScale > 0 ? appliedScale : 1;
  element.dataset.labelMeasuredWidth = `${rect.width / normalizedScale}`;
  element.dataset.labelMeasuredHeight = `${rect.height / normalizedScale}`;
  return writeUniverseLabelMeasurement(
    metrics,
    id,
    rect.width,
    rect.height,
    appliedScale,
  );
}

function labelStyle(projected: ProjectedUniverseLabel | undefined, point: UniversePoint): CSSProperties {
  const fallback = projected ?? {
    scale: 1,
    visible: true,
    x: 50 + point.x * 9.6,
    y: 50 - point.y * 15,
  };
  return {
    "--universe-scale": fallback.scale,
    "--universe-x": `${fallback.x}%`,
    "--universe-y": `${fallback.y}%`,
    opacity: 0,
    pointerEvents: "none",
  } as CSSProperties;
}

function initialCameraDistance(): number {
  if (typeof window === "undefined") return 9.4;
  return overviewCameraDistance(window.innerWidth, window.innerHeight);
}

function overviewCameraDistance(width: number, height: number): number {
  return width / Math.max(1, height) > 1.25 ? 7.45 : 9.4;
}

function shadowColor(color: string): string {
  return `#${new THREE.Color(color).multiplyScalar(0.2).getHexString()}`;
}

function highlightColor(color: string): string {
  return `#${new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.76).getHexString()}`;
}

function pointTuple(point: UniversePoint): [number, number, number] {
  return [point.x, point.y, point.z];
}

function vector(point: UniversePoint): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function setsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1_440 : window.innerWidth,
  );
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return width;
}
