import { AudioEngine } from '../audio/engine';
import { Input, type Controller } from '../input/input';
import { STEP, type Lockstep } from '../net/lockstep';
import { Renderer } from '../render/renderer';
import { Ui } from '../ui/ui';
import { Rng } from './rng';
import { SceneManager } from './scene';
import { Session } from './session';

/** Shared services handed to every scene. */
export class Game {
  readonly renderer: Renderer;
  readonly input = new Input();
  readonly audio = new AudioEngine();
  readonly ui: Ui;
  readonly rng = new Rng();
  readonly scenes: SceneManager;
  readonly session = new Session();

  /** Set while playing online; the game then advances in lockstep. */
  net: Lockstep | null = null;
  private peer: { destroy(): void } | null = null;
  private acc = 0;
  private lastPump = 0;
  private lastStep = 0;
  private stepQueued = false;
  /** Online steps run one per task, posted through this channel. */
  private stepChannel = new MessageChannel();
  /** Online: a worker timer keeps the game ticking when the tab is hidden. */
  private clock: Worker | null = null;
  private clockFallback = 0;
  private waitEl: HTMLDivElement | null = null;
  private last = 0;
  /** Dev aid: `?speed=4` runs the game four times faster. */
  private timeScale = Number(new URLSearchParams(location.search).get('speed')) || 1;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.ui = new Ui(uiRoot);
    this.scenes = new SceneManager(this);

    // Browsers only allow audio after a user gesture.
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.stepChannel.port1.onmessage = () => this.runStep();
  }

  start(): void {
    this.last = performance.now();
    this.renderer.three.setAnimationLoop((now) => this.frame(now));
  }

  /**
   * The controllers that steer the game: local devices offline, or one
   * network controller per peer online. Menus read these, never `input`.
   */
  get controllers(): Controller[] {
    return this.net ? this.net.controllers : this.input.controllers;
  }

  private frame(now: number): void {
    const real = (now - this.last) / 1000;
    this.last = now;
    this.input.poll();
    // Any gamepad button counts as a gesture for audio too.
    if (this.input.anyPressed()) this.audio.unlock();
    if (this.net) {
      this.net.capture(this.input.merged());
      this.pump();
    } else {
      // Clamp so a background tab doesn't produce one giant step.
      this.scenes.update(Math.min(real, 1 / 20) * this.timeScale);
    }
    this.renderer.render();
  }

  /**
   * Online: fixed 60 Hz steps, each only once every peer's input for it is
   * in. Called from the render loop, the worker clock and every network
   * message, so a hidden tab (no render loop) keeps pace too.
   *
   * Each step runs in its own task. Turn logic is async code that resumes in
   * microtasks after a step resolves its wait; running two steps back to back
   * in one task would let a peer that is catching up resume that code a frame
   * or more later than everyone else, and the games would drift apart.
   */
  private pump = (): void => {
    const net = this.net;
    if (!net) return;
    const now = performance.now();
    this.acc = Math.min(this.acc + (now - this.lastPump) / 1000, STEP * 10);
    this.lastPump = now;
    // Behind the others (bundles piling up)? Step without waiting for the clock.
    if (!this.stepQueued && net.ready() && (this.acc >= STEP || net.behind())) {
      this.stepQueued = true;
      this.stepChannel.port2.postMessage(0);
    }
    net.watchdog();
    this.showWaiting(!net.ready() && now - this.lastStep > 500);
  };

  private runStep(): void {
    this.stepQueued = false;
    const net = this.net;
    if (!net || !net.ready()) return;
    net.step();
    this.scenes.update(STEP);
    this.acc = Math.max(0, this.acc - STEP);
    this.lastStep = performance.now();
    if (this.net === net) this.pump();
  }

  /** Main-thread timers are throttled to once a second in hidden tabs; worker timers are not. */
  private startClock(): void {
    try {
      const src = 'setInterval(() => postMessage(0), 8);';
      this.clock = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.clock.onmessage = this.pump;
    } catch {
      this.clockFallback = window.setInterval(this.pump, 8);
    }
  }

  private stopClock(): void {
    this.clock?.terminate();
    this.clock = null;
    window.clearInterval(this.clockFallback);
  }

  /** Online desync check: a digest of the RNG, the current scene and whatever state it reports. */
  netHash(): number {
    let h = this.rng.seed ^ 0x9e3779b9;
    const mix = (n: number) => {
      h = Math.imul(h ^ (n | 0), 0x01000193) >>> 0;
    };
    const name = this.scenes.currentName;
    for (let i = 0; i < name.length; i++) mix(name.charCodeAt(i));
    mix(this.scenes.digest());
    return h;
  }

  private showWaiting(on: boolean): void {
    if (on && !this.waitEl) {
      this.waitEl = document.createElement('div');
      this.waitEl.className = 'net-wait panel';
      this.waitEl.textContent = 'Waiting for other players...';
      document.body.appendChild(this.waitEl);
    } else if (!on && this.waitEl) {
      this.waitEl.remove();
      this.waitEl = null;
    }
  }

  goOnline(net: Lockstep, peer: { destroy(): void } | null): void {
    this.net = net;
    this.peer = peer;
    this.acc = 0;
    this.lastPump = this.lastStep = performance.now();
    net.onActivity = this.pump;
    this.startClock();
  }

  /** Leaves an online game (if any) and returns to offline play. */
  leaveOnline(): void {
    this.net?.close();
    this.net = null;
    this.stopClock();
    this.peer?.destroy();
    this.peer = null;
    this.showWaiting(false);
  }

  /** A short message toast that survives scene changes. */
  notify(text: string): void {
    const el = document.createElement('div');
    el.className = 'toast panel';
    el.textContent = text;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 4000);
  }
}
