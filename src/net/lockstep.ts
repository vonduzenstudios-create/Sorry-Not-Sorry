import { BUTTONS, Controller, type Button, type ControllerState } from '../input/input';
import type { Link, Message } from './transport';

/** Simulation rate while online. Every peer steps the game with exactly this dt. */
export const STEP = 1 / 60;
/** Frames between sampling local input and simulating it; hides network latency. */
const DELAY = 6;
/** How often peers compare RNG state to catch a desync. */
const HASH_EVERY = 120;
/** A peer silent this long (ms) while others wait on them is treated as gone. */
const TIMEOUT = 10000;

type Packed = [bits: number, sx: number, sy: number];

function pack(s: ControllerState): Packed {
  let bits = 0;
  BUTTONS.forEach((b, i) => {
    if (s.buttons[b]) bits |= 1 << i;
  });
  return [bits, Math.round(s.stickX * 100), Math.round(s.stickY * 100)];
}

function unpack(p: Packed | null): ControllerState {
  const buttons = {} as Record<Button, boolean>;
  BUTTONS.forEach((b, i) => (buttons[b] = p ? (p[0] & (1 << i)) !== 0 : false));
  return { stickX: p ? p[1] / 100 : 0, stickY: p ? p[2] / 100 : 0, buttons };
}

interface Bundle {
  inputs: (Packed | null)[];
  /** Peers that left; applied by everyone on this exact frame. */
  drops: number[];
}

export interface LockstepEvents {
  /** A peer left; their seat should become a CPU. */
  onDrop(peer: number): void;
  /** Guests only: the host went away. */
  onHostLost(): void;
  onDesync(frame: number): void;
}

/**
 * Deterministic lockstep. All peers run the same game from the same seed, and
 * only controller input crosses the network. Each peer samples its local
 * input for frame f + DELAY and sends it to the host; the host gathers every
 * peer's input for a frame into a bundle and broadcasts it. A frame is
 * simulated only once its bundle is known, so every peer sees identical
 * input on identical frames and the games never drift apart.
 */
export class Lockstep {
  /** One controller per peer, driven only by bundles. Index 0 is the host. */
  readonly controllers: Controller[];
  frame = 0;
  private bundles = new Map<number, Bundle>();
  /** Host only: inputs gathered so far, per frame. */
  private gathered = new Map<number, (Packed | undefined)[]>();
  private alive: boolean[];
  private pendingDrops: number[] = [];
  private latch: ControllerState | null = null;
  private hashes = new Map<number, number>();
  private remoteHashes = new Map<number, number[]>();
  closed = false;
  /** performance.now() of the last message from each link. */
  private lastSeen: number[];

  constructor(
    readonly me: number,
    readonly peers: number,
    /** Host: one link per guest (index peer - 1). Guest: one link to the host. */
    private links: Link[],
    names: string[],
    private hash: () => number,
    private events: LockstepEvents,
  ) {
    this.controllers = names.map((n, i) => new Controller(`net${i}`, n));
    this.alive = names.map(() => true);
    this.lastSeen = links.map(() => performance.now());
    if (me === 0) {
      links.forEach((link, i) => {
        const peer = i + 1;
        link.onMessage = (m) => {
          this.lastSeen[i] = performance.now();
          this.hostReceive(peer, m);
        };
        link.onClose = () => this.dropPeer(peer);
      });
    } else {
      links[0].onMessage = (m) => {
        this.lastSeen[0] = performance.now();
        this.guestReceive(m);
      };
      links[0].onClose = () => {
        if (!this.closed) this.events.onHostLost();
      };
    }
  }

  get isHost(): boolean {
    return this.me === 0;
  }

  get local(): Controller {
    return this.controllers[this.me];
  }

  /** Called every render frame: OR together local input until the next sample, so short taps are never lost. */
  capture(state: ControllerState): void {
    if (!this.latch) {
      this.latch = { stickX: state.stickX, stickY: state.stickY, buttons: { ...state.buttons } };
      return;
    }
    for (const b of BUTTONS) this.latch.buttons[b] ||= state.buttons[b];
    if (Math.hypot(state.stickX, state.stickY) > Math.hypot(this.latch.stickX, this.latch.stickY)) {
      this.latch.stickX = state.stickX;
      this.latch.stickY = state.stickY;
    }
  }

