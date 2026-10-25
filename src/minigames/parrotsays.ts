import * as THREE from 'three';
import { parrotTheme } from '../audio/songs/minigameThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { DIRS, dirPressed, fall, knockOut, scorePanel, type Dir } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const START_LEN = 3;
const SHOW_STEP = 0.62;
const NOTES: Record<Dir, string> = { up: 'C6', right: 'E5', down: 'G4', left: 'A5' };
const COLORS: Record<Dir, number> = { up: Palette.green, right: Palette.coral, down: Palette.violet, left: Palette.yellow };
/** Arrow rotation (in the screen plane) and which way a character turns. */
const ROT: Record<Dir, number> = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 };
const FACE: Record<Dir, number> = { up: Math.PI, right: Math.PI / 2, down: 0, left: -Math.PI / 2 };

type Phase = 'show' | 'input' | 'judge';

interface Plan {
  at: number;
  dir: Dir;
}

function arrowMesh(size: number): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(0, size);
  s.lineTo(size * 0.8, 0);
  s.lineTo(size * 0.32, 0);
  s.lineTo(size * 0.32, -size);
  s.lineTo(-size * 0.32, -size);
  s.lineTo(-size * 0.32, 0);
  s.lineTo(-size * 0.8, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: size * 0.25, bevelEnabled: false });
  geo.center();
  const m = toonMesh(geo, Palette.cream, { outline: 0.03 });
  (m.material as THREE.MeshToonMaterial) = (m.material as THREE.MeshToonMaterial).clone();
  return m;
}

/**
 * The parrot squawks a sequence of directions. Repeat it back with the stick!
 * One slip and you're overboard. The tune gets longer every round.
 */
