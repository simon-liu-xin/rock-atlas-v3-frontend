/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKGROUND_TRACK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
