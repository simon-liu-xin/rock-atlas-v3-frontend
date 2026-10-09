import { Canvas, useThree } from "@react-three/fiber";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { bridgeSignalColor } from "./transient-scene-motion.ts";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { ReadyCandidateViewModel } from "../candidate-types.ts";
import { CelestialSphere } from "./CelestialSphere.tsx";
import { buildLightBridgeCurves } from "./scene-model.ts";

interface ThreeCandidateProps {
  viewModel: ReadyCandidateViewModel;
  onOpenRelation: (relationId: string) => void;
  onOpenArtist: (artistId: string) => void;
  onOpenRecording: (recordingId: string) => void;
  onContextLost?: () => void;
  forceFallback?: boolean;
}

const targetPositions = [
  [-3.4, 1.45, -0.8],
  [3.25, 1.25, -0.35],
  [0.55, -2.7, 0.65],
] as const;

const artistPositions = [
  [1.1, 0.38, 0.45],
  [-0.92, 0.68, 0.25],
  [-0.58, -0.92, 0.48],
  [0.76, -0.72, -0.15],
] as const;

export function ThreeCandidate({
  viewModel,
  onOpenRelation,
  onOpenArtist,
  onOpenRecording,
  onContextLost,
  forceFallback = false,
}: ThreeCandidateProps) {
  const { t } = useTranslation();
  const [contextLost, setContextLost] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const forcedColors = useMediaQuery("(forced-colors: active)");
  const canvasBoundaryRef = useRef<HTMLDivElement | null>(null);
  const initialArtistId = viewModel.artists[0].internal_id;
  const [selectedArtistId, setSelectedArtistId] = useState(initialArtistId);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const selectedArtist =
    viewModel.artists.find((artist) => artist.internal_id === selectedArtistId) ??
    viewModel.artists[0];
  const selectedRecordings = viewModel.recordings.filter((recording) =>
    recording.artist_ids.includes(selectedArtist.internal_id),
  );
  const selectedRecording = selectedRecordings.find(
    (recording) => recording.internal_id === selectedRecordingId,
  );
  const canRender =
    !forceFallback &&
    !contextLost &&
    !forcedColors &&
    typeof window !== "undefined" &&
    supportsWebGL();

  useEffect(() => {
    const boundary = canvasBoundaryRef.current;
    if (!boundary) return;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      setContextLost(true);
      onContextLost?.();
    };
    boundary.addEventListener("webglcontextlost", handleContextLost, true);
    return () => boundary.removeEventListener("webglcontextlost", handleContextLost, true);
  }, [onContextLost]);

  useEffect(() => {
    setSelectedArtistId(initialArtistId);
    setSelectedRecordingId(null);
  }, [initialArtistId, viewModel.path_id]);

  const markSceneReady = useCallback(() => setSceneReady(true), []);

  function selectArtist(artistId: string) {
    setSelectedArtistId(artistId);
    setSelectedRecordingId(null);
    onOpenArtist(artistId);
  }

  function selectRecording(recordingId: string) {
    setSelectedRecordingId(recordingId);
    onOpenRecording(recordingId);
  }

  return (
    <section
      className="candidate-stage three-stage"
      data-artist-ids={viewModel.artists.map((artist) => artist.internal_id).join("|")}
      data-celestial-material="gradient-halo-v1"
      data-evidence-ids={viewModel.evidence.map((record) => record.evidence_id).join("|")}
      data-focus-id={viewModel.question.focus_id}
      data-od-id="candidate-3d"
      data-recording-ids={viewModel.recordings.map((recording) => recording.internal_id).join("|")}
      data-relation-ids={viewModel.relations.map((relation) => relation.internal_id).join("|")}
      data-selected-artist-id={selectedArtist.internal_id}
      data-selected-recording-id={selectedRecording?.internal_id ?? ""}
      data-scene-ready={sceneReady ? "true" : "false"}
      data-visible-artist-labels={viewModel.artists.length}
    >
      <div
        className="universe-canvas"
        ref={canvasBoundaryRef}
        aria-hidden="true"
      >
        {canRender ? (
          <UniverseScene
            onSceneReady={markSceneReady}
            onSelectArtist={selectArtist}
            onSelectRecording={selectRecording}
            selectedArtistId={selectedArtist.internal_id}
            selectedRecordingId={selectedRecording?.internal_id ?? null}
            viewModel={viewModel}
          />
        ) : (
          <StaticUniverse viewModel={viewModel} />
        )}
      </div>

      <div className="universe-focus-label">
        <small>{t("three.focusNebula")}</small>
        <strong>{viewModel.relations[0].source_name}</strong>
        <span>{t("three.sceneCounts", { artists: viewModel.artists.length, recordings: viewModel.recordings.length })}</span>
      </div>

      <aside className="universe-selection-panel" data-od-id="scene-selection">
        <small>{t("three.selectedArtist")}</small>
        <strong>{selectedArtist.canonical_name}</strong>
        <span>
          {selectedRecordings.length
            ? t("three.recordingCount", { count: selectedRecordings.length })
            : t("three.noRecordings")}
        </span>
        <a href={selectedArtist.source_url} rel="noreferrer noopener" target="_blank">
          {t("three.viewArtistSource")}
          <ExternalLink aria-hidden="true" size={13} />
        </a>
        {selectedRecording ? (
          <div className="universe-recording-selection">
            <small>{t("three.selectedRecording")}</small>
            <strong>{selectedRecording.canonical_name}</strong>
            <a href={selectedRecording.source_url} rel="noreferrer noopener" target="_blank">
              {t("three.openRecordingSource")}
              <ExternalLink aria-hidden="true" size={13} />
            </a>
          </div>
        ) : null}
      </aside>

      {viewModel.relations.map((relation, index) => (
        <button
          className={`nebula-label nebula-label-${index + 1}`}
          data-action-id={`mw:action:open-relation-${index + 1}`}
          key={relation.internal_id}
          type="button"
          onClick={() => onOpenRelation(relation.internal_id)}
        >
          <span>{relation.target_name}</span>
          <small>{t(`evidence.assertion.${relation.assertion_kind}`)}</small>
          <span className="sr-only">{relation.label}</span>
        </button>
      ))}

      {contextLost ? (
        <p className="webgl-fallback" role="status">
          {t("three.contextLost")}
        </p>
      ) : !canRender && typeof window !== "undefined" ? (
        <p className="webgl-fallback" role="status">
          {t("three.unavailable")}
        </p>
      ) : null}
    </section>
  );
}

