import type { ArtistSummary, Page, RelationDetail, ReleaseGroupSummary, SearchResult, UniverseOverview } from './catalog-repository.ts';
import type { CatalogSession } from './catalog-session.ts';
import { StaticShardedCatalogRepository } from './static-sharded-catalog-repository.ts';
import { buildCatalogUniverseModel } from '../../experiment/viewmodel/catalog-universe-model.ts';
import type { UniverseOverviewViewModel } from '../../experiment/viewmodel/universe-overview-model.ts';
import { initialUniverseState, serializeUniverseState, type UniverseState } from '../../app/experiment/universe-navigation.ts';

export interface CatalogUniverseSnapshot {
  status: 'loading' | 'ready' | 'error'; model: UniverseOverviewViewModel | null;
  state: UniverseState; error: string | null; detail_loading: boolean;
  search_results: readonly SearchResult[]; search_loading: boolean;
  artist_cursor: string | null; release_cursor: string | null; relation_cursor: string | null;
  preserved_artist_count: number;
}

// Every request belongs to one generation and one selection revision. Late responses cannot change the current view.
export class CatalogUniverseController {
  #snapshot: CatalogUniverseSnapshot = { status: 'loading', model: null, state: initialUniverseState,
    error: null, detail_loading: false, search_results: [], search_loading: false,
    artist_cursor: null, release_cursor: null, relation_cursor: null, preserved_artist_count: 0 };
  #listeners = new Set<() => void>();
  #session: CatalogSession | null = null;
  #overview: UniverseOverview | null = null;
  #artists: ArtistSummary[] = [];
  #releases: ReleaseGroupSummary[] = [];
  #relations: RelationDetail[] = [];
  #selectionRevision = 0;
  #searchRevision = 0;
  #openingAbort = new AbortController();
  #disposed = false;

  constructor(readonly repository: StaticShardedCatalogRepository,
    private readonly onUrlState: (state: UniverseState, behavior: 'replace' | 'push') => void) {}
  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };

  async open(search: string) {
    try {
      const session = await this.repository.openSession(this.#openingAbort.signal);
      if (this.#disposed) { session.release(); return; }
      this.#session = session;
      const overview = await this.repository.loadOverview(session);
      if (this.#disposed) return;
      this.#overview = overview;
      this.#update({ status: 'ready', preserved_artist_count: this.repository.catalogCounts(session).projections.preserved_seed_artists ?? 0 }, true);
      await this.restoreSearch(search);
    } catch (error) { if (!this.#disposed) this.#update({ status: 'error', error: message(error) }); }
  }

  async restoreSearch(search: string) {
    if (!this.#session || !this.#overview || this.#disposed) return;
    const parameters = new URLSearchParams(search);
    for (const key of [...parameters.keys()]) if (!['mode', 'focus_id', 'artist_id', 'release_group_id', 'era', 'relation_type'].includes(key)) parameters.delete(key);
    if (serializeUniverseState(this.#snapshot.state) === parameters.toString()) return;
    const revision = ++this.#selectionRevision;
    const requested = ['focus_id', 'artist_id', 'release_group_id'] as const;
    const resolved = await Promise.all(requested.map(async (key) => {
      const id = parameters.get(key);
      if (!id) return null;
      const result = await this.repository.resolveEntityId(id, this.#session!);
      return result.status === 'current' || result.status === 'redirected' ? result.entity_id : null;
    })).catch((error) => { this.#detailError(error, revision); return null; });
    if (!resolved || revision !== this.#selectionRevision || this.#disposed) return;
    const styleId = this.#overview.styles.some((style) => style.entity_id === resolved[0]) ? resolved[0]! : null;
    const mode = parameters.get('mode');
    const state: UniverseState = { mode: mode === 'artist' || mode === 'era' || mode === 'relation' ? mode : 'style',
      focus_id: styleId, artist_id: styleId ? resolved[1] ?? null : null,
      release_group_id: styleId && resolved[1] ? resolved[2] ?? null : null,
      era: parameters.get('era'), relation_type: parameters.get('relation_type') };
    await this.select(state);
    if (serializeUniverseState(this.#snapshot.state) !== parameters.toString()) this.onUrlState(this.#snapshot.state, 'replace');
  }

  select = async (state: UniverseState) => {
    if (!this.#session || !this.#overview || this.#disposed) return;
    const revision = ++this.#selectionRevision;
    const session = this.#session;
    const parentChanged = state.focus_id !== this.#snapshot.state.focus_id;
    const artistChanged = parentChanged || state.artist_id !== this.#snapshot.state.artist_id;
    if (parentChanged) { this.#artists = []; this.#relations = []; }
    if (artistChanged) this.#releases = [];
    this.#update({ state, error: null, detail_loading: Boolean(state.focus_id),
      ...(parentChanged ? { artist_cursor: null, relation_cursor: null } : {}),
      ...(artistChanged ? { release_cursor: null } : {}),
    }, true);
    if (!state.focus_id) { this.#update({ detail_loading: false }); return; }
    try {
      const [artistPage, relationPage, selectedArtist, releasePage, selectedRelease] = await Promise.all([
        parentChanged || this.#artists.length === 0 ? this.repository.loadStyleArtists(state.focus_id, null, session) : null,
        parentChanged || this.#relations.length === 0 ? this.repository.loadStyleRelations(state.focus_id, null, session) : null,
        state.artist_id ? this.repository.loadArtist(state.artist_id, session) : null,
        state.artist_id && (artistChanged || this.#releases.length === 0)
          ? this.repository.loadArtistReleaseGroups(state.artist_id, null, session) : null,
        state.release_group_id ? this.repository.loadReleaseGroup(state.release_group_id, session) : null,
      ]);
      if (revision !== this.#selectionRevision || this.#disposed) return;
      if (artistPage) this.#artists = [...artistPage.items];
      if (relationPage) this.#relations = [...relationPage.items];
      if (releasePage) this.#releases = [...releasePage.items];
      let acceptedState = state;
      if (selectedArtist) {
        const belongs = (selectedArtist.presentation_style_ids ?? selectedArtist.style_ids).includes(state.focus_id)
          || artistPage?.items.some((artist) => artist.entity_id === selectedArtist.entity_id);
        if (!belongs) acceptedState = { ...state, artist_id: null, release_group_id: null };
        else if (!this.#artists.some((artist) => artist.entity_id === selectedArtist.entity_id)) this.#artists.push(selectedArtist);
      }
      if (selectedRelease) {
        if (!selectedRelease.artist_ids.includes(acceptedState.artist_id ?? '')) acceptedState = { ...acceptedState, release_group_id: null };
        else if (!this.#releases.some((release) => release.entity_id === selectedRelease.entity_id)) this.#releases.push(selectedRelease);
      }
      this.#update({ state: acceptedState, detail_loading: false,
        ...(artistPage ? { artist_cursor: artistPage.next_cursor } : {}),
        ...(relationPage ? { relation_cursor: relationPage.next_cursor } : {}),
        ...(releasePage ? { release_cursor: releasePage.next_cursor } : {}),
      }, true);
      if (acceptedState !== state) this.onUrlState(acceptedState, 'replace');
    } catch (error) { this.#detailError(error, revision); }
  };

  search = async (query: string) => {
    if (!this.#session || this.#disposed) return;
    const revision = ++this.#searchRevision;
    this.#update({ search_loading: Boolean(query.trim()), search_results: [] });
    if (!query.trim()) return;
    try {
      const results = await this.repository.searchEntities(query, { entity_types: ['style', 'artist'], limit: 20 }, this.#session);
      if (revision === this.#searchRevision && !this.#disposed) this.#update({ search_results: results.items, search_loading: false });
    } catch (error) { if (revision === this.#searchRevision && !this.#disposed) this.#update({ error: message(error), search_loading: false }); }
  };

  prepareSearch(query: string) {
    this.#searchRevision++;
    if (!this.#disposed) this.#update({ search_loading: Boolean(query.trim()), search_results: [] });
  }

  chooseSearchResult = async (id: string, type: 'style' | 'artist') => {
    if (!this.#session || !this.#overview || this.#disposed) return;
    const revision = ++this.#selectionRevision;
    try {
      let focusId = id, artistId: string | null = null;
      if (type === 'artist') {
        const artist = await this.repository.loadArtist(id, this.#session);
        if (this.#disposed || revision !== this.#selectionRevision) return;
        focusId = [...artist.style_ids, ...(artist.presentation_style_ids ?? [])].find((candidate) => this.#overview!.styles.some((style) => style.entity_id === candidate)) ?? '';
        artistId = artist.entity_id;
      }
      if (!focusId) { this.#update({ error: 'Artist has no published style association' }); return; }
      const next = { ...this.#snapshot.state, focus_id: focusId, artist_id: artistId, release_group_id: null };
      this.onUrlState(next, 'push');
      await this.select(next);
    } catch (error) { if (!this.#disposed && revision === this.#selectionRevision) this.#update({ error: message(error) }); }
  };

  more = async (collection: 'artists' | 'releases' | 'relations') => {
    if (!this.#session || this.#disposed || this.#snapshot.detail_loading) return;
    const state = this.#snapshot.state;
    const revision = this.#selectionRevision;
    const cursor = collection === 'artists' ? this.#snapshot.artist_cursor : collection === 'releases' ? this.#snapshot.release_cursor : this.#snapshot.relation_cursor;
    if (!cursor || !state.focus_id) return;
    this.#update({ detail_loading: true, error: null });
    try {
      const page = collection === 'artists'
        ? await this.repository.loadStyleArtists(state.focus_id, cursor, this.#session)
        : collection === 'relations'
          ? await this.repository.loadStyleRelations(state.focus_id, cursor, this.#session)
          : await this.repository.loadArtistReleaseGroups(state.artist_id!, cursor, this.#session);
      if (revision !== this.#selectionRevision || this.#disposed) return;
      if (collection === 'artists') this.#artists = unique([...this.#artists, ...(page as Page<ArtistSummary>).items]);
      if (collection === 'releases') this.#releases = unique([...this.#releases, ...(page as Page<ReleaseGroupSummary>).items]);
      if (collection === 'relations') this.#relations = unique([...this.#relations, ...(page as Page<RelationDetail>).items]);
      this.#update({ detail_loading: false, [`${collection === 'artists' ? 'artist' : collection === 'releases' ? 'release' : 'relation'}_cursor`]: page.next_cursor }, true);
    } catch (error) { this.#detailError(error, revision); }
  };
  retry = () => this.select(this.#snapshot.state);
  dispose() { this.#disposed = true; this.#selectionRevision++; this.#searchRevision++; this.#openingAbort.abort(); this.#session?.release(); this.#listeners.clear(); }
  #detailError(error: unknown, revision: number) { if (revision === this.#selectionRevision && !this.#disposed) this.#update({ detail_loading: false, error: message(error) }); }
  #update(patch: Partial<CatalogUniverseSnapshot>, rebuild = false) {
    this.#snapshot = { ...this.#snapshot, ...patch };
    if (rebuild && this.#session && this.#overview) this.#snapshot = { ...this.#snapshot,
      model: buildCatalogUniverseModel({ generation_id: this.#session.generation_id, overview: this.#overview,
        counts: this.repository.catalogCounts(this.#session), focus_id: this.#snapshot.state.focus_id,
        artists: this.#artists, releases: this.#releases, relations: this.#relations }) };
    for (const listener of this.#listeners) listener();
  }
}
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function unique<T extends { entity_id: string }>(items: T[]) { return [...new Map(items.map((item) => [item.entity_id, item])).values()]; }
