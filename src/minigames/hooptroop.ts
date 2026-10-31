import * as THREE from 'three';
import { hoopTheme } from '../audio/songs/minigameThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { scorePanel } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HOOP_X = 4.2;
const HOOP_Z = -4.5;
const RIM_Y = 3.1;
const ZONE = 0.78;
const METER_H = 1.6;
const FLIGHT = 0.85;

interface Shot {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  make: boolean;
  /** Where a miss caroms off to. */
  bounce: THREE.Vector3;
}

interface Shooter {
  ball: THREE.Mesh;
  marker: THREE.Mesh;
  zone: THREE.Mesh;
  /** Seconds since this aim started. */
  aim: number;
  speed: number;
  streak: number;
  shot: Shot | null;
  rest: number;
  /** CPU: shoots once the meter rises past this. */
  cpuAt: number;
}

/** Meter level 0..1..0, bouncing. */
const tri = (x: number) => 1 - Math.abs(((x % 2) + 2) % 2 - 1);

/**
 * 2 vs 2 free throws. Press A when the bouncing meter is in the green to sink
 * it. Every basket makes your next one harder. Most baskets for the team wins.
 */
class HoopTroop extends Minigame {
  readonly timeLimit = 30;
  private score = [0, 0];
  private teamColors: number[] = [];
  private shooters = new Map<MinigamePlayer, Shooter>();
  private nets: THREE.Mesh[] = [];
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0xffc8a8, 0xfff0e0], 0xe8a878, -0.05);
    const court = toonMesh(new THREE.BoxGeometry(16, 0.3, 11), 0xe8b880, { outline: 0.05 });
    court.position.set(0, -0.15, -1);
    this.scene.add(court);
    const center = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 11), new THREE.MeshBasicMaterial({ color: Palette.cream }));
    center.rotation.x = -Math.PI / 2;
    center.position.set(0, 0.01, -1);
    this.scene.add(center);
    // Bleachers behind.
    for (let i = 0; i < 3; i++) {
      const step = toonMesh(new THREE.BoxGeometry(18, 0.6, 1), [Palette.sky, Palette.lavender, Palette.rose][i], { outline: 0.03 });
      step.position.set(0, 0.3 + i * 0.6, -8 - i);
      this.scene.add(step);
    }

    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    for (const team of [0, 1]) {
      const hx = team === 0 ? -HOOP_X : HOOP_X;
      const pole = toonMesh(new THREE.CylinderGeometry(0.1, 0.1, RIM_Y + 0.8, 10), Palette.ink, { outline: false });
      pole.position.set(hx, (RIM_Y + 0.8) / 2, HOOP_Z - 1.1);
      const board = toonMesh(new THREE.BoxGeometry(2, 1.3, 0.1), Palette.cream, { outline: 0.03 });
      board.position.set(hx, RIM_Y + 0.5, HOOP_Z - 0.75);
      const square = toonMesh(new THREE.BoxGeometry(0.8, 0.6, 0.02), this.teamColors[team], { outline: false });
      square.position.set(hx, RIM_Y + 0.4, HOOP_Z - 0.69);
      const rim = toonMesh(new THREE.TorusGeometry(0.45, 0.05, 8, 24), Palette.coral, { outline: 0.01 });
      rim.rotation.x = Math.PI / 2;
      rim.position.set(hx, RIM_Y, HOOP_Z);
      const net = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.3, 0.6, 12, 2, true),
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.8 }),
      );
      net.position.set(hx, RIM_Y - 0.3, HOOP_Z);
      this.scene.add(pole, board, square, rim, net);
      this.nets.push(net);

      this.players
        .filter((p) => p.team === team)
        .forEach((p, i) => {
          const x = hx + (i === 0 ? -1.1 : 1.1);
          p.character.position.set(x, 0, 1);
          p.character.rotation.y = Math.PI;
          const meter = new THREE.Group();
          const back = toonMesh(new THREE.BoxGeometry(0.22, METER_H, 0.08), Palette.cream, { outline: 0.02 });
          const zone = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1, 0.1), new THREE.MeshBasicMaterial({ color: Palette.green }));
          const marker = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: Palette.ink }));
          meter.add(back, zone, marker);
          meter.position.set(x + (i === 0 ? -0.75 : 0.75), 1.4, 1);
          this.scene.add(meter);
          const ball = toonMesh(new THREE.SphereGeometry(0.22, 16, 12), 0xff9a4a, { outline: 0.02 });
          this.scene.add(ball);
          const s: Shooter = { ball, marker, zone, aim: 0, speed: 0.9 + this.game.rng.next() * 0.15, streak: 0, shot: null, rest: 0, cpuAt: 0 };
          this.shooters.set(p, s);
          this.newAim(p, s);
        });
    }
    this.camera.position.set(0, 6.5, 13.5);
    this.camera.lookAt(0, 2, -1.2);
    this.board = scorePanel(this.overlay);
    this.renderScore();
  }

  private halfWidth(s: Shooter): number {
    return Math.max(0.045, 0.1 - s.streak * 0.012);
  }

  private newAim(p: MinigamePlayer, s: Shooter): void {
    s.aim = 0;
    s.shot = null;
    const hw = this.halfWidth(s);
    s.zone.scale.y = hw * 2 * METER_H;
    s.zone.position.y = (ZONE - 0.5) * METER_H;
    // CPUs aim for the green with a spread a bit wider than it.
    s.cpuAt = ZONE + (this.game.rng.next() * 2 - 1) * (hw + 0.07);
    s.ball.position.copy(this.hand(p));
    p.character.pose = 'idle';
  }

  private hand(p: MinigamePlayer): THREE.Vector3 {
    return p.character.position.clone().add(new THREE.Vector3(0, 1.75, -0.3));
  }

  private renderScore(): void {
    this.board.innerHTML = [0, 1].map((t) => `<span style="color:${css(this.teamColors[t])}">● ${this.score[t]}</span>`).join('');
  }

  private shoot(p: MinigamePlayer, s: Shooter, level: number): void {
    const make = Math.abs(level - ZONE) <= this.halfWidth(s);
    const hx = p.team === 0 ? -HOOP_X : HOOP_X;
    const rim = new THREE.Vector3(hx, RIM_Y + 0.1, HOOP_Z);
    // Short shots clang off the front of the rim, long ones off the back.
    const off = level < ZONE ? 0.5 : -0.5;
    const to = make ? rim : rim.clone().add(new THREE.Vector3(0, 0, off));
    const bounce = make ? new THREE.Vector3(hx, 0.22, HOOP_Z + 0.3) : rim.clone().add(new THREE.Vector3((p.seat % 2 ? 1 : -1) * 2, -2.9, off * 3));
    s.shot = { from: this.hand(p), to, t: 0, make, bounce };
    p.character.pose = 'jump';
    this.game.audio.play('jump');
  }

  play(dt: number): void {
    for (const [p, s] of this.shooters) {
      if (s.shot) {
        const sh = s.shot;
        sh.t += dt;
        if (sh.t < FLIGHT) {
          const k = sh.t / FLIGHT;
          s.ball.position.lerpVectors(sh.from, sh.to, k);
          s.ball.position.y += Math.sin(k * Math.PI) * 2.4;
          if (sh.t + dt >= FLIGHT) {
            if (sh.make) {
              this.score[p.team]++;
              p.data.makes = ((p.data.makes as number | undefined) ?? 0) + 1;
              s.streak++;
              s.speed += 0.1;
              p.character.setExpression('happy');
              this.nets[p.team].scale.y = 1.4;
              this.game.audio.play('coin');
              this.renderScore();
            } else {
              s.streak = Math.max(0, s.streak - 1);
              p.character.setExpression('sad');
              this.game.audio.note('triangle', 'C3', 0.12, 0.3);
            }
          }
        } else {
          const k = Math.min(1, (sh.t - FLIGHT) / 0.45);
          s.ball.position.lerpVectors(sh.to, sh.bounce, k);
          if (!sh.make) s.ball.position.y += Math.sin(k * Math.PI) * 0.8;
          if (k >= 1) {
            s.rest += dt;
            if (s.rest > 0.25) {
              s.rest = 0;
              this.newAim(p, s);
            }
          }
        }
        continue;
      }
      s.aim += dt;
      const level = tri(s.aim * s.speed * 2);
      s.marker.position.y = (level - 0.5) * METER_H;
      const rising = Math.floor(s.aim * s.speed * 2) % 2 === 0;
      const press = p.controller ? p.controller.pressed('a') : rising && level >= s.cpuAt;
      if (press) this.shoot(p, s, level);
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const n of this.nets) n.scale.y += (1 - n.scale.y) * Math.min(1, dt * 6);
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return [this.score[p.team], (p.data.makes as number | undefined) ?? 0];
  }

  timeout(): number[] {
    if (this.score[0] === this.score[1]) return [];
    const team = this.score[0] > this.score[1] ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

export const hoopTroop: MinigameDef = {
  id: 'hooptroop',
  name: 'Hoop Troop',
  kind: '2v2',
  song: hoopTheme,
  rules: 'Press A when the bouncing meter is in the green to sink a basket. Each basket shrinks your green zone. Most baskets for your team wins!',
  controls: 'A: shoot',
  create: () => new HoopTroop(),
};
