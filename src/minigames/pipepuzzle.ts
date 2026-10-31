import * as THREE from 'three';
import type { Song } from '../audio/sequencer';
import type { Rng } from '../core/rng';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { dirPressed, scorePanel, type Dir } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const ROWS = 5;
const COLS = 5;
const TILE = 1.1;
const GRID_X = 5;
const NEEDED = 3;
const FLOW_TIME = 0.9;
const PIPE = 0xc9c0d8;
const WATER = 0x4fb8f0;

/** Openings as bits, clockwise from the top of the screen. */
const UP = 1;
const RIGHT = 2;
const DOWN = 4;
const LEFT = 8;
const STEP: Record<number, [number, number]> = { [UP]: [-1, 0], [RIGHT]: [0, 1], [DOWN]: [1, 0], [LEFT]: [0, -1] };
const BITS = [UP, RIGHT, DOWN, LEFT];
const DIR_BIT: Record<Dir, number> = { up: UP, right: RIGHT, down: DOWN, left: LEFT };

/** Turns a pipe a quarter clockwise, `n` times. */
const rot = (m: number, n = 1): number => {
  for (let i = 0; i < ((n % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};
const opposite = (b: number) => rot(b, 2);

const repeat = (bar: string, n: number) => Array(n).fill(bar).join(' ');

/** Pipe Puzzle: bubbly plumbing shuffle in C with bells and a walking bass. */
const pipeTheme: Song = {
  name: 'Pipe Puzzle',
  bpm: 124,
  stepsPerBeat: 4,
  tracks: [
    {
      instrument: 'bell',
      volume: 0.2,
      pattern: [
        'C5 . E5 G5 . . E5 . F5 . A5 . G5 . . .',
        'E5 . G5 C6 . . B5 . A5 . G5 . E5 . . .',
        'F5 . A5 C6 . . A5 . G5 . E5 . C5 . D5 .',
        'E5 . D5 . C5 . G4 . C5 - - - . . . .',
      ].join(' '),
    },
    {
      instrument: 'bass',
      volume: 0.4,
      pattern: [
        'C3 . E3 . G3 . E3 . F2 . A2 . C3 . A2 .',
        'C3 . E3 . G3 . E3 . A2 . C3 . E3 . C3 .',
        'F2 . A2 . C3 . A2 . G2 . B2 . D3 . B2 .',
        'C3 . G2 . A2 . B2 . C3 . . . G2 . . .',
      ].join(' '),
    },
    { instrument: 'pluck', volume: 0.14, pattern: repeat('. . G4 . . . G4 . . . A4 . . . A4 .', 2) + ' ' + repeat('. . A4 . . . A4 . . . B4 . . . G4 .', 2) },
    { instrument: 'kick', volume: 0.5, pattern: repeat('x . . . . . x . x . . . . . . .', 4) },
    { instrument: 'snare', volume: 0.18, pattern: repeat('. . . . x . . . . . . . x . . .', 4) },
    { instrument: 'hat', volume: 0.08, pattern: repeat('. . x . . . x . . . x . . . x x', 4) },
  ],
};

interface Puzzle {
  /** Starting openings per cell (scrambled). */
  start: number[][];
  /** The intended route and the openings each cell needs on it. */
  path: { r: number; c: number; mask: number }[];
}

interface Tile {
  group: THREE.Group;
  mat: THREE.MeshToonMaterial;
  mask: number;
  turns: number;
}

interface Team {
  puzzle: number;
  solved: number;
  tiles: Tile[][];
  /** Seconds left of water rushing to the tank after a solve. */
  flowing: number;
  filled: number;
  water: THREE.Mesh;
  x: number;
}

interface Cursor {
  r: number;
  c: number;
  mesh: THREE.Group;
  /** CPU: seconds until its next move or turn. */
  wait: number;
}

/** A winding route from the top-left inlet to the bottom-right outlet. */
function makePath(rng: Rng): [number, number][] {
  let best: [number, number][] = [];
  for (let tries = 0; tries < 40; tries++) {
    const seen = new Set<number>();
    const path: [number, number][] = [];
    let budget = 3000;
    const dfs = (r: number, c: number): boolean => {
      if (--budget < 0) return false;
      seen.add(r * COLS + c);
      path.push([r, c]);
      if (r === ROWS - 1 && c === COLS - 1) return true;
      const order = [...BITS];
      for (let i = order.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (const b of order) {
        const [dr, dc] = STEP[b];
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS || seen.has(nr * COLS + nc)) continue;
        if (dfs(nr, nc)) return true;
      }
      path.pop();
      return false;
    };
    if (!dfs(0, 0)) continue;
    best = path;
    if (path.length >= 9 && path.length <= 15) break;
  }
  return best;
}

function makePuzzle(rng: Rng): Puzzle {
  const route = makePath(rng);
  const toward = (a: [number, number], b: [number, number]) => BITS.find((bit) => a[0] + STEP[bit][0] === b[0] && a[1] + STEP[bit][1] === b[1])!;
  const path = route.map((cell, i) => {
    const into = i === 0 ? LEFT : toward(cell, route[i - 1]);
    const out = i === route.length - 1 ? RIGHT : toward(cell, route[i + 1]);
    return { r: cell[0], c: cell[1], mask: into | out };
  });
  const start: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    start.push([]);
    for (let c = 0; c < COLS; c++) start[r].push(rot(rng.next() < 0.6 ? UP | RIGHT : UP | DOWN, rng.int(0, 3)));
  }
  for (const p of path) start[p.r][p.c] = rot(p.mask, rng.int(0, 3));
  // Never hand out a puzzle that's already solved.
  if (flowFrom(start).done) start[0][0] = rot(start[0][0]);
  return { start, path };
}

/** Follows the water from the inlet: the cells it fills and whether it reaches the outlet. */
function flowFrom(masks: number[][]): { cells: [number, number][]; done: boolean } {
  const cells: [number, number][] = [];
  let r = 0;
  let c = 0;
  let from = LEFT;
  while (cells.length <= ROWS * COLS) {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return { cells, done: r === ROWS - 1 && c === COLS && from === LEFT };
    const m = masks[r][c];
    if (!(m & from)) break;
    cells.push([r, c]);
    const out = m & ~from;
    const [dr, dc] = STEP[out];
    r += dr;
    c += dc;
    from = opposite(out);
  }
  return { cells, done: false };
}

/**
 * 2 vs 2 plumbing race. Both teams get the same scrambled pipe grid: turn the
 * pieces to run water from the tap to your tank. Fill it three times first to win.
 */
class PipePuzzle extends Minigame {
  readonly timeLimit = 75;
  private puzzles: Puzzle[] = [];
  private teams: Team[] = [];
  private cursors = new Map<MinigamePlayer, Cursor>();
  private teamColors: number[] = [];
  private board!: HTMLDivElement;

  private cellPos(team: Team, r: number, c: number): THREE.Vector3 {
    return new THREE.Vector3(team.x + (c - (COLS - 1) / 2) * TILE, 0, (r - (ROWS - 1) / 2) * TILE);
  }

  protected setup(): void {
    arenaBasics(this.scene, [0xa8e0e8, 0xf0fbff], 0x8fd3f0, -0.6);
    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    const ground = toonMesh(new THREE.BoxGeometry(22, 0.5, 11), Palette.grass, { outline: 0.05 });
    ground.position.set(0, -0.45, -0.5);
    this.scene.add(ground);

    for (const t of [0, 1]) {
      const x = (t === 0 ? -1 : 1) * GRID_X;
      const slab = toonMesh(new THREE.BoxGeometry(COLS * TILE + 0.5, 0.3, ROWS * TILE + 0.5), this.teamColors[t], { outline: 0.04 });
      slab.position.set(x, -0.15, 0);
      this.scene.add(slab);
      const pipeMat = toonMesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 12), WATER, { outline: 0.02 });
      // Tap feeding the top-left cell.
      const tapZ = -((ROWS - 1) / 2) * TILE;
      const inlet = pipeMat.clone();
      inlet.rotation.z = Math.PI / 2;
      inlet.scale.y = 0.8;
      inlet.position.set(x - (COLS / 2) * TILE - 0.3, 0.3, tapZ);
      const tap = toonMesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), Palette.peach, { outline: 0.03 });
      tap.position.set(x - (COLS / 2) * TILE - 0.75, 0.45, tapZ);
      const wheel = toonMesh(new THREE.TorusGeometry(0.2, 0.05, 6, 14), Palette.coral, { outline: false });
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(tap.position.x, 0.95, tapZ);
      // Tank at the bottom-right outlet.
      const outZ = ((ROWS - 1) / 2) * TILE;
      const outlet = pipeMat.clone();
      outlet.rotation.z = Math.PI / 2;
      outlet.scale.y = 0.8;
      outlet.material = (outlet.material as THREE.Material).clone();
      (outlet.material as THREE.MeshToonMaterial).color.setHex(PIPE);
      outlet.position.set(x + (COLS / 2) * TILE + 0.25, 0.3, outZ);
      const glass = toonMesh(new THREE.CylinderGeometry(0.55, 0.55, 2, 20, 1, true), 0xe8f6ff, { outline: false, transparent: true, opacity: 0.45 });
      const rim = toonMesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24), this.teamColors[t], { outline: false });
      rim.rotation.x = Math.PI / 2;
      const tankX = x + (COLS / 2) * TILE + 0.95;
      glass.position.set(tankX, 1, outZ - 0.3);
      rim.position.set(tankX, 2, outZ - 0.3);
      const foot = toonMesh(new THREE.CylinderGeometry(0.62, 0.62, 0.15, 20), this.teamColors[t], { outline: 0.03 });
      foot.position.set(tankX, 0.07, outZ - 0.3);
      const water = toonMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), WATER, { outline: false, transparent: true, opacity: 0.85 });
      water.position.set(tankX, 0.15, outZ - 0.3);
      water.scale.y = 0.001;
      this.scene.add(inlet, tap, wheel, outlet, foot, water, glass, rim);
      this.teams.push({ puzzle: 0, solved: 0, tiles: [], flowing: 0, filled: 0, water, x });
    }

    for (const t of [0, 1]) {
      const team = this.teams[t];
      this.loadPuzzle(team);
      this.players
        .filter((p) => p.team === t)
        .forEach((p, i) => {
          p.character.position.set(team.x + (i === 0 ? -1.2 : 1.2), 0, -((ROWS + 1) / 2) * TILE - 0.6);
          p.character.rotation.y = 0;
          const mesh = new THREE.Group();
          const s = TILE * (i === 0 ? 0.98 : 0.84);
          const bar = (w: number, d: number, bx: number, bz: number) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshBasicMaterial({ color: p.character.def.colors.accent }));
            m.position.set(bx, 0, bz);
            mesh.add(m);
          };
          bar(s, 0.1, 0, -s / 2);
          bar(s, 0.1, 0, s / 2);
          bar(0.1, s, -s / 2, 0);
          bar(0.1, s, s / 2, 0);
          this.scene.add(mesh);
          const cur: Cursor = { r: i === 0 ? 0 : ROWS - 1, c: i === 0 ? 0 : COLS - 1, mesh, wait: 0.4 };
          this.cursors.set(p, cur);
          this.placeCursor(p, cur);
        });
    }

    this.camera.position.set(0, 15, 8.5);
    this.camera.lookAt(0, 0, 0.4);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private puzzleFor(k: number): Puzzle {
    while (this.puzzles.length <= k) this.puzzles.push(makePuzzle(this.game.rng));
    return this.puzzles[k];
  }

  private loadPuzzle(team: Team): void {
    for (const row of team.tiles) for (const tile of row) this.scene.remove(tile.group);
    const pz = this.puzzleFor(team.puzzle);
    team.tiles = pz.start.map((row, r) =>
      row.map((mask, c) => {
        const group = new THREE.Group();
        const base = toonMesh(new THREE.BoxGeometry(TILE * 0.92, 0.16, TILE * 0.92), Palette.cream, { outline: 0.02 });
        base.position.y = 0.08;
        group.add(base);
        const mat = new THREE.MeshToonMaterial({ color: PIPE });
        const hub = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mat);
        hub.position.y = 0.3;
        group.add(hub);
        for (const b of BITS) {
          if (!(mask & b)) continue;
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, TILE / 2, 10), mat);
          const [dr, dc] = STEP[b];
          arm.position.set((dc * TILE) / 4, 0.3, (dr * TILE) / 4);
          if (dc) arm.rotation.z = Math.PI / 2;
          else arm.rotation.x = Math.PI / 2;
          group.add(arm);
        }
        group.position.copy(this.cellPos(team, r, c));
        this.scene.add(group);
        return { group, mat, mask, turns: 0 };
      }),
    );
    this.refreshFlow(team);
  }

  private masks(team: Team): number[][] {
    return team.tiles.map((row) => row.map((t) => t.mask));
  }

  /** Recolors the pipes the water reaches; starts the rush to the tank once it gets there. */
  private refreshFlow(team: Team): void {
    const { cells, done } = flowFrom(this.masks(team));
    const wet = new Set(cells.map(([r, c]) => r * COLS + c));
    team.tiles.forEach((row, r) => row.forEach((t, c) => t.mat.color.setHex(wet.has(r * COLS + c) ? WATER : PIPE)));
    team.filled = cells.length;
    if (done && team.flowing <= 0) {
      team.flowing = FLOW_TIME;
      this.game.audio.play('coin');
    }
  }

  private placeCursor(p: MinigamePlayer, cur: Cursor): void {
    const team = this.teams[p.team];
    cur.mesh.position.copy(this.cellPos(team, cur.r, cur.c)).setY(0.2);
  }

  private renderScore(): void {
    this.board.innerHTML = [0, 1]
      .map((t) => `<span style="color:${css(this.teamColors[t])}">● ${'■'.repeat(this.teams[t].solved)}${'□'.repeat(NEEDED - this.teams[t].solved)}</span>`)
      .join('');
  }

  private turn(p: MinigamePlayer, cur: Cursor, n: number): void {
    const team = this.teams[p.team];
    const tile = team.tiles[cur.r][cur.c];
    tile.mask = rot(tile.mask, n);
    tile.turns += n;
    p.character.pose = 'jump';
    p.data.hop = 0.18;
    this.game.audio.note('pluck', n > 0 ? 'E5' : 'C5', 0.07, 0.22);
    this.refreshFlow(team);
  }

  private move(p: MinigamePlayer, cur: Cursor, d: Dir): void {
    const [dr, dc] = STEP[DIR_BIT[d]];
    cur.r = THREE.MathUtils.clamp(cur.r + dr, 0, ROWS - 1);
    cur.c = THREE.MathUtils.clamp(cur.c + dc, 0, COLS - 1);
    this.placeCursor(p, cur);
  }

  /** CPU: one teammate fixes the route from the tap, the other from the tank. */
  private cpu(p: MinigamePlayer, cur: Cursor, team: Team, dt: number): void {
    cur.wait -= dt;
    if (cur.wait > 0) return;
    const rng = this.game.rng;
    cur.wait = rng.range(0.24, 0.4);
    const wrong = this.puzzleFor(team.puzzle).path.filter((s) => team.tiles[s.r][s.c].mask !== s.mask);
    if (!wrong.length) return;
    const fromEnd = this.players.filter((o) => o.team === p.team).indexOf(p) === 1;
    const target = fromEnd ? wrong[wrong.length - 1] : wrong[0];
    if (cur.r !== target.r) this.move(p, cur, target.r < cur.r ? 'up' : 'down');
    else if (cur.c !== target.c) this.move(p, cur, target.c < cur.c ? 'left' : 'right');
    else {
      // Spot the shortest way round, most of the time.
      const tile = team.tiles[target.r][target.c];
      const ccw = rot(tile.mask, 3) === target.mask && rng.next() < 0.8;
      this.turn(p, cur, ccw ? -1 : 1);
      cur.wait += rng.range(0.05, 0.25);
    }
    if (cur.r === target.r && cur.c === target.c) cur.wait += 0.15;
  }

  play(dt: number): void {
    for (const p of this.players) {
      const team = this.teams[p.team];
      const cur = this.cursors.get(p)!;
      if (team.flowing > 0) continue;
      if (p.controller) {
        const d = dirPressed(p);
        if (d) this.move(p, cur, d);
        if (p.controller.pressed('a')) this.turn(p, cur, 1);
        if (p.controller.pressed('b')) this.turn(p, cur, -1);
      } else this.cpu(p, cur, team, dt);
    }
    for (const team of this.teams) {
      if (team.flowing <= 0) continue;
      team.flowing -= dt;
      if (team.flowing > 0) continue;
      team.solved++;
      this.game.audio.play('star');
      this.renderScore();
      const t = this.teams.indexOf(team);
      for (const p of this.players.filter((o) => o.team === t)) p.character.setExpression('happy');
      if (team.solved >= NEEDED) return this.finish(this.players.filter((o) => o.team === t));
      team.puzzle++;
      this.loadPuzzle(team);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const team of this.teams) {
      for (const row of team.tiles) {
        for (const tile of row) {
          const target = -tile.turns * (Math.PI / 2);
          tile.group.rotation.y += (target - tile.group.rotation.y) * Math.min(1, dt * 18);
        }
      }
      const level = (team.solved + (team.flowing > 0 ? 1 - team.flowing / FLOW_TIME : 0)) / NEEDED;
      const h = Math.max(0.001, level * 1.7);
      team.water.scale.y += (h - team.water.scale.y) * Math.min(1, dt * 8);
      team.water.position.y = 0.15 + team.water.scale.y / 2;
    }
    for (const p of this.players) {
      const hop = (p.data.hop as number | undefined) ?? 0;
      if (hop > 0) {
        p.data.hop = hop - dt;
        if (hop - dt <= 0) p.character.pose = 'idle';
      }
    }
  }

  protected standing(p: MinigamePlayer): number | number[] {
    const t = this.teams[p.team];
    return [t.solved, t.filled];
  }

  timeout(): number[] {
    const [a, b] = this.teams;
    const diff = a.solved - b.solved || a.filled - b.filled;
    if (diff === 0) return [];
    const team = diff > 0 ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

export const pipePuzzle: MinigameDef = {
  id: 'pipepuzzle',
  name: 'Pipe Puzzle',
  kind: '2v2',
  song: pipeTheme,
  rules: 'Turn the pipe pieces to run water from the tap to your tank. Both teams get the same puzzles. Fill your tank three times first to win!',
  controls: 'Stick: move cursor · A: turn right · B: turn left',
  create: () => new PipePuzzle(),
};
