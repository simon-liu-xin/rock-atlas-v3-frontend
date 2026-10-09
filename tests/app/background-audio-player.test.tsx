import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, test } from "vitest";

import {
  BackgroundAudioPlayer,
  createBackgroundAudioPlayerSession,
  stopBackgroundAudioRetryPropagation,
  type BackgroundAudioElement,
} from "../../src/app/audio/BackgroundAudioPlayer.tsx";
import type { BackgroundAudioState, RetryTarget } from "../../src/app/audio/background-audio-controller.ts";
import { createI18n } from "../../src/i18n/config.ts";

type RetryEvent = "pointerdown" | "pointerup" | "keydown" | "touchstart" | "touchend" | "click";
type Listener = () => void;

class FakeAudio implements BackgroundAudioElement {
  static instances: FakeAudio[] = [];
  static playResults: Array<() => Promise<void>> = [];

  loop = false;
  loadCalls = 0;
  loadError: Error | null = null;
  pauseCalls = 0;
  playCalls = 0;
  preload = "";
  volume = 1;
  removedAttributes: string[] = [];
  private readonly errorListeners = new Set<Listener>();

  constructor(readonly src: string) {
    FakeAudio.instances.push(this);
  }

  addEventListener(type: "error", listener: Listener) {
    if (type === "error") this.errorListeners.add(listener);
  }

  emitError() {
    for (const listener of [...this.errorListeners]) listener();
  }

  errorListenerCount() {
    return this.errorListeners.size;
  }

  pause() {
    this.pauseCalls += 1;
  }

  load() {
    this.loadCalls += 1;
    if (this.loadError) throw this.loadError;
  }

  play() {
    this.playCalls += 1;
    return FakeAudio.playResults.shift()?.() ?? Promise.resolve();
  }

  removeEventListener(type: "error", listener: Listener) {
    if (type === "error") this.errorListeners.delete(listener);
  }

  removeAttribute(name: string) {
    this.removedAttributes.push(name);
  }
}

class FakeRetryTarget implements RetryTarget {
  private readonly listeners = new Map<RetryEvent, Set<Listener>>();

  addEventListener(type: RetryEvent, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: RetryEvent) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }

  removeEventListener(type: RetryEvent, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
}

function setup() {
  const states: BackgroundAudioState[] = [];
  const target = new FakeRetryTarget();
  const session = createBackgroundAudioPlayerSession(
    "data:audio/wav;base64,test",
    target,
    (state) => states.push(state),
    FakeAudio,
  );
  const audio = FakeAudio.instances[0]!;

  return { audio, session, states, target };
}

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.playResults = [];
});

describe("BackgroundAudioPlayer", () => {
  test("renders a localized compact play control and readable paused state", () => {
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={createI18n()}>
        <BackgroundAudioPlayer src="data:audio/wav;base64,test" />
      </I18nextProvider>,
    );

    expect(html).toContain('data-od-id="background-audio-player"');
    expect(html).toContain('data-audio-state="paused"');
    expect(html).toContain('aria-label="Play background audio"');
    expect(html).toContain('title="Play background audio"');
    expect(html).toContain('class="lucide lucide-play"');
    expect(html).toContain('width="10"');
    expect(html).toContain('class="background-audio-status sr-only"');
    expect(html).toContain("Paused");
  });

  test("constructs and configures one audio element before successful autoplay", async () => {
    const { audio, session, states, target } = setup();

    await session.started;

    expect(FakeAudio.instances).toHaveLength(1);
    expect(audio.src).toBe("data:audio/wav;base64,test");
    expect(audio.loop).toBe(true);
    expect(audio.preload).toBe("auto");
    expect(audio.volume).toBe(0.5);
    expect(audio.playCalls).toBe(1);
    expect(states).toEqual(["playing"]);
    expect(target.listenerCount()).toBe(0);
  });

  test("reports blocked autoplay and permits a manual retry", async () => {
    FakeAudio.playResults.push(
      () => Promise.reject(new Error("NotAllowedError")),
      () => Promise.resolve(),
    );
    const { audio, session, states, target } = setup();

    await session.started;
    expect(states).toEqual(["blocked"]);
    expect(target.listenerCount()).toBe(6);

    await session.toggle();

    expect(audio.playCalls).toBe(2);
    expect(states).toEqual(["blocked", "playing"]);
    expect(target.listenerCount()).toBe(0);
  });

  test("toggles successful playback through pause and play", async () => {
    const { audio, session, states } = setup();
    await session.started;

    await session.toggle();
    expect(audio.pauseCalls).toBe(1);
    expect(states).toEqual(["playing", "paused"]);

    await session.toggle();
    expect(audio.playCalls).toBe(2);
    expect(states).toEqual(["playing", "paused", "playing"]);
  });

  test("maps a media error to error state and pauses playback", async () => {
    const { audio, session, states } = setup();
    await session.started;

    audio.emitError();

    expect(audio.pauseCalls).toBe(1);
    expect(states).toEqual(["playing", "error"]);
  });

  test("unmount cleanup removes media and document listeners and disposes audio", async () => {
    FakeAudio.playResults.push(() => Promise.reject(new Error("NotAllowedError")));
    const { audio, session, states, target } = setup();
    await session.started;
    expect(audio.errorListenerCount()).toBe(1);
    expect(target.listenerCount()).toBe(6);

    session.dispose();
    audio.emitError();
    target.dispatch("pointerdown");

    expect(audio.errorListenerCount()).toBe(0);
    expect(target.listenerCount()).toBe(0);
    expect(audio.pauseCalls).toBe(1);
    expect(audio.playCalls).toBe(1);
    expect(audio.removedAttributes).toEqual(["src"]);
    expect(audio.loadCalls).toBe(1);
    expect(states).toEqual(["blocked"]);
  });

  test("isolates media load errors while releasing an owned audio element", async () => {
    const { audio, session } = setup();
    await session.started;
    audio.loadError = new Error("decoder cleanup failed");

    expect(() => session.dispose()).not.toThrow();
    expect(audio.removedAttributes).toEqual(["src"]);
    expect(audio.loadCalls).toBe(1);
  });

  test.each([
    "pointerdown",
    "Enter keydown",
    "Space keydown",
    "touchstart",
  ])("keeps the %s gesture inside the manual control", () => {
    let propagationStops = 0;

    stopBackgroundAudioRetryPropagation({
      stopPropagation: () => {
        propagationStops += 1;
      },
    });

    expect(propagationStops).toBe(1);
  });
});
