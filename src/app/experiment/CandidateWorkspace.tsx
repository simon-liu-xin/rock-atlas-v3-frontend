import { ArrowLeft, ArrowRight, Download, ExternalLink, Share2, Trash2 } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { EditorialCandidate } from "../../candidates/editorial/EditorialCandidate.tsx";
import type { ReadyCandidateViewModel } from "../../candidates/candidate-types.ts";
import { TwoCandidate } from "../../candidates/two/TwoCandidate.tsx";
import { openRelationEvidence } from "../../features/evidence/evidence.ts";
import type { BrowserResearchSession } from "../../experiment/research/browser-research-session.ts";
import type { ResearchEventType } from "../../experiment/research/research-events.ts";
import { useOnlineStatus } from "../../features/network/use-online-status.ts";
import { recordRecentExploration } from "../../features/recent/recent-explorations.ts";
import {
  buildSemanticShareUrl,
  type ExperimentView,
} from "../../features/share/semantic-share.ts";
import type { CandidateViewModelV1 } from "../../generated/schema-types.ts";
import { EvidenceDrawer } from "./EvidenceDrawer.tsx";

const ThreeCandidate = lazy(async () => {
  const module = await import("../../candidates/three/ThreeCandidate.tsx");
  return { default: module.ThreeCandidate };
});

interface CandidateWorkspaceProps {
  view: ExperimentView;
  viewModel: CandidateViewModelV1;
  onNavigate: (href: string) => void;
  initialRelationId?: string;
  forceWebGLFallback?: boolean;
  researchSession?: BrowserResearchSession;
  onResearchWithdraw?: () => void;
}

