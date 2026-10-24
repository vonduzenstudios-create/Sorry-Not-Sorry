/**
 * Unified controllers. Every device (keyboard or a gamepad) shows up as a
 * Controller with the same buttons and a stick, so scenes never care which
 * one a player is holding. Online guests will send these same snapshots.
 */
export type Button = 'a' | 'b' | 'x' | 'y' | 'l' | 'r' | 'start' | 'up' | 'down' | 'left' | 'right';

export const BUTTONS: readonly Button[] = ['a', 'b', 'x', 'y', 'l', 'r', 'start', 'up', 'down', 'left', 'right'];

export interface ControllerState {
  stickX: number;
  stickY: number;
  buttons: Record<Button, boolean>;
}

function emptyButtons(): Record<Button, boolean> {
  return Object.fromEntries(BUTTONS.map((b) => [b, false])) as Record<Button, boolean>;
}

export class Controller {
  stickX = 0;
  /** Positive is up/forward. */
  stickY = 0;
  private now = emptyButtons();
  private prev = emptyButtons();

  constructor(
    readonly id: string,
    readonly label: string,
  ) {}

  /** Held this frame. */
  down(b: Button): boolean {
    return this.now[b];
  }

  /** Went down this frame. */
  pressed(b: Button): boolean {
    return this.now[b] && !this.prev[b];
  }

  anyPressed(): boolean {
    return BUTTONS.some((b) => this.pressed(b));
  }

  /** Called by Input once per frame with fresh device readings. */
  apply(state: ControllerState): void {
    this.prev = this.now;
    this.now = { ...state.buttons };
    this.stickX = state.stickX;
    this.stickY = state.stickY;
    // D-pad also drives the stick, so menus and movement work either way.
    if (this.now.left) this.stickX = -1;
    if (this.now.right) this.stickX = 1;
    if (this.now.up) this.stickY = 1;
    if (this.now.down) this.stickY = -1;
  }

  snapshot(): ControllerState {
    return { stickX: this.stickX, stickY: this.stickY, buttons: { ...this.now } };
  }
}

const KEYMAP: Record<string, Button> = {
  Space: 'a',
  KeyJ: 'a',
  ShiftLeft: 'b',
  KeyK: 'b',
  KeyU: 'x',
  KeyI: 'y',
  KeyQ: 'l',
  KeyE: 'r',
  Enter: 'start',
  Escape: 'start',
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** Standard Gamepad mapping (Xbox / PlayStation / Switch Pro in browsers). */
const PAD_BUTTONS: [number, Button][] = [
  [0, 'a'],
  [1, 'b'],
  [2, 'x'],
  [3, 'y'],
  [4, 'l'],
  [5, 'r'],
  [6, 'l'],
  [7, 'r'],
  [9, 'start'],
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];

const DEADZONE = 0.22;

function deadzone(v: number): number {
  if (Math.abs(v) < DEADZONE) return 0;
  return Math.sign(v) * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE));
}

export class Input {
  readonly keyboard = new Controller('keyboard', 'Keyboard');
  private keys = new Set<string>();
  /** Keys pressed since the last poll, so a tap shorter than a frame still registers. */
  private tapped = new Set<string>();
  private pads = new Map<number, Controller>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code in KEYMAP) e.preventDefault();
      this.keys.add(e.code);
      this.tapped.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Keyboard first, then gamepads in connection order. */
  get controllers(): Controller[] {
    return [this.keyboard, ...this.pads.values()];
  }

  anyPressed(): boolean {
    return this.controllers.some((c) => c.anyPressed());
  }

  poll(): void {
    const kb = emptyButtons();
    for (const code of [...this.keys, ...this.tapped]) {
      const b = KEYMAP[code];
      if (b) kb[b] = true;
    }
    this.tapped.clear();
    this.keyboard.apply({ stickX: 0, stickY: 0, buttons: kb });

    const seen = new Set<number>();
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad || !pad.connected) continue;
      seen.add(pad.index);
      let c = this.pads.get(pad.index);
      if (!c) {
        c = new Controller(`pad${pad.index}`, `Gamepad ${pad.index + 1}`);
        this.pads.set(pad.index, c);
      }
      const buttons = emptyButtons();
      for (const [i, b] of PAD_BUTTONS) {
        if (pad.buttons[i]?.pressed) buttons[b] = true;
      }
      c.apply({
        stickX: deadzone(pad.axes[0] ?? 0),
        stickY: -deadzone(pad.axes[1] ?? 0),
        buttons,
      });
    }
    for (const index of [...this.pads.keys()]) {
      if (!seen.has(index)) this.pads.delete(index);
    }
  }
}