function UniverseScene({
  viewModel,
  selectedArtistId,
  selectedRecordingId,
  onSceneReady,
  onSelectArtist,
  onSelectRecording,
}: {
  viewModel: ReadyCandidateViewModel;
  selectedArtistId: string;
  selectedRecordingId: string | null;
  onSceneReady: () => void;
  onSelectArtist: (artistId: string) => void;
  onSelectRecording: (recordingId: string) => void;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0.15, 9.4], fov: 48, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#05070c"]} />
      <fog attach="fog" args={["#05070c", 9, 20]} />
      <ambientLight intensity={0.24} />
      <hemisphereLight color="#dceaf3" groundColor="#071018" intensity={0.76} />
      <directionalLight color="#fff1d2" intensity={1.7} position={[-4, 5, 6]} />
      <pointLight color="#8edce8" intensity={4.5} position={[2, -1, 3]} distance={12} />

      <Nebula
        color="#9ea7b3"
        name={viewModel.relations[0].source_name}
        position={[0, 0, 0]}
        scale={1.25}
        selected
      />
      {viewModel.relations.map((relation, index) => (
        <Nebula
          color={relation.assertion_kind === "fact" ? "#c2c7cf" : "#7f8995"}
          key={relation.internal_id}
          name={relation.target_name}
          position={[...targetPositions[index]!]}
          scale={0.78}
        />
      ))}

      {viewModel.relations.map((relation, index) => (
        <LightBridge
          assertionKind={relation.assertion_kind}
          end={new THREE.Vector3(...targetPositions[index]!)}
          key={relation.internal_id}
          memberEdgeCount={1}
          seed={index + 1}
          start={new THREE.Vector3(0, 0, 0)}
        />
      ))}

      <ArtistSystem
        onSelectArtist={onSelectArtist}
        onSelectRecording={onSelectRecording}
        selectedArtistId={selectedArtistId}
        selectedRecordingId={selectedRecordingId}
        viewModel={viewModel}
      />
      <CameraControls onReady={onSceneReady} />
    </Canvas>
  );
}