export function CandidateWorkspace({
  view,
  viewModel,
  onNavigate,
  initialRelationId,
  forceWebGLFallback = false,
  researchSession,
  onResearchWithdraw,
}: CandidateWorkspaceProps) {
  const { t } = useTranslation();
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(
    initialRelationId ?? null,
  );
  const [shareStatus, setShareStatus] = useState<"copied" | "failed" | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const relationTriggerActionIdRef = useRef<string | null>(null);
  const pathEventIdsRef = useRef(new Map<string, string>());
  const [researchEventCount, setResearchEventCount] = useState(
    researchSession?.store.events.length ?? 0,
  );
  const [researchError, setResearchError] = useState("");
  const [researchInvalidated, setResearchInvalidated] = useState(false);
  const online = useOnlineStatus();
  const readyViewModel =
    viewModel.relations.length === 3
      ? (viewModel as ReadyCandidateViewModel)
      : null;
  if (viewModel.relations.length !== 0 && !readyViewModel) {
    throw new Error("Candidate view model must contain zero or three relations.");
  }
  const evidence = useMemo(
    () =>
      selectedRelationId
        ? openRelationEvidence(viewModel, selectedRelationId)
        : null,
    [selectedRelationId, viewModel],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedRelationId) closeRelation();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRelationId]);

  useEffect(() => {
    if (selectedRelationId !== null || typeof document === "undefined") return;
    const actionId = relationTriggerActionIdRef.current;
    if (!actionId) return;

    relationTriggerActionIdRef.current = null;
    document
      .querySelector<HTMLElement>(`[data-action-id="${actionId}"]`)
      ?.focus();
  }, [selectedRelationId]);

  useEffect(() => {
    if (!researchSession) return;
    let eventId = pathEventIdsRef.current.get(viewModel.path_id);
    if (!eventId) {
      eventId = createResearchEventId();
      pathEventIdsRef.current.set(viewModel.path_id, eventId);
    }
    recordResearchEvent("path_opened", null, eventId);
  }, [researchSession, viewModel.path_id]);

  useEffect(() => {
    if (researchSession || typeof window === "undefined") return;
    recordRecentExploration(window.localStorage, {
      state_schema_version: "1.0",
      snapshot: viewModel.snapshot_id,
      view,
      path_id: viewModel.path_id,
      focus_id: viewModel.question.focus_id,
      question: viewModel.question.text,
      visited_at: new Date().toISOString(),
    });
  }, [researchSession, view, viewModel.path_id, viewModel.question.focus_id, viewModel.question.text, viewModel.snapshot_id]);

  function openRelation(relationId: string) {
    const relationIndex = viewModel.relations.findIndex((relation) => relation.internal_id === relationId);
    const actionId = `mw:action:open-relation-${relationIndex + 1}`;
    relationTriggerActionIdRef.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.actionId ?? actionId
        : actionId;
    recordResearchEvent("relation_opened", actionId);
    setSelectedRelationId(relationId);
  }

  function closeRelation() {
    setSelectedRelationId(null);
  }

  const artistAction = viewModel.actions.find(
    (action) => action.action_id === "mw:action:open-artist",
  );
  const recordingAction = viewModel.actions.find(
    (action) => action.action_id === "mw:action:open-recording",
  );
  const nextAction = viewModel.actions.find(
    (action) => action.action_id === "mw:action:next-hop",
  );
  const shareAction = viewModel.actions.find(
    (action) => action.action_id === "mw:action:share",
  );

  function openArtistInScene(artistId: string) {
    recordResearchEvent(
      "artist_opened",
      artistAction?.target_id === artistId ? artistAction.action_id : null,
    );
  }

  function openRecordingInScene(recordingId: string) {
    recordResearchEvent(
      "recording_opened",
      recordingAction?.target_id === recordingId ? recordingAction.action_id : null,
    );
  }

  function goBackToEntry() {
    onNavigate(`/experiment/${view}`);
  }

  function goToNextPath() {
    if (!nextAction) return;
    recordResearchEvent("next_hop", nextAction.action_id);
    onNavigate(nextAction.href.replace("/experiment?", `/experiment/${view}?`));
  }

  async function shareUnderstanding() {
    const firstEvidence = evidence?.evidence[0];
    const origin = typeof window === "undefined" ? "https://musicwiki.local" : window.location.origin;
    const url = buildSemanticShareUrl(origin, view, viewModel, {
      ...(selectedRelationId ? { relation_id: selectedRelationId } : {}),
      ...(firstEvidence ? { evidence_id: firstEvidence.evidence_id } : {}),
    });
    setShareUrl(url);
    recordResearchEvent("share_created", shareAction?.action_id ?? null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch {
      setShareStatus("failed");
    }
  }

  function recordResearchEvent(
    eventType: ResearchEventType,
    actionId: string | null,
    eventId = createResearchEventId(),
  ) {
    if (!researchSession || researchInvalidated) return;
    try {
      researchSession.record({
        event_id: eventId,
        event_type: eventType,
        occurred_at: new Date().toISOString(),
        path_id: viewModel.path_id,
        action_id: actionId,
      });
      setResearchEventCount(researchSession.store.events.length);
      setResearchError("");
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : t("candidate.researchWriteFailed"));
    }
  }

  function exportResearchData() {
    if (!researchSession || researchInvalidated) return;
    const payload = researchSession.export();
    const blobUrl = URL.createObjectURL(
      new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `musicwiki-study-${payload.study_id}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  }

  function withdrawResearchData() {
    if (!researchSession) return;
    if (!window.confirm(t("candidate.withdrawConfirm"))) return;
    researchSession.withdraw();
    onResearchWithdraw?.();
  }

  function invalidateResearchForContextLoss() {
    if (!researchSession || researchInvalidated) return;
    researchSession.invalidate("webgl_context_lost");
    setResearchEventCount(0);
    setResearchError("");
    setResearchInvalidated(true);
  }

  return (
    <div className="candidate-shell" data-candidate-view={view}>
      <header
        aria-hidden={evidence ? true : undefined}
        className="experiment-topbar candidate-topbar"
        inert={evidence ? true : undefined}
      >
        <button className="back-button" type="button" onClick={goBackToEntry}>
          <ArrowLeft aria-hidden="true" size={17} />
          {t("candidate.back")}
        </button>
        <a className="wordmark" href="/" onClick={(event) => event.preventDefault()}>
          {t("app.name")}
        </a>
        <div className="snapshot-meta">
          <span className="status-dot" aria-hidden="true" />
          {viewModel.snapshot_id}
        </div>
      </header>

      {!online ? (
        <div className="network-banner" role="status">
          {t("candidate.offline")}
        </div>
      ) : null}

      <main aria-hidden={evidence ? true : undefined} inert={evidence ? true : undefined}>
        <section className="candidate-intro" data-od-id="candidate-answer" aria-labelledby="question-heading">
          <div className="answer-meta">
            <span>{t("candidate.currentQuestion")}</span>
            <span
              className={`coverage coverage-${viewModel.answer.coverage_state}`}
              data-coverage-state={viewModel.answer.coverage_state}
              title={t(`coverage.${viewModel.answer.coverage_state}.explanation`)}
            >
              {t(`coverage.${viewModel.answer.coverage_state}.label`)}
            </span>
          </div>
          <h1 id="question-heading">{viewModel.question.text}</h1>
          <p>{viewModel.answer.summary}</p>
        </section>

        {!readyViewModel ? <NoRelationEvidence /> : null}
        {readyViewModel && view === "3d" ? (
          <Suspense
            fallback={
              <ThreeCandidateFallback
                viewModel={readyViewModel}
                onOpenRelation={openRelation}
              />
            }
          >
            <ThreeCandidate
              forceFallback={forceWebGLFallback}
              onOpenArtist={openArtistInScene}
              onOpenRecording={openRecordingInScene}
              onContextLost={invalidateResearchForContextLoss}
              viewModel={readyViewModel}
              onOpenRelation={openRelation}
            />
          </Suspense>
        ) : null}
        {readyViewModel && view === "2d" ? (
          <TwoCandidate viewModel={readyViewModel} onOpenRelation={openRelation} />
        ) : null}
        {readyViewModel && view === "editorial" ? (
          <EditorialCandidate viewModel={readyViewModel} onOpenRelation={openRelation} />
        ) : null}

        <section className="listening-band" data-od-id="candidate-listening" aria-labelledby="artists-heading">
          <div className="artist-column">
            <div className="section-heading">
              <span>{t("candidate.artistKicker", { count: viewModel.artists.length })}</span>
              <h2 id="artists-heading">{t("candidate.artists")}</h2>
            </div>
            <ul className="candidate-artists">
              {viewModel.artists.map((artist, index) => (
                <li key={artist.internal_id}>
                  <a
                    href={artist.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={() =>
                      index === 0 && artistAction
                        ? recordResearchEvent("artist_opened", artistAction.action_id)
                        : undefined
                    }
                    {...(index === 0 && artistAction
                      ? { "data-action-id": artistAction.action_id }
                      : {})}
                  >
                    <span className={`artist-light ${index === 0 ? "artist-anchor" : ""}`} aria-hidden="true" />
                    <span className="external-name">
                      {artist.canonical_name}
                      {!online ? <small className="network-required">{t("common.networkRequired")}</small> : null}
                    </span>
                    <ExternalLink aria-hidden="true" size={14} />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="recording-column">
            <div className="section-heading">
              <span>{t("candidate.recordingKicker", { count: viewModel.recordings.length })}</span>
              <h2>{t("candidate.recordings")}</h2>
            </div>
            <ol className="candidate-recordings">
              {viewModel.recordings.map((recording, index) => (
                <li key={recording.internal_id}>
                  <a
                    href={recording.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={() =>
                      index === 0 && recordingAction
                        ? recordResearchEvent("recording_opened", recordingAction.action_id)
                        : undefined
                    }
                    {...(index === 0 && recordingAction
                      ? { "data-action-id": recordingAction.action_id }
                      : {})}
                  >
                    <span>0{index + 1}</span>
                    <strong>{recording.canonical_name}</strong>
                    <span className="recording-meta">
                      <small>{recording.first_release_date ?? t("common.dateUnconfirmed")}</small>
                      {!online ? <small className="network-required">{t("common.networkRequired")}</small> : null}
                    </span>
                    <ExternalLink aria-hidden="true" size={14} />
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="completion-band" data-od-id="candidate-completion">
          <div>
            <span className="section-kicker">{t("candidate.understandingKicker")}</span>
            <h2>{t("candidate.understood", { summary: viewModel.answer.summary })}</h2>
          </div>
          <div className="completion-actions">
            {nextAction ? (
              <button
                className="primary-action"
                data-action-id={nextAction.action_id}
                type="button"
                onClick={goToNextPath}
              >
                {t("candidate.next")}
                <ArrowRight aria-hidden="true" size={17} />
              </button>
            ) : null}
            {shareAction ? (
              <button
                className="secondary-action"
                data-action-id={shareAction.action_id}
                type="button"
                onClick={shareUnderstanding}
              >
                <Share2 aria-hidden="true" size={16} />
                {t("candidate.share")}
              </button>
            ) : null}
          </div>
          <div className="share-feedback" aria-live="polite">
            {shareStatus ? (
              <span>{shareStatus === "copied" ? t("candidate.shareCopied") : t("candidate.shareFailed")}</span>
            ) : null}
            {shareStatus === "failed" ? (
              <input aria-label={t("candidate.shareLink")} readOnly value={shareUrl} />
            ) : null}
          </div>
        </section>
      </main>

      {researchSession && researchInvalidated ? (
        <aside className="study-toolbar study-invalidated" aria-label={t("candidate.invalidatedLabel")} role="alert">
          <strong>{t("candidate.invalidatedHeading")}</strong>
          <span>{t("candidate.invalidatedDetail")}</span>
        </aside>
      ) : researchSession ? (
        <aside className="study-toolbar" aria-label={t("candidate.researchLabel")}>
          <span>{t("candidate.researchEvents", { count: researchEventCount })}</span>
          <button type="button" onClick={exportResearchData}>
            <Download aria-hidden="true" size={15} />
            {t("candidate.exportResearch")}
          </button>
          <button type="button" onClick={withdrawResearchData}>
            <Trash2 aria-hidden="true" size={15} />
            {t("candidate.withdraw")}
          </button>
          <span aria-live="polite">{researchError}</span>
        </aside>
      ) : null}

      {evidence ? (
        <>
          <button
            className="drawer-scrim"
            type="button"
            tabIndex={-1}
            aria-label={t("candidate.closeEvidence")}
            onClick={closeRelation}
          />
          <EvidenceDrawer evidence={evidence} online={online} onClose={closeRelation} />
        </>
      ) : null}
    </div>
  );
}

function createResearchEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `evt-${crypto.randomUUID()}`;
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function NoRelationEvidence() {
  const { t } = useTranslation();
  return (
    <section
      className="candidate-stage no-evidence-stage"
      data-od-id="candidate-no-evidence"
      role="status"
      aria-labelledby="no-evidence-heading"
    >
      <div>
        <span className="section-kicker">{t("candidate.noEvidenceKicker")}</span>
        <h2 id="no-evidence-heading">{t("candidate.noEvidenceHeading")}</h2>
        <p>{t("candidate.noEvidenceDetail")}</p>
      </div>
    </section>
  );
}

function ThreeCandidateFallback({
  viewModel,
  onOpenRelation,
}: {
  viewModel: ReadyCandidateViewModel;
  onOpenRelation: (relationId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="candidate-stage three-stage"
      data-artist-ids={viewModel.artists.map((artist) => artist.internal_id).join("|")}
      data-evidence-ids={viewModel.evidence.map((record) => record.evidence_id).join("|")}
      data-focus-id={viewModel.question.focus_id}
      data-od-id="candidate-3d-loading"
      data-recording-ids={viewModel.recordings.map((recording) => recording.internal_id).join("|")}
      data-relation-ids={viewModel.relations.map((relation) => relation.internal_id).join("|")}
    >
      <div className="universe-canvas" role="img" aria-label={t("candidate.loading3d")}>
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
      </div>
      <div className="universe-focus-label">
        <small>{t("three.focusNebula")}</small>
        <strong>{viewModel.relations[0].source_name}</strong>
      </div>
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
    </section>
  );
}
