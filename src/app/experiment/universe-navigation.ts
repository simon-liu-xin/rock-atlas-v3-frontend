import type { UniverseOverviewViewModel } from "../../experiment/viewmodel/universe-overview-model.ts";

export type UniverseMode = "style" | "artist" | "era" | "relation";

export interface UniverseState {
  mode: UniverseMode;
  focus_id: string | null;
  artist_id: string | null;
  release_group_id: string | null;
  era: string | null;
  relation_type: string | null;
}

export const initialUniverseState: UniverseState = {
  mode: "style",
  focus_id: null,
  artist_id: null,
  release_group_id: null,
  era: null,
  relation_type: null,
};

export type UniverseAction =
  | { type: "set_mode"; mode: UniverseMode }
  | { type: "select_style"; style_id: string }
  | { type: "select_artist"; artist_id: string }
  | { type: "select_release_group"; release_group_id: string }
  | { type: "set_era"; era: string | null }
  | { type: "set_relation_type"; relation_type: string | null }
  | { type: "clear_selection" }
  | { type: "reset" };

export function transitionUniverse(
  state: UniverseState,
  action: UniverseAction,
): UniverseState {
  switch (action.type) {
    case "set_mode":
      return { ...state, mode: action.mode };
    case "select_style":
      return {
        ...state,
        focus_id: action.style_id,
        artist_id: null,
        release_group_id: null,
      };
    case "select_artist":
      if (!state.focus_id) return state;
      return { ...state, artist_id: action.artist_id, release_group_id: null };
    case "select_release_group":
      if (!state.focus_id || !state.artist_id) return state;
      return { ...state, release_group_id: action.release_group_id };
    case "set_era":
      return { ...state, era: action.era };
    case "set_relation_type":
      return { ...state, relation_type: action.relation_type };
    case "clear_selection":
      return clearUniverseSelection(state);
    case "reset":
      return { ...initialUniverseState };
  }
}

export function clearUniverseSelection(state: UniverseState): UniverseState {
  if (state.release_group_id) return { ...state, release_group_id: null };
  if (state.artist_id) return { ...state, artist_id: null };
  if (state.focus_id) return { ...state, focus_id: null };
  return state;
}

export function returnToUniverseOverview(state: UniverseState): UniverseState {
  if (!state.focus_id && !state.artist_id && !state.release_group_id) return state;
  return {
    ...state,
    focus_id: null,
    artist_id: null,
    release_group_id: null,
  };
}

export function parseUniverseState(
  search: string,
  model: UniverseOverviewViewModel,
): UniverseState {
  const parameters = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const requestedMode = parameters.get("mode");
  const mode = isUniverseMode(requestedMode) ? requestedMode : "style";
  const requestedStyleId = parameters.get("focus_id");
  const style = model.styles.find((candidate) => candidate.internal_id === requestedStyleId);
  const requestedArtistId = parameters.get("artist_id");
  const artist = style
    ? model.artists.find(
        (candidate) =>
          candidate.internal_id === requestedArtistId &&
          candidate.style_id === style.internal_id,
      )
    : undefined;
  const requestedReleaseGroupId = parameters.get("release_group_id");
  const releaseGroup = artist
    ? model.release_groups.find(
        (candidate) =>
          candidate.internal_id === requestedReleaseGroupId &&
          candidate.artist_ids.includes(artist.internal_id),
      )
    : undefined;
  const requestedEra = parameters.get("era");
  const era = requestedEra && model.eras.includes(requestedEra) ? requestedEra : null;
  const requestedRelationType = parameters.get("relation_type");
  const relationType =
    requestedRelationType && model.relation_types.includes(requestedRelationType)
      ? requestedRelationType
      : null;

  return {
    mode,
    focus_id: style?.internal_id ?? null,
    artist_id: artist?.internal_id ?? null,
    release_group_id: releaseGroup?.internal_id ?? null,
    era,
    relation_type: relationType,
  };
}

export function serializeUniverseState(state: UniverseState): string {
  const parameters = new URLSearchParams();
  if (state.mode !== "style") parameters.set("mode", state.mode);
  if (state.focus_id) {
    parameters.set("focus_id", state.focus_id);
    if (state.artist_id) {
      parameters.set("artist_id", state.artist_id);
      if (state.release_group_id) {
        parameters.set("release_group_id", state.release_group_id);
      }
    }
  }
  if (state.era) parameters.set("era", state.era);
  if (state.relation_type) parameters.set("relation_type", state.relation_type);
  return parameters.toString();
}

function isUniverseMode(value: string | null): value is UniverseMode {
  return value === "style" || value === "artist" || value === "era" || value === "relation";
}
