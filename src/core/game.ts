import { AudioEngine } from '../audio/engine';
import { Input } from '../input/input';
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

  private last = 0;

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

  private frame(now: number): void {
    // Clamp so a background tab doesn't produce one giant step.
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    this.input.poll();
    // Any gamepad button counts as a gesture for audio too.
    if (this.input.anyPressed()) this.audio.unlock();
    this.scenes.update(dt);
    this.renderer.render();
  }
}
