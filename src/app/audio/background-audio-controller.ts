export type BackgroundAudioState = "paused" | "playing" | "blocked" | "error";

export interface AudioPort {
  loop: boolean;
  preload: string;
  volume: number;
  play(): Promise<void>;
  pause(): void;
}

export const BACKGROUND_AUDIO_VOLUME = 0.5;

type RetryEventType = "pointerdown" | "pointerup" | "keydown" | "touchstart" | "touchend" | "click";
type RetryListener = () => void;

export interface RetryTarget {
  addEventListener(type: RetryEventType, listener: RetryListener): void;
  removeEventListener(type: RetryEventType, listener: RetryListener): void;
}

export class BackgroundAudioController {
  private state: BackgroundAudioState = "paused";
  private pendingAttempt: Promise<void> | null = null;
  private attemptVersion = 0;
  private disposed = false;
  private retryArmed = false;
  private userPaused = false;
  private readonly retryListener = () => {
    if (this.disposed || this.userPaused || !this.retryArmed) {
      return;
    }

    this.disarmRetry();
    void this.attemptPlayback("automatic");
  };

  constructor(
    private readonly audio: AudioPort,
    private readonly target: RetryTarget,
    private readonly onState: (state: BackgroundAudioState) => void,
  ) {
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = BACKGROUND_AUDIO_VOLUME;
  }

  start(): Promise<void> {
    if (this.disposed || this.userPaused || this.state === "playing") {
      return Promise.resolve();
    }

    this.disarmRetry();
    return this.attemptPlayback("automatic");
  }

  toggle(): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }

    if (this.state === "playing") {
      this.userPaused = true;
      this.attemptVersion += 1;
      this.disarmRetry();
      this.audio.pause();
      this.emit("paused");
      return Promise.resolve();
    }

    this.userPaused = false;
    this.disarmRetry();
    return this.attemptPlayback("manual");
  }

  fail() {
    if (this.disposed) {
      return;
    }

    this.attemptVersion += 1;
    this.pendingAttempt = null;
    this.disarmRetry();
    this.audio.pause();
    this.emit("error");
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.attemptVersion += 1;
    this.pendingAttempt = null;
    this.disarmRetry();
    this.audio.pause();
  }

  private attemptPlayback(kind: "automatic" | "manual"): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }

    if (this.pendingAttempt) {
      return this.pendingAttempt;
    }

    const version = this.attemptVersion;
    let attempt: Promise<void>;

    try {
      attempt = this.audio.play();
    } catch (error) {
      attempt = Promise.reject(error);
    }

    let transition!: Promise<void>;
    transition = attempt.then(
      () => this.finishAttempt(transition, version, kind, true),
      () => this.finishAttempt(transition, version, kind, false),
    );
    this.pendingAttempt = transition;
    return transition;
  }

  private finishAttempt(
    attempt: Promise<void>,
    version: number,
    kind: "automatic" | "manual",
    succeeded: boolean,
  ) {
    if (this.pendingAttempt === attempt) {
      this.pendingAttempt = null;
    }

    if (this.disposed || version !== this.attemptVersion) {
      return;
    }

    if (succeeded) {
      this.disarmRetry();
      this.emit("playing");
      return;
    }

    if (kind === "manual") {
      this.disarmRetry();
      this.emit("error");
      return;
    }

    this.emit("blocked");
    this.armRetry();
  }

  private armRetry() {
    if (this.disposed || this.userPaused || this.retryArmed) {
      return;
    }

    this.retryArmed = true;
    this.addRetryListener("pointerdown");
    this.addRetryListener("pointerup");
    this.addRetryListener("keydown");
    this.addRetryListener("touchstart");
    this.addRetryListener("touchend");
    this.addRetryListener("click");
  }

  private disarmRetry() {
    if (!this.retryArmed) {
      return;
    }

    this.retryArmed = false;
    this.removeRetryListener("pointerdown");
    this.removeRetryListener("pointerup");
    this.removeRetryListener("keydown");
    this.removeRetryListener("touchstart");
    this.removeRetryListener("touchend");
    this.removeRetryListener("click");
  }

  private addRetryListener(type: RetryEventType) {
    try {
      this.target.addEventListener(type, this.retryListener);
    } catch {
      // Retry hooks are best-effort; controller state remains authoritative.
    }
  }

  private removeRetryListener(type: RetryEventType) {
    try {
      this.target.removeEventListener(type, this.retryListener);
    } catch {
      // A stale listener is inert while retryArmed is false.
    }
  }

  private emit(state: BackgroundAudioState) {
    this.state = state;
    try {
      this.onState(state);
    } catch {
      // State observers cannot break playback policy transitions.
    }
  }
}

export function createBackgroundAudioController(
  audio: AudioPort,
  target: RetryTarget,
  onState: (state: BackgroundAudioState) => void,
) {
  return new BackgroundAudioController(audio, target, onState);
}
