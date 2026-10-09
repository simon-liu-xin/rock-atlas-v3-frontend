import { ChevronUp, ListTree, PanelRightClose, PanelRightOpen, Scan, Search } from "lucide-react";
import {
  type CSSProperties,
  FormEvent,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import type { ExperimentSample } from "../../experiment/viewmodel/candidate-model.ts";
import {
  buildUniverseOverviewViewModel,
  type UniverseOverviewViewModel,
} from "../../experiment/viewmodel/universe-overview-model.ts";
import {
  queryExperiment,
  type ExperimentQueryResult,
} from "../../features/query/query.ts";
import { UniverseFallback } from "./UniverseFallback.tsx";
import { AnimatedNumber } from "./AnimatedNumber.tsx";
import { RecentExplorations } from "./RecentExplorations.tsx";
import { UniverseTooltipButton } from "./UniverseTooltip.tsx";
import { UniverseFilterMenu } from "./UniverseFilterMenu.tsx";
import {
  buildUniverseSearchMatch,
  type DetailDirection,
  universeDetailDepth,
  universeDetailDirection,
} from "./ui-motion.ts";
import {
  clearUniverseSelection,
  initialUniverseState,
  parseUniverseState,
  returnToUniverseOverview,
  transitionUniverse,
  type UniverseMode,
  type UniverseState,
} from "./universe-navigation.ts";
import { LanguageMenu } from "../../i18n/LanguageMenu.tsx";
import { BackgroundAudioPlayer } from "../audio/BackgroundAudioPlayer.tsx";
import { MotionModeMenu } from "../motion/MotionModeMenu.tsx";
import { useMotionMode } from "../motion/MotionModeProvider.tsx";
import { useDismissableLayer } from "../shared/useDismissableLayer.ts";
import type { TranslationKey } from "../../i18n/locales/en.ts";

interface UniverseHomepageProps {
  sample?: ExperimentSample;
  modelOverride?: UniverseOverviewViewModel;
  controlledState?: UniverseState;
  catalogData?: {
    searchResults: ExperimentQueryResult[]; searchLoading: boolean; detailLoading: boolean; error: boolean;
    preservedArtistCount: number;
    artistCursor: string | null; releaseCursor: string | null; relationCursor: string | null;
    onQuery: (query: string) => void; onSelection: (state: UniverseState) => void;
    onSearchResult: (id: string, type: 'style' | 'artist') => void;
    onMore: (collection: 'artists' | 'releases' | 'relations') => void; onRetry: () => void;
  };
  initialSearch: string;
  onNavigate: (href: string) => void;
  onStateChange: (state: UniverseState, behavior: "push" | "replace") => void;
  forceWebGLFallback?: boolean;
}

const modes: Array<{ id: UniverseMode; labelKey: string }> = [
  { id: "style", labelKey: "universe.nav.style" },
  { id: "artist", labelKey: "universe.nav.artist" },
  { id: "era", labelKey: "universe.nav.era" },
  { id: "relation", labelKey: "universe.nav.relation" },
];

const backgroundTrackUrl = import.meta.env.VITE_BACKGROUND_TRACK_URL?.trim() ?? "";

const relationLabelKeys: Partial<Record<string, TranslationKey>> = {
  subgenre_of: "universe.filter.relationSubgenre",
  associated_with: "universe.filter.relationAssociated",
  influenced_by: "universe.filter.relationInfluence",
  influences: 'universe.filter.relationInfluences',
};

const UniverseOverviewScene = lazy(async () => {
  const module = await import("../../candidates/three/UniverseOverviewScene.tsx");
  return { default: module.UniverseOverviewScene };
});

export function UniverseHomepage({
  sample,
  modelOverride,
  controlledState,
  catalogData,
  initialSearch,
  onNavigate,
  onStateChange,
  forceWebGLFallback = false,
}: UniverseHomepageProps) {
  const { t } = useTranslation();
  const { active: motionActive, mode: motionMode } = useMotionMode();
  const universeSample = sample;
  const model = useMemo(() => {
    if (modelOverride) return modelOverride;
    if (!universeSample) throw new Error('A universe model or fixture is required');
    return buildUniverseOverviewViewModel(universeSample);
  }, [modelOverride, universeSample]);
  const representativeArtistIds = useMemo(
    () => new Set(model.styles.flatMap((style) => style.artist_ids)),
    [model.styles],
  );
  const [localState, setState] = useState(() => parseUniverseState(initialSearch, model));
  const state = controlledState ?? localState;
  const [query, setQuery] = useState("");
  const [noPathNotice, setNoPathNotice] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [detailRailOpen, setDetailRailOpen] = useState(true);
  const [searchTrayOpen, setSearchTrayOpen] = useState(false);
  const [searchRevealState, setSearchRevealState] = useState<"idle" | "loading" | "revealed">("idle");
  const [detailDirection, setDetailDirection] = useState<DetailDirection>("none");
  const [contextLost, setContextLost] = useState(false);
  const [forcedColors, setForcedColors] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(forced-colors: active)").matches,
  );
  const [webglUnavailable] = useState(() =>
    typeof window !== "undefined" && !supportsWebGL(),
  );
  const searchResults = useMemo(
    () => (catalogData?.searchResults ?? (universeSample ? queryExperiment(universeSample, query) : [])).filter(
      (result): result is ExperimentQueryResult & { result_type: "artist" | "style" } =>
        result.result_type === "style" ||
        (result.result_type === "artist" && (Boolean(catalogData) || representativeArtistIds.has(result.result_id))),
    ),
    [catalogData, query, representativeArtistIds, universeSample],
  );
  const searchMatch = useMemo(
    () => buildUniverseSearchMatch(
      model,
      query.trim() ? searchResults.map((result) => result.result_id) : [],
    ),
    [model, query, searchResults],
  );
  const detailDepth = universeDetailDepth(state);
  const previousDetailDepth = useRef(detailDepth);
  const directoryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const directoryPanelRef = useRef<HTMLDivElement | null>(null);
  const activeModeIndex = modes.findIndex((mode) => mode.id === state.mode);
  const styleCountText = t("universe.count.styles", { count: model.counts.styles });
  const artistCountText = t("universe.count.artists", { count: model.counts.artists });

  useEffect(() => {
    if (!controlledState) setState(parseUniverseState(initialSearch, model));
  }, [controlledState, initialSearch, model]);

  useEffect(() => {
    if (!state.focus_id) setDetailRailOpen(true);
  }, [state.focus_id]);

  useEffect(() => {
    if (previousDetailDepth.current === detailDepth) return;
    setDetailDirection(universeDetailDirection(previousDetailDepth.current, detailDepth));
    previousDetailDepth.current = detailDepth;
  }, [detailDepth]);

  useEffect(() => {
    if (!searchTrayOpen || !query.trim()) {
      setSearchRevealState("idle");
      return;
    }
    setSearchRevealState("loading");
    if (catalogData?.searchLoading) return;
    const timer = window.setTimeout(() => setSearchRevealState("revealed"), 120);
    return () => window.clearTimeout(timer);
  }, [catalogData?.searchLoading, query, searchTrayOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const next = clearUniverseSelection(state);
      if (next !== state) {
        setState(next);
        catalogData?.onSelection(next);
        onStateChange(next, "push");
      }
      setNoPathNotice(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [catalogData, onStateChange, state]);

  useEffect(() => {
    const media = window.matchMedia("(forced-colors: active)");
    const update = () => setForcedColors(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function commit(next: UniverseState, behavior: "push" | "replace", message = "") {
    setState(next);
    catalogData?.onSelection(next);
    onStateChange(next, behavior);
    setNoPathNotice(false);
    if (message) setLiveMessage(message);
  }

  function selectStyle(styleId: string) {
    const style = model.styles.find((candidate) => candidate.internal_id === styleId);
    if (!style) return;
    if (state.focus_id === styleId) {
      if (!style.path_id) {
        setNoPathNotice(true);
        setLiveMessage(t("universe.live.noPath", { name: style.canonical_name }));
        return;
      }
      const parameters = new URLSearchParams({
        snapshot: model.snapshot_id,
        path: style.path_id,
        focus_id: style.internal_id,
      });
      onNavigate(`/experiment/3d?${parameters.toString()}`);
      return;
    }
    commit(
      transitionUniverse(state, { type: "select_style", style_id: styleId }),
      "push",
      t("universe.live.styleFocused", { name: style.canonical_name }),
    );
  }

  function selectArtist(artistId: string) {
    const artist = model.artists.find((candidate) => candidate.internal_id === artistId);
    if (!artist) return;
    let next = state;
    if (state.focus_id !== artist.style_id) {
      next = transitionUniverse(next, { type: "select_style", style_id: artist.style_id });
    }
    next = transitionUniverse(next, { type: "select_artist", artist_id: artist.internal_id });
    commit(next, "push", t("universe.live.artistSelected", { name: artist.canonical_name }));
  }

  function selectReleaseGroup(releaseGroupId: string) {
    const releaseGroup = model.release_groups.find(
      (candidate) => candidate.internal_id === releaseGroupId,
    );
    if (!releaseGroup) return;
    commit(
      transitionUniverse(state, { type: "select_release_group", release_group_id: releaseGroupId }),
      "push",
      t("universe.live.releaseSelected", { name: releaseGroup.canonical_name }),
    );
  }

  function openPath(pathId: string) {
    const path = sample?.paths.find((candidate) => candidate.path_id === pathId);
    const focusId = path?.question.focus_id ?? model.styles.find((style) => style.path_id === pathId)?.internal_id;
    if (!focusId) return;
    const parameters = new URLSearchParams({
      snapshot: path ? model.snapshot_id : 'experiment-v1',
      path: pathId,
      focus_id: focusId,
    });
    onNavigate(`/experiment/3d?${parameters.toString()}`);
  }

  function setMode(mode: UniverseMode) {
    commit(transitionUniverse(state, { type: "set_mode", mode }), "replace");
    setSearchTrayOpen(true);
  }

  function resetUniverse() {
    commit(initialUniverseState, "push", t("universe.live.overview"));
  }

  function returnToOverview() {
    const next = returnToUniverseOverview(state);
    if (next === state) return;
    setDetailRailOpen(true);
    commit(next, "push", t("universe.live.overview"));
  }

  function returnToStyleFocus() {
    if (!state.focus_id || !state.artist_id) return;
    const style = model.styles.find((candidate) => candidate.internal_id === state.focus_id);
    const next = transitionUniverse(state, { type: "select_style", style_id: state.focus_id });
    commit(next, "push", t("universe.live.styleArtists", {
      name: style?.canonical_name ?? t("universe.nav.style"),
    }));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = searchResults[0];
    if (result) selectSearchResult(result.result_id, result.result_type);
  }

  function selectSearchResult(resultId: string, resultType: "artist" | "style") {
    if (catalogData) {
      catalogData.onSearchResult(resultId, resultType);
      setQuery(''); catalogData.onQuery('');
      return;
    }
    if (resultType === "artist") selectArtist(resultId);
    else selectStyle(resultId);
    setQuery("");
  }

  const handleContextLost = useCallback(() => {
    setContextLost(true);
    setLiveMessage(t("universe.live.contextLost"));
  }, [t]);

  const useFallback = forceWebGLFallback || contextLost || forcedColors || webglUnavailable;

  useDismissableLayer(directoryOpen && !useFallback, (reason) => {
    setDirectoryOpen(false);
    if (reason === "escape") directoryTriggerRef.current?.focus();
  }, directoryTriggerRef, directoryPanelRef);

  return (
    <div
      className="universe-home"
      data-artist-count={model.counts.artists}
      data-motion-active={motionActive}
      data-motion-mode={motionMode}
      data-catalog-channel={catalogData ? 'rock-catalog-v3' : 'fixture'}
      data-catalog-generation={model.snapshot_id}
      data-od-id="universe-homepage"
      data-preserved-artist-count={catalogData?.preservedArtistCount ?? sample?.preserved_seed_artist_count ?? sample?.artists.length ?? 0}
      data-representative-artist-count={representativeArtistIds.size}
      data-release-group-count={model.counts.release_groups}
      data-relation-count={model.counts.relations}
      data-style-count={model.counts.styles}
      data-search-tray-open={searchTrayOpen}
      data-universe-mode={state.mode}
    >
      <header className="universe-hud">
        <div className="universe-hud-primary">
          <a
            className="universe-wordmark"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              resetUniverse();
            }}
          >
            {t("app.name")}
          </a>
          <nav aria-label={t("universe.nav.label")} className="universe-mode-tabs">
            <span
              aria-hidden="true"
              className="universe-mode-indicator"
              data-active-index={activeModeIndex}
              style={{ "--mode-index": activeModeIndex } as CSSProperties}
            />
            {modes.map((mode) => (
              <button
                aria-controls="universe-search-tray"
                aria-current={state.mode === mode.id ? "page" : undefined}
                aria-expanded={searchTrayOpen && state.mode === mode.id}
                className={state.mode === mode.id ? "is-active" : ""}
                key={mode.id}
                onClick={() => setMode(mode.id)}
                type="button"
              >
                {t(mode.labelKey)}
              </button>
            ))}
          </nav>
          <div className="universe-utility-controls">
            <MotionModeMenu />
            <LanguageMenu />
            <button
              aria-controls={useFallback ? undefined : "universe-directory-panel"}
              aria-expanded={useFallback || directoryOpen}
              aria-label={t("universe.directory.view")}
              className="universe-directory-trigger"
              onClick={() => setDirectoryOpen((open) => !open)}
              ref={directoryTriggerRef}
              title={t("universe.directory.view")}
              type="button"
            >
              <ListTree aria-hidden="true" size={16} />
              <span>{t("universe.directory.list")}</span>
            </button>
          </div>
        </div>

        <div
          aria-hidden={!searchTrayOpen}
          className={`universe-hud-secondary${searchTrayOpen ? " is-open" : ""}`}
          id="universe-search-tray"
        >
          <div className="universe-search-group">
            <form className="universe-search" onSubmit={submitSearch} role="search">
              <Search aria-hidden="true" size={16} />
              <input
                aria-label={t("universe.search.label")}
                disabled={!searchTrayOpen}
                onChange={(event) => {
                  setQuery(event.target.value);
                  catalogData?.onQuery(event.target.value);
                }}
                placeholder={t("universe.search.placeholder")}
                value={query}
              />
            </form>
            <button
              aria-label={t("universe.search.collapse")}
              className="universe-search-collapse"
              disabled={!searchTrayOpen}
              onClick={() => setSearchTrayOpen(false)}
              title={t("universe.search.collapse")}
              type="button"
            >
              <ChevronUp aria-hidden="true" size={16} />
            </button>
          </div>
          {state.mode === "era" ? (
            <div className="universe-filter">
              <span>{t("universe.filter.era")}</span>
              <UniverseFilterMenu
                disabled={!searchTrayOpen}
                id="universe-era-filter-listbox"
                label={t("universe.filter.eraLabel")}
                onChange={(value) => commit(
                  transitionUniverse(state, {
                    type: "set_era",
                    era: value || null,
                  }),
                  "replace",
                )}
                options={[
                  { value: "", label: t("universe.filter.allEras") },
                  ...model.eras.map((era) => ({ value: era, label: era })),
                ]}
                value={state.era ?? ""}
              />
            </div>
          ) : null}
          {state.mode === "relation" ? (
            <div className="universe-filter">
              <span>{t("universe.filter.relation")}</span>
              <UniverseFilterMenu
                disabled={!searchTrayOpen}
                id="universe-relation-filter-listbox"
                label={t("universe.filter.relationLabel")}
                onChange={(value) => commit(
                  transitionUniverse(state, {
                    type: "set_relation_type",
                    relation_type: value || null,
                  }),
                  "replace",
                )}
                options={[
                  { value: "", label: t("universe.filter.allRelations") },
                  ...model.relation_types.map((relationType) => ({
                    value: relationType,
                    label: relationLabelKeys[relationType]
                      ? t(relationLabelKeys[relationType])
                      : readableRelationType(relationType),
                  })),
                ]}
                value={state.relation_type ?? ""}
              />
            </div>
          ) : null}
        </div>

        {searchTrayOpen && query.trim() ? (
          <div
            aria-busy={searchRevealState === "loading"}
            aria-live="polite"
            className="universe-search-results"
            data-reveal-state={searchRevealState}
          >
            <div aria-hidden="true" className="universe-search-skeleton">
              <span />
              <span />
            </div>
            <div
              aria-hidden={searchRevealState !== "revealed"}
              className="universe-search-result-content"
              inert={searchRevealState !== "revealed"}
            >
              {searchResults.length ? searchResults.map((result) => (
                <button
                  key={result.result_id}
                  onClick={() => selectSearchResult(result.result_id, result.result_type)}
                  type="button"
                >
                  <strong>{result.label}</strong>
                  <small>{result.detail_key ? t(result.detail_key) : result.detail}</small>
                </button>
              )) : <p>{t("universe.search.noResults")}</p>}
            </div>
          </div>
        ) : null}
      </header>

      <main className="universe-home-main">
        <h1 className="sr-only">{t("universe.overview.title")}</h1>
        {catalogData && (catalogData.detailLoading || catalogData.error) ? (
          <div className="universe-catalog-status" role={catalogData.error ? 'alert' : 'status'}>
            <span>{t(catalogData.error ? 'catalog.detailError' : 'catalog.loading')}</span>
            {catalogData.error ? <button type="button" onClick={catalogData.onRetry}>{t('catalog.retry')}</button> : null}
          </div>
        ) : null}
        <div
          className={`universe-counts-hud${state.focus_id && detailRailOpen ? " is-obscured" : ""}`}
          aria-label={t("universe.count.label")}
        >
          <span>
            <span aria-hidden="true"><AnimatedNumber value={model.counts.styles} /> {countSuffix(styleCountText, model.counts.styles)}</span>
            <span className="sr-only">{styleCountText}</span>
          </span>
          <span>
            <span aria-hidden="true"><AnimatedNumber value={model.counts.artists} /> {countSuffix(artistCountText, model.counts.artists)}</span>
            <span className="sr-only">{artistCountText}</span>
          </span>
        </div>
        {useFallback ? (
          <UniverseFallback
            model={model}
            detailDirection={detailDirection}
            motionActive={motionActive}
            noPathNotice={noPathNotice}
            state={state}
            onReturnToStyle={returnToStyleFocus}
            onSelectArtist={selectArtist}
            onSelectReleaseGroup={selectReleaseGroup}
            onSelectStyle={selectStyle}
            pagination={catalogData}
          />
        ) : (
          <>
            <div className="universe-stage">
              <Suspense fallback={<div aria-hidden="true" className="universe-scene-loading" />}>
                <UniverseOverviewScene
                  model={model}
                  onContextLost={handleContextLost}
                  onSelectArtist={selectArtist}
                  onSelectReleaseGroup={selectReleaseGroup}
                  onSelectStyle={selectStyle}
                  searchMatch={searchMatch}
                  searchToken={query.trim()}
                  state={state}
                />
              </Suspense>
            </div>
            <RecentExplorations
              className="universe-recent-explorations"
              snapshotId={model.snapshot_id}
              onOpenPath={openPath}
            />
            <div
              className={`universe-stage-tools${state.focus_id && detailRailOpen ? " has-detail-rail" : ""}`}
            >
              <UniverseTooltipButton
                disabled={!state.focus_id}
                icon={<Scan aria-hidden="true" size={17} />}
                label={t("universe.action.overview")}
                onClick={returnToOverview}
              />
              {state.focus_id && !detailRailOpen ? (
                <UniverseTooltipButton
                  aria-controls="universe-detail-rail"
                  expanded={false}
                  icon={<PanelRightOpen aria-hidden="true" size={17} />}
                  label={t("universe.action.expandDetails")}
                  onClick={() => setDetailRailOpen(true)}
                />
              ) : null}
            </div>
            {state.focus_id ? (
              <aside
                aria-hidden={!detailRailOpen}
                className="universe-detail-rail"
                data-open={detailRailOpen}
                data-od-id="universe-detail-rail"
                id="universe-detail-rail"
                inert={!detailRailOpen}
              >
                <div className="universe-detail-rail-controls">
                  <UniverseTooltipButton
                    aria-controls="universe-detail-rail"
                    expanded={true}
                    icon={<PanelRightClose aria-hidden="true" size={17} />}
                    label={t("universe.action.collapseDetails")}
                    onClick={() => setDetailRailOpen(false)}
                  />
                </div>
                <UniverseFallback
                  detailDirection={detailDirection}
                  model={model}
                  motionActive={motionActive}
                  noPathNotice={noPathNotice}
                  showStyleDirectory={false}
                  state={state}
                  onReturnToStyle={returnToStyleFocus}
                  onSelectArtist={selectArtist}
                  onSelectReleaseGroup={selectReleaseGroup}
                  onSelectStyle={selectStyle}
                  pagination={catalogData}
                />
              </aside>
            ) : null}
            {directoryOpen ? (
              <div
                className="universe-directory-panel"
                id="universe-directory-panel"
                ref={directoryPanelRef}
              >
                <UniverseFallback
                  detailDirection={detailDirection}
                  model={model}
                  motionActive={motionActive}
                  noPathNotice={noPathNotice}
                  state={state}
                  onReturnToStyle={returnToStyleFocus}
                  onSelectArtist={selectArtist}
                  onSelectReleaseGroup={selectReleaseGroup}
                  onSelectStyle={selectStyle}
                  pagination={catalogData}
                />
              </div>
            ) : null}
          </>
        )}
      </main>
      {backgroundTrackUrl ? (
        <BackgroundAudioPlayer
          detailRailOpen={!useFallback && Boolean(state.focus_id) && detailRailOpen}
          src={backgroundTrackUrl}
        />
      ) : null}
      <div aria-live="polite" className="sr-only">{liveMessage}</div>
    </div>
  );
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function readableRelationType(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function countSuffix(label: string, count: number): string {
  return label.replace(String(count), "").trim();
}