class ParrotSays extends Minigame {
  readonly timeLimit = 75;
  private phase: Phase = 'show';
  private timer = 0;
  private seq: Dir[] = [];
  private shown = -1;
  private parrot = new THREE.Group();
  private wingL!: THREE.Group;
  private wingR!: THREE.Group;
  private bigArrow!: THREE.Mesh;
  private arrows = new Map<MinigamePlayer, THREE.Mesh>();
  private board!: HTMLDivElement;
  private callout!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0x7fc8ff, 0xd8f3ff], 0x4fa8d8, -1);
    // Ship deck.
    const deck = toonMesh(new THREE.BoxGeometry(14, 0.6, 7), 0xc98a5a, { outline: 0.05 });
    deck.position.y = -0.3;
    this.scene.add(deck);
    for (let i = -6; i <= 6; i += 1.2) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 7), new THREE.MeshBasicMaterial({ color: 0xa06a40 }));
      plank.position.set(i, 0.01, 0);
      this.scene.add(plank);
    }
    const mast = toonMesh(new THREE.CylinderGeometry(0.22, 0.28, 9, 12), 0xa06a40, { outline: 0.04 });
    mast.position.set(0, 4.5, -2.8);
    const sail = toonMesh(new THREE.BoxGeometry(5, 3.4, 0.1), Palette.cream, { outline: 0.04 });
    sail.position.set(0, 6.4, -2.6);
    const perch = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), 0x8a5a30, { outline: 0.02 });
    perch.rotation.z = Math.PI / 2;
    perch.position.set(0, 3.6, -2.3);
    this.scene.add(mast, sail, perch);

    this.buildParrot();
    this.parrot.position.set(0, 3.7, -2.3);
    this.scene.add(this.parrot);
    this.bigArrow = arrowMesh(0.8);
    this.bigArrow.position.set(2.2, 4.6, -2.1);
    this.bigArrow.visible = false;
    this.scene.add(this.bigArrow);

    const n = this.players.length;
    this.players.forEach((p, i) => {
      p.character.position.set((i - (n - 1) / 2) * 2.8, 0, 1.6);
      p.character.rotation.y = 0;
      const a = arrowMesh(0.32);
      a.position.set(p.character.position.x, 2.4, 1.6);
      a.visible = false;
      this.scene.add(a);
      this.arrows.set(p, a);
    });

    this.camera.position.set(0, 4.2, 12);
    this.camera.lookAt(0, 2.2, 0);
    this.board = scorePanel(this.overlay);
    this.callout = document.createElement('div');
    this.callout.className = 'mg-callout';
    this.overlay.appendChild(this.callout);
    for (let i = 0; i < START_LEN - 1; i++) this.seq.push(this.game.rng.pick(DIRS));
    this.nextRound();
  }

  private buildParrot(): void {
    const body = toonMesh(new THREE.SphereGeometry(0.45, 20, 14), Palette.coral, { outline: 0.03 });
    body.scale.set(0.9, 1.2, 0.9);
    const belly = toonMesh(new THREE.SphereGeometry(0.3, 16, 12), Palette.yellow, { outline: false });
    belly.position.set(0, -0.05, 0.25);
    belly.scale.set(1, 1.3, 0.6);
    const head = toonMesh(new THREE.SphereGeometry(0.32, 20, 14), Palette.coral, { outline: 0.03 });
    head.position.y = 0.65;
    const beak = toonMesh(new THREE.ConeGeometry(0.12, 0.3, 8), Palette.butter, { outline: 0.02 });
    beak.rotation.x = Math.PI / 2 + 0.4;
    beak.position.set(0, 0.6, 0.32);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: Palette.ink }));
      eye.position.set(s * 0.15, 0.72, 0.25);
      this.parrot.add(eye);
    }
    const tail = toonMesh(new THREE.BoxGeometry(0.3, 0.7, 0.08), Palette.sky, { outline: 0.02 });
    tail.position.set(0, -0.65, -0.25);
    tail.rotation.x = -0.4;
    const makeWing = (side: number) => {
      const g = new THREE.Group();
      const w = toonMesh(new THREE.BoxGeometry(0.12, 0.7, 0.4), Palette.sky, { outline: 0.02 });
      w.position.y = -0.3;
      g.add(w);
      g.position.set(side * 0.42, 0.25, 0);
      return g;
    };
    this.wingL = makeWing(-1);
    this.wingR = makeWing(1);
    this.parrot.add(body, belly, head, beak, tail, this.wingL, this.wingR);
  }

  private say(text: string): void {
    this.callout.textContent = text;
  }

  private nextRound(): void {
    this.seq.push(this.game.rng.pick(DIRS));
    this.phase = 'show';
    this.timer = -0.5;
    this.shown = -1;
    for (const p of this.alive) {
      p.data.idx = 0;
      p.data.failed = false;
      p.character.pose = 'idle';
      p.character.rotation.y = 0;
      p.character.setExpression('determined');
    }
    this.say('');
    this.renderScore();
  }

  private startInput(): void {
    this.phase = 'input';
    this.timer = 0;
    this.bigArrow.visible = false;
    this.say('Your turn!');
    // CPUs plan their whole answer now, slips included.
    for (const p of this.alive) {
      if (p.controller) continue;
      const plan: Plan[] = [];
      let at = 0.35;
      const slip = 0.02 + this.seq.length * 0.012;
      for (const d of this.seq) {
        at += 0.28 + this.game.rng.next() * 0.25;
        const wrong = this.game.rng.next() < slip;
        plan.push({ at, dir: wrong ? DIRS[(DIRS.indexOf(d) + 1 + this.game.rng.int(0, 2)) % 4] : d });
      }
      p.data.plan = plan;
    }
  }

  private get window(): number {
    return 1.6 + this.seq.length * 0.62;
  }

  private renderScore(): void {
    const len = this.seq.length;
    this.board.innerHTML = this.players
      .map((p) => {
        const c = css(p.character.def.colors.accent);
        if (!p.alive) return `<span style="color:${c};opacity:.4">✕</span>`;
        const idx = this.phase === 'input' || this.phase === 'judge' ? (p.data.idx as number) : 0;
        const dots = p.data.failed ? '✕' : '●'.repeat(idx) + '○'.repeat(Math.max(0, len - idx));
        return `<span style="color:${c};font-size:18px">${dots}</span>`;
      })
      .join('');
  }

  private enter(p: MinigamePlayer, d: Dir): void {
    const idx = p.data.idx as number;
    const ok = this.seq[idx] === d;
    const arrow = this.arrows.get(p)!;
    arrow.visible = true;
    arrow.rotation.z = ROT[d];
    (arrow.material as THREE.MeshToonMaterial).color.setHex(ok ? COLORS[d] : 0x555555);
    arrow.userData.life = 0.35;
    p.character.rotation.y = FACE[d];
    if (!ok) {
      p.data.failed = true;
      p.character.pose = 'sulk';
      p.character.setExpression('sad');
      this.game.audio.play('back');
    } else {
      p.data.idx = idx + 1;
      this.game.audio.note('square', NOTES[d], 0.08, 0.12);
      if (idx + 1 === this.seq.length) {
        p.character.pose = 'cheer';
        p.character.setExpression('happy');
        p.character.rotation.y = 0;
      }
    }
  }

  play(dt: number): void {
    this.timer += dt;
    if (this.phase === 'show') {
      const step = Math.floor(this.timer / SHOW_STEP);
      if (step >= this.seq.length) return this.startInput();
      if (step >= 0 && step !== this.shown) {
        this.shown = step;
        if (step === 0) this.say('Watch the parrot!');
        const d = this.seq[step];
        this.bigArrow.visible = true;
        this.bigArrow.rotation.z = ROT[d];
        (this.bigArrow.material as THREE.MeshToonMaterial).color.setHex(COLORS[d]);
        this.bigArrow.scale.setScalar(1.3);
        this.game.audio.note('pulse', NOTES[d], 0.18, 0.22);
      }
      // Blank the arrow between steps so repeats read as two.
      if (step >= 0) this.bigArrow.visible = this.timer - step * SHOW_STEP < SHOW_STEP * 0.75;
      return;
    }

    if (this.phase === 'input') {
      const len = this.seq.length;
      for (const p of this.alive) {
        if (p.data.failed || (p.data.idx as number) >= len) continue;
        let d: Dir | null = null;
        if (p.controller) d = dirPressed(p);
        else {
          const next = (p.data.plan as Plan[])[p.data.idx as number];
          if (this.timer >= next.at) d = next.dir;
        }
        if (d) this.enter(p, d);
      }
      this.renderScore();
      const done = this.alive.every((p) => p.data.failed || (p.data.idx as number) >= len);
      if (done || this.timer >= this.window) this.judge();
      return;
    }

    if (this.timer > 1.6) {
      if (this.alive.length <= 1 || this.seq.length >= 12) this.finish(this.alive);
      else this.nextRound();
    }
  }

  private judge(): void {
    this.phase = 'judge';
    this.timer = 0;
    const len = this.seq.length;
    const losers = this.alive.filter((p) => p.data.failed || (p.data.idx as number) < len);
    if (losers.length === this.alive.length) {
      this.say('Everybody slipped! Again!');
      return;
    }
    if (losers.length === 0) this.say('Squawk! Not bad!');
    else this.say(`${losers.map((p) => p.character.def.name).join(' & ')} overboard!`);
    for (const p of losers) {
      knockOut(p, new THREE.Vector3(0, 2, 4));
      this.arrows.get(p)!.visible = false;
    }
    if (losers.length) this.game.audio.play('boom');
    this.renderScore();
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const p of this.players) if (!p.alive) fall(p, dt, -8);
    for (const a of this.arrows.values()) {
      a.userData.life = ((a.userData.life as number | undefined) ?? 0) - dt;
      if ((a.userData.life as number) < 0) a.visible = false;
    }
    this.bigArrow.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 10));
    // Flap toward the direction being called.
    const d = this.phase === 'show' && this.shown >= 0 ? this.seq[this.shown] : null;
    const flap = Math.sin(this.t * 20) * 0.2;
    this.wingL.rotation.z = d === 'left' || d === 'up' ? -2.4 + flap : -0.1;
    this.wingR.rotation.z = d === 'right' || d === 'up' ? 2.4 - flap : 0.1;
    this.parrot.rotation.x = d === 'down' ? 0.4 : 0;
    this.parrot.position.y = 3.7 + Math.abs(Math.sin(this.t * 3)) * 0.05;
  }

  protected finish(winners: MinigamePlayer[]): void {
    this.callout.textContent = '';
    super.finish(winners);
  }

  timeout(): number[] {
    this.callout.textContent = '';
    return this.alive.map((p) => p.seat);
  }
}

export const parrotSays: MinigameDef = {
  id: 'parrotsays',
  name: 'Parrot Says',
  kind: 'ffa',
  duel: true,
  song: parrotTheme,
  rules: 'Watch the parrot point out a sequence, then repeat it with the stick. One slip and you walk the plank! Last one standing wins.',
  controls: 'Stick / d-pad: repeat the arrows',
  create: () => new ParrotSays(),
};
