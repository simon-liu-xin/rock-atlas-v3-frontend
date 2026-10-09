import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";

import { App } from "./App.tsx";
import { MotionModeProvider } from "./app/motion/MotionModeProvider.tsx";
import { appI18n } from "./i18n/config.ts";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing.");

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={appI18n}>
      <MotionModeProvider>
        <App />
      </MotionModeProvider>
    </I18nextProvider>
  </StrictMode>,
);
