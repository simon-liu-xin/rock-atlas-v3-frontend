import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import manifestJson from "../../../data/fixtures/experiment-v1/manifest.json";
import sampleText from "../../../data/fixtures/experiment-v1/sample.json?raw";
import {
  buildCandidateViewModel,
} from "../../experiment/viewmodel/candidate-model.ts";
import {
  parseExperimentFault,
  verifyExperimentFixture,
  type ExperimentReadinessResult,
} from "../../experiment/readiness/experiment-readiness.ts";
import {
  clearBrowserResearchSession,
  loadBrowserResearchSession,
  startBrowserResearchSession,
} from "../../experiment/research/browser-research-session.ts";
import type { ExperimentAssignment } from "../../experiment/research/research-events.ts";
import type { ExperimentView } from "../../features/share/semantic-share.ts";
import {
  coverageStatePresentations,
  type CoverageState,
} from "../../ui/states/coverage-state.ts";
import { LegacyEvidencePage } from "../LegacyEvidencePage.tsx";
import { CandidateWorkspace } from "./CandidateWorkspace.tsx";
import { ExperimentReadinessPage } from "./ExperimentReadinessPage.tsx";
import { ResearchConsentPage, ResearchCorruptPage } from "./ResearchStudyPages.tsx";
import { SharedEntry } from "./SharedEntry.tsx";
import { UniverseHomepage } from "./UniverseHomepage.tsx";
import { CatalogUniverseHomepage } from './CatalogUniverseHomepage.tsx';
import {
  serializeUniverseState,
  type UniverseState,
} from "./universe-navigation.ts";

interface BrowserLocation {
  pathname: string;
  search: string;
}

