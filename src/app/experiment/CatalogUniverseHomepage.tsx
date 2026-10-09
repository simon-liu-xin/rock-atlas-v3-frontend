import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StaticShardedCatalogRepository, type BrowserCatalogSigningKey } from '../../data/catalog/static-sharded-catalog-repository.ts';
import { CatalogUniverseController } from '../../data/catalog/catalog-universe-controller.ts';
import trustedKeys from '../../data/catalog/trusted-catalog-keys.json';
import { useTranslation } from 'react-i18next';
import type { ExperimentQueryResult } from '../../features/query/query.ts';
import { ExperimentReadinessPage } from './ExperimentReadinessPage.tsx';
import { UniverseHomepage } from './UniverseHomepage.tsx';
import type { UniverseState } from './universe-navigation.ts';

export function CatalogUniverseHomepage(props: {
  initialSearch: string; forceWebGLFallback: boolean; onNavigate: (href: string) => void;
  onStateChange: (state: UniverseState, behavior: 'push' | 'replace') => void;
}) {
  const [controller, setController] = useState<CatalogUniverseController | null>(null);
  const [revision, setRevision] = useState(0);
  const callback = useRef(props.onStateChange);
  callback.current = props.onStateChange;
  const initialSearch = useRef(props.initialSearch);
  initialSearch.current = props.initialSearch;
  useEffect(() => {
    const repository = new StaticShardedCatalogRepository(fetch, trustedKeys as Record<string, BrowserCatalogSigningKey>);
    const next = new CatalogUniverseController(repository, (state, behavior) => callback.current(state, behavior));
    setController(next);
    void next.open(initialSearch.current);
    return () => next.dispose();
  }, [revision]);
  useEffect(() => { if (controller) void controller.restoreSearch(props.initialSearch); }, [controller, props.initialSearch]);
  if (!controller) return <ExperimentReadinessPage result={{ status: 'loading' }} onRetry={() => setRevision((value) => value + 1)} />;
  return <ConnectedUniverse controller={controller} {...props} onRetry={() => setRevision((value) => value + 1)} />;
}

function ConnectedUniverse({ controller, onRetry, ...props }: Parameters<typeof CatalogUniverseHomepage>[0] & {
  controller: CatalogUniverseController; onRetry: () => void;
}) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => { void controller.search(query); }, query.trim() ? 120 : 0);
    return () => window.clearTimeout(timer);
  }, [controller, query]);
  if (snapshot.status === 'error') return <ExperimentReadinessPage result={{ status: 'failed', error_code: 'MW_PACK_INCOMPLETE' }} onRetry={onRetry} />;
  if (!snapshot.model) return <ExperimentReadinessPage result={{ status: 'loading' }} onRetry={onRetry} />;
  const searchResults: ExperimentQueryResult[] = snapshot.search_results.map((result) => ({
    result_id: result.entity_id, result_type: result.entity_type === 'style' ? 'style' : 'artist', label: result.name,
    detail: t(result.entity_type === 'style' ? 'universe.nav.style' : 'universe.nav.artist'), match_reason: result.match_kind,
    path_id: null, coverage_state: 'not_reviewed',
  }));
  return <UniverseHomepage {...props} modelOverride={snapshot.model} controlledState={snapshot.state}
    catalogData={{ searchResults, searchLoading: snapshot.search_loading, detailLoading: snapshot.detail_loading,
      error: Boolean(snapshot.error), preservedArtistCount: snapshot.preserved_artist_count,
      artistCursor: snapshot.artist_cursor, releaseCursor: snapshot.release_cursor, relationCursor: snapshot.relation_cursor,
      onQuery: (value) => { controller.prepareSearch(value); setQuery(value); }, onSelection: (state) => { void controller.select(state); },
      onSearchResult: (id, type) => { void controller.chooseSearchResult(id, type); },
      onMore: (collection) => { void controller.more(collection); }, onRetry: () => { void controller.retry(); },
    }} />;
}