  /** True when the next frame's inputs are known. */
  ready(): boolean {
    return this.frame < DELAY || this.bundles.has(this.frame);
  }

  /** How many frames we could simulate right now without waiting. */
  backlog(): number {
    return this.bundles.size;
  }

  /** Applies the current frame's inputs to the controllers and sends our input for a later frame. */
  step(): void {
    const bundle = this.bundles.get(this.frame);
    this.bundles.delete(this.frame);
    this.controllers.forEach((c, i) => c.apply(unpack(bundle?.inputs[i] ?? null)));
    for (const peer of bundle?.drops ?? []) {
      this.alive[peer] = false;
      this.events.onDrop(peer);
    }

    const sample = pack(this.latch ?? unpack(null));
    this.latch = null;
    const target = this.frame + DELAY;
    if (this.isHost) this.gather(0, target, sample);
    else this.links[0].send({ t: 'in', f: target, s: sample });

    if (this.frame % HASH_EVERY === 0) {
      const h = this.hash();
      if (this.isHost) {
        this.hashes.set(this.frame, h);
        this.checkHashes(this.frame);
      } else {
        this.links[0].send({ t: 'h', f: this.frame, h });
      }
    }
    this.frame++;
  }

  /**
   * Called every render frame. A closed tab doesn't always close its data
   * channel promptly, so silence while we are stuck waiting counts as leaving.
   */
  watchdog(): void {
    if (this.closed || this.ready()) return;
    const now = performance.now();
    if (this.isHost) {
      this.lastSeen.forEach((t, i) => {
        if (this.alive[i + 1] && now - t > TIMEOUT) {
          this.links[i].close();
          this.dropPeer(i + 1);
        }
      });
    } else if (now - this.lastSeen[0] > TIMEOUT) {
      this.closed = true;
      this.events.onHostLost();
    }
  }

  close(): void {
    this.closed = true;
    for (const l of this.links) l.close();
  }

  // ---------------------------------------------------------------- host

  private hostReceive(peer: number, m: Message): void {
    if (m.t === 'in') this.gather(peer, m.f as number, m.s as Packed);
    else if (m.t === 'h') {
      const list = this.remoteHashes.get(m.f as number) ?? [];
      list[peer] = m.h as number;
      this.remoteHashes.set(m.f as number, list);
      this.checkHashes(m.f as number);
    }
  }

  private gather(peer: number, f: number, s: Packed): void {
    if (!this.alive[peer]) return;
    const row = this.gathered.get(f) ?? [];
    row[peer] = s;
    this.gathered.set(f, row);
    this.flush();
  }

  /** Sends out every frame, in order, whose inputs are all in. */
  private flush(): void {
    const frames = [...this.gathered.keys()].sort((a, b) => a - b);
    for (const f of frames) {
      const row = this.gathered.get(f)!;
      const complete = this.alive.every((alive, i) => !alive || row[i] !== undefined);
      if (!complete) break;
      const bundle: Bundle = {
        inputs: this.alive.map((alive, i) => (alive ? row[i]! : null)),
        drops: this.pendingDrops.splice(0),
      };
      this.gathered.delete(f);
      this.bundles.set(f, bundle);
      for (let i = 0; i < this.links.length; i++) {
        if (this.alive[i + 1]) this.links[i].send({ t: 'b', f, ...bundle });
      }
    }
  }

  private dropPeer(peer: number): void {
    if (!this.alive[peer] || this.closed) return;
    this.alive[peer] = false;
    this.pendingDrops.push(peer);
    // Frames that were only waiting on them can go out now.
    this.flush();
  }

  private checkHashes(f: number): void {
    const mine = this.hashes.get(f);
    const theirs = this.remoteHashes.get(f);
    if (mine === undefined || !theirs) return;
    if (theirs.some((h, i) => h !== undefined && this.alive[i] && h !== mine)) this.events.onDesync(f);
    if (f < this.frame - HASH_EVERY * 4) {
      this.hashes.delete(f);
      this.remoteHashes.delete(f);
    }
  }

  // ---------------------------------------------------------------- guest

  private guestReceive(m: Message): void {
    if (m.t === 'b') {
      this.bundles.set(m.f as number, { inputs: m.inputs as (Packed | null)[], drops: m.drops as number[] });
      for (const peer of m.drops as number[]) this.alive[peer] = false;
    }
  }
}
