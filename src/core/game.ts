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
  private stalled = 0;
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
      this.netFrame(real);
    } else {
      // Clamp so a background tab doesn't produce one giant step.
      this.scenes.update(Math.min(real, 1 / 20) * this.timeScale);
    }
    this.renderer.render();
  }

  /** Online: fixed 60 Hz steps, each only once every peer's input for it is in. */
  private netFrame(real: number): void {
    const net = this.net!;
    net.capture(this.input.merged());
    this.acc = Math.min(this.acc + real, STEP * 10);
    let steps = 0;
    // Behind the others (bundles piling up)? Run extra steps to catch up.
    while ((this.acc >= STEP || net.backlog() > 8) && steps < 10) {
      if (!net.ready()) break;
      net.step();
      this.scenes.update(STEP);
      this.acc = Math.max(0, this.acc - STEP);
      steps++;
      if (this.net !== net) return;
    }
    net.watchdog();
    this.stalled = net.ready() ? 0 : this.stalled + real;
    this.showWaiting(this.stalled > 0.5);
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
  }

  /** Leaves an online game (if any) and returns to offline play. */
  leaveOnline(): void {
    this.net?.close();
    this.net = null;
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