function Nebula({
  color,
  name,
  position,
  scale,
  selected = false,
}: {
  color: string;
  name: string;
  position: [number, number, number];
  scale: number;
  selected?: boolean;
}) {
  const vertices = useMemo(() => nebulaVertices(name, selected ? 520 : 360), [name, selected]);
  const dustVertices = useMemo(() => nebulaVertices(`${name}-dust`, 160, 1.5), [name]);

  return (
    <group position={position} scale={scale}>
      <CelestialSphere
        baseColor={color}
        haloOpacity={selected ? 0.34 : 0.27}
        haloScale={selected ? 4.2 : 3.8}
        highlightColor={lightenColor(color, 0.78)}
        radius={selected ? 0.58 : 0.43}
        shadowColor={darkenColor(color, 0.16)}
      />
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[vertices, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={color}
          depthWrite={false}
          opacity={selected ? 0.64 : 0.52}
          size={selected ? 0.065 : 0.052}
          sizeAttenuation
          transparent
        />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dustVertices, 3]} />
        </bufferGeometry>
        <pointsMaterial
          blending={THREE.AdditiveBlending}
          color={selected ? "#c2c7cf" : "#7f8995"}
          depthWrite={false}
          opacity={0.28}
          size={0.095}
          sizeAttenuation
          transparent
        />
      </points>
    </group>
  );
}

function LightBridge({
  assertionKind,
  end,
  memberEdgeCount,
  seed,
  start,
}: {
  assertionKind: "fact" | "inferred" | "candidate";
  end: THREE.Vector3;
  memberEdgeCount: number;
  seed: number;
  start: THREE.Vector3;
}) {
  const curves = useMemo(
    () => buildLightBridgeCurves(start, end, seed, memberEdgeCount),
    [end, memberEdgeCount, seed, start],
  );
  const color = bridgeSignalColor(assertionKind);

  return (
    <group>
      {curves.map((curve, strand) =>
        assertionKind === "fact" ? (
          <mesh key={strand}>
            <tubeGeometry args={[curve, 36, 0.014, 5, false]} />
            <meshBasicMaterial
              color={color}
              depthWrite={false}
              opacity={0.72 - strand * 0.1}
              transparent
            />
          </mesh>
        ) : (
          <group key={strand}>
            {Array.from({ length: 18 }, (_, index) => {
              const point = curve.getPoint((index + 0.35) / 18.4);
              return (
                <mesh key={index} position={point}>
                  <sphereGeometry args={[0.034, 6, 6]} />
                  <meshBasicMaterial
                    color={color}
                    depthWrite={false}
                    opacity={0.82 - strand * 0.12}
                    transparent
                  />
                </mesh>
              );
            })}
          </group>
        ),
      )}
    </group>
  );
}

function ArtistSystem({
  viewModel,
  selectedArtistId,
  selectedRecordingId,
  onSelectArtist,
  onSelectRecording,
}: {
  viewModel: ReadyCandidateViewModel;
  selectedArtistId: string;
  selectedRecordingId: string | null;
  onSelectArtist: (artistId: string) => void;
  onSelectRecording: (recordingId: string) => void;
}) {
  const selectedArtistIndex = Math.max(
    0,
    viewModel.artists.findIndex((artist) => artist.internal_id === selectedArtistId),
  );
  const anchor = new THREE.Vector3(...artistPositions[selectedArtistIndex]!);
  const selectedRecordings = viewModel.recordings.filter((recording) =>
    recording.artist_ids.includes(selectedArtistId),
  );
  return (
    <group>
      {viewModel.artists.map((artist, index) => (
        <group
          key={artist.internal_id}
          onClick={(event) => {
            event.stopPropagation();
            onSelectArtist(artist.internal_id);
          }}
          position={[...artistPositions[index]!]}
        >
          <CelestialSphere
            baseColor={artist.internal_id === selectedArtistId ? "#f0c46f" : "#dce5ee"}
            haloOpacity={artist.internal_id === selectedArtistId ? 0.5 : 0.3}
            haloScale={4.8}
            highlightColor={artist.internal_id === selectedArtistId ? "#fff1bd" : "#ffffff"}
            hitRadius={0.24}
            radius={artist.internal_id === selectedArtistId ? 0.14 : 0.1}
            shadowColor={artist.internal_id === selectedArtistId ? "#563610" : "#394653"}
          />
          <ArtistLabel name={artist.canonical_name} selected={artist.internal_id === selectedArtistId} />
        </group>
      ))}
      {selectedRecordings.map((recording, index) => {
        const radius = 0.34 + index * 0.16;
        const angle = 0.8 + index * 1.95;
        const bodyPosition: [number, number, number] = [
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius,
        ];
        return (
          <group key={recording.internal_id} position={anchor}>
            <mesh rotation={[Math.PI / 2.25, 0.15 * index, 0]}>
              <torusGeometry args={[radius, 0.006, 5, 52]} />
              <meshBasicMaterial color="#74d9e7" opacity={0.62} transparent />
            </mesh>
            <group
              onClick={(event) => {
                event.stopPropagation();
                onSelectRecording(recording.internal_id);
              }}
              position={bodyPosition}
            >
              <CelestialSphere
                baseColor={recording.internal_id === selectedRecordingId ? "#f0c46f" : "#74d9e7"}
                haloOpacity={recording.internal_id === selectedRecordingId ? 0.5 : 0.34}
                haloScale={4.6}
                highlightColor={recording.internal_id === selectedRecordingId ? "#fff1bd" : "#eaffff"}
                hitRadius={0.16}
                radius={recording.internal_id === selectedRecordingId ? 0.078 : 0.065}
                shadowColor={recording.internal_id === selectedRecordingId ? "#563610" : "#123743"}
              />
            </group>
          </group>
        );
      })}
    </group>
  );
}