export function ExperimentApp() {
  const { t } = useTranslation();
  const [location, setLocation] = useState<BrowserLocation>(() => readLocation());
  const [researchRevision, setResearchRevision] = useState(0);
  const [readinessRevision, setReadinessRevision] = useState(0);
  const [readiness, setReadiness] = useState<
    ExperimentReadinessResult | { status: "loading" }
  >({ status: "loading" });
  const [researchError, setResearchError] = useState("");
  const parameters = new URLSearchParams(location.search);
  const injectedFault = parseExperimentFault(parameters.get("fault"));
  const forceLoadingPreview = import.meta.env.DEV && parameters.get("fault") === "loading";
  const studyId = parameters.get("study");
  const requestedView = routeView(location.pathname) ?? assignmentView(parameters.get("assignment"));
  const catalogHomepage = shouldRenderUniverseHomepage(location.pathname, parameters, requestedView)
    && !parameters.has('fault');
  const researchLoad = useMemo(
    () => (studyId ? loadBrowserResearchSession(window.localStorage, studyId) : null),
    [studyId, researchRevision],
  );
  useEffect(() => {
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    // Static reading pages have their own HTML; app query states are not separate index pages.
    robots.content = location.pathname === '/' && !location.search ? 'index, follow' : 'noindex, follow';
  }, [location.pathname, location.search]);
  const studyAssignment =
    researchLoad?.status === "ready"
      ? researchLoad.session.store.consent!.assignment
      : assignmentView(parameters.get("assignment") ?? requestedView);

  useEffect(() => {
    let active = true;
    setReadiness({ status: "loading" });
    if (forceLoadingPreview || catalogHomepage) return () => {
      active = false;
    };
    void verifyExperimentFixture(sampleText, manifestJson, injectedFault).then((result) => {
      if (!active) return;
      setReadiness(result);
    }).catch(() => {
      if (active) {
        setReadiness({ status: "failed", error_code: "MW_PACK_INCOMPLETE" });
      }
    });
    return () => {
      active = false;
    };
  }, [catalogHomepage, forceLoadingPreview, injectedFault, readinessRevision]);

  useEffect(() => {
    function onPopState() {
      setLocation(readLocation());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(href: string) {
    const target = new URL(href, window.location.origin);
    if (studyId && target.pathname.startsWith("/experiment/")) {
      target.searchParams.set("study", studyId);
      target.searchParams.set("assignment", studyAssignment);
    }
    window.history.pushState({}, "", `${target.pathname}${target.search}${target.hash}`);
    setLocation(readLocation());
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function updateUniverseState(
    state: UniverseState,
    behavior: "push" | "replace",
  ) {
    const nextParameters = new URLSearchParams(serializeUniverseState(state));
    for (const key of ["snapshot", "webgl"] as const) {
      const value = parameters.get(key);
      if (value) nextParameters.set(key, value);
    }
    const nextSearch = nextParameters.toString();
    const href = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    if (behavior === "push") window.history.pushState({}, "", href);
    else window.history.replaceState({}, "", href);
    setLocation(readLocation());
  }

  if (location.pathname.startsWith("/evidence/")) return <LegacyEvidencePage />;

  if (catalogHomepage) return <CatalogUniverseHomepage initialSearch={location.search}
    forceWebGLFallback={parameters.get('webgl') === 'off'} onNavigate={navigate} onStateChange={updateUniverseState} />;

  if (readiness.status !== "ready") {
    return (
      <ExperimentReadinessPage
        result={readiness}
        onRetry={() => setReadinessRevision((revision) => revision + 1)}
      />
    );
  }

  const sample = readiness.sample;

  if (studyId && researchLoad?.status === "corrupt") {
    return (
      <ResearchCorruptPage
        onDelete={() => {
          clearBrowserResearchSession(window.localStorage, studyId);
          setResearchRevision((revision) => revision + 1);
        }}
      />
    );
  }

  if (studyId && researchLoad?.status === "missing") {
    return (
      <ResearchConsentPage
        assignment={studyAssignment}
        errorMessage={researchError}
        onConsent={(alias) => {
          try {
            startBrowserResearchSession(window.localStorage, {
              study_id: studyId,
              assignment: studyAssignment,
              participant_alias: alias,
              consented_at: new Date().toISOString(),
            });
            setResearchError("");
            setResearchRevision((revision) => revision + 1);
          } catch (error) {
            setResearchError(error instanceof Error ? error.message : t("study.createFailed"));
          }
        }}
      />
    );
  }

  const view = (researchLoad?.status === "ready" ? studyAssignment : requestedView) as ExperimentAssignment;
  const pathId = parameters.get("path");
  if (!pathId) {
    if (shouldRenderUniverseHomepage(location.pathname, parameters, view)) {
      return (
        <UniverseHomepage
          forceWebGLFallback={parameters.get("webgl") === "off"}
          initialSearch={location.search}
          sample={sample}
          onNavigate={navigate}
          onStateChange={updateUniverseState}
        />
      );
    }
    return <SharedEntry sample={sample} assignedView={view} onNavigate={navigate} />;
  }

  let viewModel;
  try {
    viewModel = buildCandidateViewModel(sample, pathId);
  } catch {
    return <SharedEntry sample={sample} assignedView={view} onNavigate={navigate} />;
  }
  const previewCoverageState = parameters.get("ui_state");
  if (import.meta.env.DEV && isCoverageState(previewCoverageState)) {
    viewModel = {
      ...viewModel,
      answer: { ...viewModel.answer, coverage_state: previewCoverageState },
    };
  }

  return (
    <CandidateWorkspace
      forceWebGLFallback={parameters.get("webgl") === "off"}
      onNavigate={navigate}
      onResearchWithdraw={() => setResearchRevision((revision) => revision + 1)}
      view={view}
      viewModel={viewModel}
      {...(researchLoad?.status === "ready" ? { researchSession: researchLoad.session } : {})}
      {...(parameters.get("relation_id")
        ? { initialRelationId: parameters.get("relation_id")! }
        : {})}
    />
  );
}

function isCoverageState(value: string | null): value is CoverageState {
  return value !== null && value in coverageStatePresentations;
}

function routeView(pathname: string): ExperimentView | null {
  const match = /^\/experiment\/(3d|2d|editorial)\/?$/.exec(pathname);
  const view = match?.[1];
  return view === "3d" || view === "2d" || view === "editorial" ? view : null;
}

function assignmentView(value: string | null): ExperimentView {
  return value === "2d" || value === "editorial" || value === "3d" ? value : "3d";
}

export function shouldRenderUniverseHomepage(
  pathname: string,
  parameters: URLSearchParams,
  assignedView: ExperimentView,
): boolean {
  const ordinaryPath = pathname === "/" || /^\/experiment\/3d\/?$/.test(pathname);
  return (
    ordinaryPath &&
    assignedView === "3d" &&
    !parameters.has("study") &&
    !parameters.has("path")
  );
}

function readLocation(): BrowserLocation {
  return { pathname: window.location.pathname, search: window.location.search };
}
