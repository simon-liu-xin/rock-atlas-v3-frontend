import { ExperimentApp } from "./app/experiment/ExperimentApp.tsx";
import { LegacyEvidencePage } from "./app/LegacyEvidencePage.tsx";

export function App() {
  if (typeof window === "undefined") return <LegacyEvidencePage />;
  return <ExperimentApp />;
}
