import { describe, expect, test } from "vitest";

import {
  createBackgroundAudioController,
  type AudioPort,
  type BackgroundAudioState,
  type RetryTarget,
} from "../../src/app/audio/background-audio-controller.ts";

type RetryEvent = "pointerdown" | "pointerup" | "keydown" | "touchstart" | "touchend" | "click";
type RetryListener = () => void;

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

class FakeAudioPort implements AudioPort {
  loop = false;
  pauseCalls = 0;
  playCalls = 0;
  preload = "";
  volume = 1;
  private readonly playResults: Array<() => Promise<void>> = [];

  enqueuePlayResult(result: () => Promise<void>) {
    this.playResults.push(result);
  }

  pause() {
    this.pauseCalls += 1;
  }

  play() {
    this.playCalls += 1;
    return this.playResults.shift()?.() ?? Promise.resolve();
  }
}

class FakeRetryTarget implements RetryTarget {
  throwOnAdd = false;
  throwOnRemove = false;
  private readonly listeners = new Map<RetryEvent, Set<RetryListener>>();

  addEventListener(type: RetryEvent, listener: RetryListener) {
    const listeners = this.listeners.get(type) ?? new Set<RetryListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    if (this.throwOnAdd) {
      throw new Error("add listener failed");
    }
  }

  dispatch(type: RetryEvent) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener();
    }
  }

  listenerCount(type?: RetryEvent) {
    if (type) {
      return this.listeners.get(type)?.size ?? 0;
    }

    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }

  removeEventListener(type: RetryEvent, listener: RetryListener) {
    this.listeners.get(type)?.delete(listener);
    if (this.throwOnRemove) {
      throw new Error("remove listener failed");
    }
  }
}

function setup() {
  const audio = new FakeAudioPort();
  const target = new FakeRetryTarget();
  const states: BackgroundAudioState[] = [];
  const controller = createBackgroundAudioController(audio, target, (state) => states.push(state));

  return { audio, controller, states, target };
}