function ArtistLabel({ name, selected }: { name: string; selected: boolean }) {
  const texture = useMemo(() => buildArtistLabelTexture(name, selected), [name, selected]);
  const width = Math.min(1.55, Math.max(0.72, 0.42 + name.length * 0.065));
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, 0.25, 0]} renderOrder={8} scale={[width, 0.22, 1]}>
      <spriteMaterial
        depthTest={false}
        depthWrite={false}
        map={texture}
        toneMapped={false}
        transparent
      />
    </sprite>
  );
}

function buildArtistLabelTexture(name: string, selected: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is required for artist labels.");
  context.fillStyle = "rgba(5, 7, 12, 0.86)";
  context.fillRect(2, 2, canvas.width - 4, canvas.height - 4);
  context.strokeStyle = selected ? "#f0c46f" : "#9ea7b3";
  context.lineWidth = selected ? 5 : 3;
  context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  context.fillStyle = selected ? "#f0c46f" : "#ece9e1";
  context.font = '600 34px Inter, "PingFang SC", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(name, canvas.width / 2, canvas.height / 2, canvas.width - 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function CameraControls({ onReady }: { onReady: () => void }) {
  const { camera, gl, invalidate } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 6.8;
    controls.maxDistance = 12;
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.7;
    const onChange = () => invalidate();
    controls.addEventListener("change", onChange);
    controls.update();
    const readyFrame = window.requestAnimationFrame(onReady);
    return () => {
      window.cancelAnimationFrame(readyFrame);
      controls.removeEventListener("change", onChange);
      controls.dispose();
    };
  }, [camera, gl, invalidate, onReady]);
  return null;
}

function StaticUniverse({ viewModel }: { viewModel: ReadyCandidateViewModel }) {
  return (
    <div className="static-universe" aria-hidden="true">
      <span className="static-nebula static-focus" />
      <span className="static-nebula static-target static-target-1" />
      <span className="static-nebula static-target static-target-2" />
      <span className="static-nebula static-target static-target-3" />
      {viewModel.relations.map((relation, index) => (
        <span
          className={`static-bridge static-bridge-${index + 1} static-bridge-${relation.assertion_kind}`}
          data-assertion-kind={relation.assertion_kind}
          key={relation.internal_id}
        />
      ))}
    </div>
  );
}

function nebulaVertices(name: string, count: number, spread = 1): Float32Array {
  const random = seededRandom(hashSeed(name));
  const lobes = [
    new THREE.Vector3(-0.34, 0.08, 0),
    new THREE.Vector3(0.28, 0.2, 0.08),
    new THREE.Vector3(0.02, -0.31, -0.06),
  ];
  const vertices = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const lobe = lobes[Math.floor(random() * lobes.length)]!;
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), 0.58) * spread;
    const radialNoise = 0.52 + random() * 0.62;
    vertices[index * 3] = lobe.x + Math.cos(angle) * radius * radialNoise;
    vertices[index * 3 + 1] = lobe.y + Math.sin(angle) * radius * (0.38 + random() * 0.42);
    vertices[index * 3 + 2] = lobe.z + (random() - 0.5) * radius * 0.82;
  }
  return vertices;
}

function darkenColor(color: string, factor: number): string {
  return `#${new THREE.Color(color).multiplyScalar(factor).getHexString()}`;
}

function lightenColor(color: string, amount: number): string {
  return `#${new THREE.Color(color).lerp(new THREE.Color("#ffffff"), amount).getHexString()}`;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(initialSeed: number): () => number {
  let seed = initialSeed || 1;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4_294_967_296;
  };
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);
  return matches;
}
