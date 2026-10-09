import { ChevronDown, ChevronLeft, ExternalLink } from "lucide-react";
import { useId, useState, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type {
  UniverseArtist,
  UniverseOverviewViewModel,
  UniverseReleaseGroup,
  UniverseStyle,
} from "../../experiment/viewmodel/universe-overview-model.ts";
import type { UniverseState } from "./universe-navigation.ts";
import { AnimatedNumber } from "./AnimatedNumber.tsx";
import { universeDetailDepth, type DetailDirection } from "./ui-motion.ts";

interface UniverseFallbackProps {
  model: UniverseOverviewViewModel;
  motionActive: boolean;
  state: UniverseState;
  noPathNotice: boolean;
  onSelectStyle: (styleId: string) => void;
  onSelectArtist: (artistId: string) => void;
  onSelectReleaseGroup: (releaseGroupId: string) => void;
  onReturnToStyle: () => void;
  showStyleDirectory?: boolean;
  detailDirection?: DetailDirection;
  pagination?: { detailLoading: boolean; artistCursor: string | null; releaseCursor: string | null; relationCursor: string | null;
    onMore: (collection: 'artists' | 'releases' | 'relations') => void } | undefined;
}

export function UniverseFallback({
  model,
  motionActive,
  state,
  noPathNotice,
  onSelectStyle,
  onSelectArtist,
  onSelectReleaseGroup,
  onReturnToStyle,
  showStyleDirectory = true,
  detailDirection = "none",
  pagination,
}: UniverseFallbackProps) {
  const { t } = useTranslation();
  const selectedStyle = model.styles.find((style) => style.internal_id === state.focus_id);
  const selectedArtist = model.artists.find((artist) => artist.internal_id === state.artist_id);
  const selectedReleaseGroup = model.release_groups.find(
    (releaseGroup) => releaseGroup.internal_id === state.release_group_id,
  );
  const artists = selectedStyle
    ? selectedStyle.artist_ids.map((artistId) => requiredArtist(model, artistId))
    : [];
  const releaseGroups = selectedArtist
    ? model.release_groups.filter((releaseGroup) =>
        releaseGroup.artist_ids.includes(selectedArtist.internal_id),
      )
    : [];
  const relations = selectedStyle
    ? model.relations.filter(
        (relation) =>
          (relation.source_id === selectedStyle.internal_id ||
            relation.target_id === selectedStyle.internal_id || relation.related_style_ids?.includes(selectedStyle.internal_id)) &&
          (!state.relation_type || relation.relation_type === state.relation_type),
      )
    : [];
  const detailDepth = universeDetailDepth(state);

  if (selectedStyle && selectedArtist) {
    return (
      <section
        aria-label={t("universe.fallback.label")}
        className="universe-fallback"
        data-detail-depth={detailDepth}
        data-detail-direction={detailDirection}
        data-od-id="universe-fallback"
      >
        <ArtistFocusView
          artist={selectedArtist}
          motionActive={motionActive}
          releaseGroups={releaseGroups}
          selectedReleaseGroup={selectedReleaseGroup}
          style={selectedStyle}
          onReturnToStyle={onReturnToStyle}
          onSelectReleaseGroup={onSelectReleaseGroup}
          pagination={pagination}
        />
      </section>
    );
  }

  return (
    <section
      aria-label={t("universe.fallback.label")}
      className="universe-fallback"
      data-detail-depth={detailDepth}
      data-detail-direction={detailDirection}
      data-od-id="universe-fallback"
    >
      {showStyleDirectory ? <div className="universe-style-directory" aria-label={t("universe.fallback.styles")}>
        {model.styles.map((style) => {
          const selected = style.internal_id === selectedStyle?.internal_id;
          const filtered = Boolean(state.era && style.era !== state.era);
          return (
            <button
              aria-pressed={selected}
              className={[selected ? "is-selected" : "", filtered ? "is-filtered" : ""]
                .filter(Boolean)
                .join(" ")}
              data-era={style.era}
              data-style-id={style.internal_id}
              key={style.internal_id}
              onClick={() => onSelectStyle(style.internal_id)}
              type="button"
            >
              <strong>{style.canonical_name}</strong>
              <small>{style.era}</small>
            </button>
          );
        })}
      </div> : null}

      {selectedStyle ? (
        <div className="universe-fallback-focus">
          <header>
            <div>
              <small>{t("universe.fallback.focusStyle")}</small>
              <h1>{selectedStyle.canonical_name}</h1>
              <p>{selectedStyle.era} · {selectedStyle.region}</p>
            </div>
            <SourceLink href={selectedStyle.source_url} label={t("universe.fallback.viewStyleSource")} />
          </header>

          {noPathNotice || !selectedStyle.path_id ? (
            <p className="universe-data-notice" role="status">{t("universe.fallback.noEvidencePath")}</p>
          ) : null}

          <section aria-labelledby="universe-artists-heading">
            <div className="universe-section-heading">
              <h2 id="universe-artists-heading">{t("universe.fallback.artists")}</h2>
              <AnimatedNumber minimumDigits={2} value={artists.length} />
            </div>
            <div className="universe-artist-directory">
              {artists.map((artist) => (
                <ArtistButton
                  artist={artist}
                  key={artist.internal_id}
                  selected={artist.internal_id === selectedArtist?.internal_id}
                  onSelect={onSelectArtist}
                />
              ))}
            </div>
            {pagination?.artistCursor ? <button type="button" className="universe-catalog-more" disabled={pagination.detailLoading}
              onClick={() => pagination.onMore('artists')}>{t('catalog.moreArtists')}</button> : null}
          </section>

          <RelationDisclosure count={relations.length} label={t("universe.fallback.lineage")}>
            <div className="universe-relation-directory">
              {relations.map((relation) => (
                <article
                  data-assertion-kind={relation.assertion_kind}
                  data-relation-id={relation.internal_id}
                  key={relation.internal_id}
                >
                  <strong>{relation.label}</strong>
                  <small>{relation.relation_type} · {relation.assertion_kind}</small>
                </article>
              ))}
            </div>
            {pagination?.relationCursor ? <button type="button" className="universe-catalog-more" disabled={pagination.detailLoading}
              onClick={() => pagination.onMore('relations')}>{t('catalog.moreRelations')}</button> : null}
          </RelationDisclosure>
        </div>
      ) : null}
    </section>
  );
}

function ArtistFocusView({
  artist,
  motionActive,
  releaseGroups,
  selectedReleaseGroup,
  style,
  onReturnToStyle,
  onSelectReleaseGroup,
  pagination,
}: {
  artist: UniverseArtist;
  motionActive: boolean;
  releaseGroups: UniverseReleaseGroup[];
  selectedReleaseGroup: UniverseReleaseGroup | undefined;
  style: UniverseStyle;
  onReturnToStyle: () => void;
  onSelectReleaseGroup: (releaseGroupId: string) => void;
  pagination?: UniverseFallbackProps['pagination'];
}) {
  const { t } = useTranslation();
  return (
    <div className="universe-artist-focus-view universe-fallback-focus">
      <button className="universe-focus-back" onClick={onReturnToStyle} type="button">
        <ChevronLeft aria-hidden="true" size={15} />
        {t("universe.fallback.backToArtists", { name: style.canonical_name })}
      </button>
      <header>
        <div>
          <small>{t("universe.fallback.artist")}</small>
          <h1>{artist.canonical_name}</h1>
          <p>{style.canonical_name}</p>
        </div>
        <SourceLink href={artist.source_url} label={t("universe.fallback.viewArtistSource")} />
      </header>
      <section aria-labelledby="universe-releases-heading">
        <div className="universe-section-heading">
          <h2 id="universe-releases-heading">{t("universe.fallback.albums")}</h2>
          <AnimatedNumber minimumDigits={2} value={releaseGroups.length} />
        </div>
        {releaseGroups.length ? (
          <div className="universe-release-directory">
            {releaseGroups.map((releaseGroup) => (
              <ReleaseButton
                key={releaseGroup.internal_id}
                motionActive={motionActive}
                releaseGroup={releaseGroup}
                selected={releaseGroup.internal_id === selectedReleaseGroup?.internal_id}
                onSelect={onSelectReleaseGroup}
              />
            ))}
          </div>
        ) : (
          <p className="universe-data-notice">{t("universe.fallback.noReleases")}</p>
        )}
        {pagination?.releaseCursor ? <button type="button" className="universe-catalog-more" disabled={pagination.detailLoading}
          onClick={() => pagination.onMore('releases')}>{t('catalog.moreAlbums')}</button> : null}
      </section>
      {selectedReleaseGroup ? <ReleaseDetail releaseGroup={selectedReleaseGroup} /> : null}
    </div>
  );
}

function ReleaseDetail({ releaseGroup }: { releaseGroup: UniverseReleaseGroup }) {
  const { t } = useTranslation();
  return (
    <section className="universe-release-detail" aria-labelledby="universe-release-heading">
      <small>{t("universe.fallback.selectedRelease")}</small>
      <h2 id="universe-release-heading">{releaseGroup.canonical_name}</h2>
      <dl>
        <div><dt>{t("universe.fallback.type")}</dt><dd>{releaseType(releaseGroup)}</dd></div>
        <div><dt>{t("universe.fallback.firstRelease")}</dt><dd>{releaseGroup.first_release_date ?? t("universe.fallback.dateUnknown")}</dd></div>
      </dl>
      <SourceLink href={releaseGroup.source_url} label={t("universe.fallback.openReleaseSource")} />
    </section>
  );
}

function ArtistButton({
  artist,
  selected,
  onSelect,
}: {
  artist: UniverseArtist;
  selected: boolean;
  onSelect: (artistId: string) => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={selected ? "is-selected" : ""}
      data-artist-id={artist.internal_id}
      onClick={() => onSelect(artist.internal_id)}
      type="button"
    >
      <span aria-hidden="true" />
      {artist.canonical_name}
    </button>
  );
}

function ReleaseButton({
  motionActive,
  releaseGroup,
  selected,
  onSelect,
}: {
  motionActive: boolean;
  releaseGroup: UniverseReleaseGroup;
  selected: boolean;
  onSelect: (releaseGroupId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      aria-pressed={selected}
      className={selected ? "is-selected" : ""}
      data-release-group-id={releaseGroup.internal_id}
      data-release-tilt={motionActive}
      onClick={() => onSelect(releaseGroup.internal_id)}
      onPointerCancel={resetReleaseTilt}
      onPointerLeave={resetReleaseTilt}
      onPointerMove={(event) => trackReleaseTilt(event, motionActive)}
      type="button"
    >
      <span className="universe-release-surface">
        <span aria-hidden="true" className="universe-release-glare" />
        <strong>{releaseGroup.canonical_name}</strong>
        <small>{releaseGroup.first_release_date ?? t("universe.fallback.dateUnknown")} · {releaseType(releaseGroup)}</small>
      </span>
    </button>
  );
}

function SourceLink({ href, label }: { href: string; label: string }) {
  if (!href) return null;
  return (
    <a href={href} rel="noreferrer noopener" target="_blank">
      {label}
      <ExternalLink aria-hidden="true" size={13} />
    </a>
  );
}

function RelationDisclosure({
  children,
  count,
  label,
}: {
  children: ReactNode;
  count: number;
  label: string;
}) {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="universe-disclosure">
      <div className="universe-section-heading">
        <h2 id={headingId}>
          <button aria-controls={panelId} aria-expanded={open} onClick={() => setOpen((value) => !value)} type="button">
            {label}
            <ChevronDown aria-hidden="true" size={15} />
          </button>
        </h2>
        <AnimatedNumber minimumDigits={2} value={count} />
      </div>
      <div className="universe-disclosure-panel" data-open={open} id={panelId}>
        <div>{children}</div>
      </div>
    </section>
  );
}

function trackReleaseTilt(event: PointerEvent<HTMLButtonElement>, motionActive: boolean) {
  if (!motionActive) return;
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  const surface = event.currentTarget.querySelector<HTMLElement>(".universe-release-surface");
  if (!surface) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
  const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
  surface.style.setProperty("--release-rx", `${((0.5 - y) * 8).toFixed(2)}deg`);
  surface.style.setProperty("--release-ry", `${((x - 0.5) * 8).toFixed(2)}deg`);
  surface.style.setProperty("--release-gx", `${(x * 100).toFixed(1)}%`);
  surface.style.setProperty("--release-gy", `${(y * 100).toFixed(1)}%`);
  surface.dataset.tilting = "true";
}

function resetReleaseTilt(event: PointerEvent<HTMLButtonElement>) {
  const surface = event.currentTarget.querySelector<HTMLElement>(".universe-release-surface");
  if (!surface) return;
  surface.style.setProperty("--release-rx", "0deg");
  surface.style.setProperty("--release-ry", "0deg");
  delete surface.dataset.tilting;
}

function requiredArtist(model: UniverseOverviewViewModel, artistId: string): UniverseArtist {
  const artist = model.artists.find((candidate) => candidate.internal_id === artistId);
  if (!artist) throw new Error(`Universe artist ${artistId} is missing.`);
  return artist;
}

function releaseType(releaseGroup: UniverseReleaseGroup): string {
  return [releaseGroup.primary_type, ...releaseGroup.secondary_types].join(" · ");
}

export function selectedUniverseStyle(
  model: UniverseOverviewViewModel,
  state: UniverseState,
): UniverseStyle | undefined {
  return model.styles.find((style) => style.internal_id === state.focus_id);
}