describe("BackgroundAudioController", () => {
  test("configures the audio port and emits playing after successful autoplay", async () => {
    const { audio, controller, states, target } = setup();

    expect(audio.loop).toBe(true);
    expect(audio.preload).toBe("auto");
    expect(audio.volume).toBe(0.5);

    await controller.start();

    expect(audio.playCalls).toBe(1);
    expect(states).toEqual(["playing"]);
    expect(target.listenerCount()).toBe(0);
  });

  test("retries blocked autoplay once on the first pointer interaction", async () => {
    const { audio, controller, states, target } = setup();
    audio.enqueuePlayResult(() => Promise.reject(new Error("NotAllowedError")));
    audio.enqueuePlayResult(() => Promise.resolve());

    await controller.start();

    expect(states).toEqual(["blocked"]);
    expect(target.listenerCount("pointerdown")).toBe(1);
    expect(target.listenerCount("keydown")).toBe(1);
    expect(target.listenerCount("touchstart")).toBe(1);

    target.dispatch("pointerdown");
    expect(target.listenerCount()).toBe(0);
    await controller.start();

    expect(audio.playCalls).toBe(2);
    expect(states).toEqual(["blocked", "playing"]);
  });

  test("explicit pause prevents later keyboard and touch interactions from restarting audio", async () => {
    const { audio, controller, states, target } = setup();

    await controller.start();
    await controller.toggle();

    target.dispatch("keydown");
    target.dispatch("touchstart");
    await controller.start();

    expect(audio.playCalls).toBe(1);
    expect(audio.pauseCalls).toBe(1);
    expect(states).toEqual(["playing", "paused"]);
    expect(target.listenerCount()).toBe(0);
  });

  test.each(['pointerup', 'touchend', 'click'] as const)('a trusted %s retries playback after the start gesture was rejected', async (event) => {
    const { audio, controller, states, target } = setup();
    audio.enqueuePlayResult(() => Promise.reject(new DOMException('Requires activation', 'NotAllowedError')));
    audio.enqueuePlayResult(() => Promise.reject(new DOMException('Touch start has no activation', 'NotAllowedError')));
    audio.enqueuePlayResult(() => Promise.resolve());
    await controller.start();
    target.dispatch('touchstart');
    await controller.start();
    expect(states).toEqual(['blocked', 'blocked']);
    target.dispatch(event);
    await controller.start();
    expect(audio.playCalls).toBe(3);
    expect(states.at(-1)).toBe('playing');
    expect(audio.volume).toBe(0.5);
    expect(target.listenerCount()).toBe(0);
  });

  test("reports a manual retry failure as error without arming interaction listeners", async () => {
    const { audio, controller, states, target } = setup();
    audio.enqueuePlayResult(() => Promise.reject(new Error("autoplay blocked")));
    audio.enqueuePlayResult(() => Promise.reject(new Error("decoder failed")));

    await controller.start();
    await controller.toggle();

    expect(audio.playCalls).toBe(2);
    expect(states).toEqual(["blocked", "error"]);
    expect(target.listenerCount()).toBe(0);
  });

  test("keeps only one playback attempt pending", async () => {
    const { audio, controller, states } = setup();
    const pending = deferred();
    audio.enqueuePlayResult(() => pending.promise);

    const firstAttempt = controller.start();
    const duplicateAttempt = controller.start();

    expect(audio.playCalls).toBe(1);
    expect(duplicateAttempt).toBe(firstAttempt);
    pending.resolve();
    await firstAttempt;
    expect(states).toEqual(["playing"]);
  });

  test("fail releases a stale pending attempt so manual playback can start", async () => {
    const { audio, controller, states, target } = setup();
    const stalePlayback = deferred();
    audio.enqueuePlayResult(() => stalePlayback.promise);
    audio.enqueuePlayResult(() => Promise.resolve());

    const staleAttempt = controller.start();
    controller.fail();
    await controller.toggle();

    expect(audio.playCalls).toBe(2);
    expect(audio.pauseCalls).toBe(1);
    expect(states).toEqual(["error", "playing"]);

    stalePlayback.reject(new Error("late autoplay rejection"));
    await staleAttempt;

    expect(states).toEqual(["error", "playing"]);
    expect(target.listenerCount()).toBe(0);
  });

  test("fail disarms retries, pauses audio, and emits error", async () => {
    const { audio, controller, states, target } = setup();
    audio.enqueuePlayResult(() => Promise.reject(new Error("blocked")));

    await controller.start();
    expect(target.listenerCount()).toBe(6);

    controller.fail();
    target.dispatch("pointerdown");

    expect(audio.playCalls).toBe(1);
    expect(audio.pauseCalls).toBe(1);
    expect(states).toEqual(["blocked", "error"]);
    expect(target.listenerCount()).toBe(0);
  });

  test("dispose removes retries and ignores late playback settlement and later commands", async () => {
    const blocked = setup();
    blocked.audio.enqueuePlayResult(() => Promise.reject(new Error("blocked")));
    await blocked.controller.start();
    expect(blocked.target.listenerCount()).toBe(6);

    blocked.controller.dispose();
    expect(blocked.target.listenerCount()).toBe(0);

    const pending = setup();
    const playback = deferred();
    pending.audio.enqueuePlayResult(() => playback.promise);
    const pendingAttempt = pending.controller.start();
    pending.controller.dispose();
    playback.resolve();
    await pendingAttempt;

    await pending.controller.start();
    await pending.controller.toggle();
    pending.controller.fail();

    expect(pending.audio.playCalls).toBe(1);
    expect(pending.audio.pauseCalls).toBe(1);
    expect(pending.states).toEqual([]);
    expect(pending.target.listenerCount()).toBe(0);
  });

  test("observer failures do not reject transitions or prevent automatic retry", async () => {
    const audio = new FakeAudioPort();
    const target = new FakeRetryTarget();
    const states: BackgroundAudioState[] = [];
    const controller = createBackgroundAudioController(audio, target, (state) => {
      states.push(state);
      throw new Error("observer failed");
    });
    audio.enqueuePlayResult(() => Promise.reject(new Error("autoplay blocked")));
    audio.enqueuePlayResult(() => Promise.resolve());

    await expect(controller.start()).resolves.toBeUndefined();
    expect(states).toEqual(["blocked"]);
    expect(target.listenerCount()).toBe(6);

    target.dispatch("keydown");
    await expect(controller.start()).resolves.toBeUndefined();

    expect(states).toEqual(["blocked", "playing"]);
    expect(target.listenerCount()).toBe(0);
  });

  test("retry target failures stay contained and leave the controller usable", async () => {
    const { audio, controller, states, target } = setup();
    audio.enqueuePlayResult(() => Promise.reject(new Error("autoplay blocked")));
    audio.enqueuePlayResult(() => Promise.resolve());
    target.throwOnAdd = true;

    await expect(controller.start()).resolves.toBeUndefined();
    expect(states).toEqual(["blocked"]);
    expect(target.listenerCount()).toBe(6);

    target.throwOnAdd = false;
    target.throwOnRemove = true;
    target.dispatch("touchstart");
    await expect(controller.start()).resolves.toBeUndefined();

    expect(states).toEqual(["blocked", "playing"]);
    expect(target.listenerCount()).toBe(0);
  });
});
