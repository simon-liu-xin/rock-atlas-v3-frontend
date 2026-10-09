export interface AmbientScheduler {
  start(): void;
  stop(): void;
}

export interface AmbientSchedulerOptions {
  fps: number;
  invalidate(): void;
  now(): number;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(handle: number): void;
}

const MIN_TIMER_DELAY_MS = 1;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function createAmbientFrameScheduler({
  fps,
  invalidate,
  now,
  requestFrame,
  cancelFrame,
  setTimer,
  clearTimer,
}: AmbientSchedulerOptions): AmbientScheduler {
  const interval = 1000 / fps;
  if (
    !Number.isFinite(fps) ||
    fps <= 0 ||
    !Number.isFinite(interval) ||
    interval < MIN_TIMER_DELAY_MS ||
    interval > MAX_TIMER_DELAY_MS
  ) {
    throw new RangeError(
      `Ambient scheduler fps must produce a timer interval between ${MIN_TIMER_DELAY_MS} and ${MAX_TIMER_DELAY_MS}ms`,
    );
  }

  let running = false;
  let generation = 0;
  let nextDeadline = 0;
  let timerHandle: number | null = null;
  let frameHandle: number | null = null;

  const scheduleTimer = (activeGeneration: number) => {
    timerHandle = setTimer(() => {
      if (!running || generation !== activeGeneration) return;

      timerHandle = null;
      const tickTime = now();
      do {
        nextDeadline += interval;
      } while (nextDeadline <= tickTime);
      scheduleTimer(activeGeneration);

      if (frameHandle !== null) return;

      frameHandle = requestFrame(() => {
        if (!running || generation !== activeGeneration) return;

        frameHandle = null;
        try {
          invalidate();
        } catch (error) {
          stop();
          throw error;
        }
      });
    }, Math.max(0, nextDeadline - now()));
  };

  const stop = () => {
    if (!running) return;
    running = false;
    generation += 1;
    if (timerHandle !== null) clearTimer(timerHandle);
    if (frameHandle !== null) cancelFrame(frameHandle);
    timerHandle = null;
    frameHandle = null;
  };

  return {
    start() {
      if (running) return;
      running = true;
      generation += 1;
      nextDeadline = now() + interval;
      scheduleTimer(generation);
    },
    stop,
  };
}
