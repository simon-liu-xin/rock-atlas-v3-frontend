import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createBackgroundAudioController,
  type AudioPort,
  type BackgroundAudioState,
  type RetryTarget,
} from "./background-audio-controller.ts";

type ErrorListener = () => void;

export interface BackgroundAudioElement extends AudioPort {
  addEventListener(type: "error", listener: ErrorListener): void;
  load(): void;
  removeEventListener(type: "error", listener: ErrorListener): void;
  removeAttribute(name: string): void;
}

type BackgroundAudioConstructor = new (src: string) => BackgroundAudioElement;

interface BackgroundAudioPlayerSession {
  started: Promise<void>;
  toggle(): Promise<void>;
  dispose(): void;
}

interface BackgroundAudioPlayerProps {
  src: string;
  detailRailOpen?: boolean;
}

export function stopBackgroundAudioRetryPropagation(event: { stopPropagation(): void }) {
  event.stopPropagation();
}

export function createBackgroundAudioPlayerSession(
  src: string,
  target: RetryTarget,
  onState: (state: BackgroundAudioState) => void,
  AudioConstructor: BackgroundAudioConstructor = Audio,
): BackgroundAudioPlayerSession {
  const audio = new AudioConstructor(src);
  const controller = createBackgroundAudioController(audio, target, onState);
  const onError = () => controller.fail();
  audio.addEventListener("error", onError);

  return {
    dispose: () => {
      audio.removeEventListener("error", onError);
      controller.dispose();
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        // Media teardown must not escape a React effect cleanup.
      }
    },
    started: controller.start(),
    toggle: () => controller.toggle(),
  };
}

export function BackgroundAudioPlayer({ src, detailRailOpen = false }: BackgroundAudioPlayerProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<BackgroundAudioState>("paused");
  const sessionRef = useRef<BackgroundAudioPlayerSession | null>(null);

  useEffect(() => {
    setState("paused");
    const session = createBackgroundAudioPlayerSession(src, document, setState);
    sessionRef.current = session;

    return () => {
      sessionRef.current = null;
      session.dispose();
    };
  }, [src]);

  const isPlaying = state === "playing";
  const actionLabel = t(isPlaying ? "audio.pause" : "audio.play");

  return (
    <div
      className={`background-audio-player${detailRailOpen ? " has-detail-rail" : ""}`}
      data-audio-state={state}
      data-od-id="background-audio-player"
    >
      <button
        aria-label={actionLabel}
        className="background-audio-trigger"
        onKeyDown={stopBackgroundAudioRetryPropagation}
        onClick={(event) => { stopBackgroundAudioRetryPropagation(event); void sessionRef.current?.toggle(); }}
        onPointerDown={stopBackgroundAudioRetryPropagation}
        onPointerUp={stopBackgroundAudioRetryPropagation}
        onTouchStart={stopBackgroundAudioRetryPropagation}
        onTouchEnd={stopBackgroundAudioRetryPropagation}
        title={state === 'blocked' ? t('audio.blocked') : actionLabel}
        type="button"
      >
        {isPlaying
          ? <Pause aria-hidden="true" size={10} />
          : <Play aria-hidden="true" size={10} />}
      </button>
      <span aria-live="polite" className="background-audio-status sr-only">
        {t(`audio.${state}`)}
      </span>
    </div>
  );
}
