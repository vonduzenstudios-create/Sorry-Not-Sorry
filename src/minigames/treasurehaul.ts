import * as THREE from 'three';
import { treasureTheme } from '../audio/songs/minigameThemes';
import { css, Palette } from '../render/palette';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, scorePanel, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const HALF_X = 8;
const HALF_Z = 4.6;
const CHEST_X = 6.8;
const SPEED = 5.2;
const CARRY_SPEED = 4.2;
const DASH_SPEED = 11;
const DASH_TIME = 0.25;
const DASH_COOLDOWN = 1.2;
const MAX_GEMS = 5;

interface Gem {
  mesh: THREE.Mesh;
  value: number;
  holder: MinigamePlayer | null;
  /** Can't be picked up again until this runs out (just dropped). */
  cool: number;
}

/**
 * 2 vs 2. Gems wash up in the middle of the beach. Grab one and carry it to
 * your team's chest. Shove a carrier with A to make them drop it. Most gems wins.
 */
class TreasureHaul extends Minigame {
  readonly timeLimit = 35;
  private gems: Gem[] = [];
  private spawn = 0;
  private score = [0, 0];
  private teamColors: number[] = [];
  private chests: THREE.Group[] = [];
  private board!: HTMLDivElement;

  protected setup(): void {
    arenaBasics(this.scene, [0x8fd8ff, 0xfff4d0], 0x5fc8e0, -0.6);
    const sand = toonMesh(new THREE.BoxGeometry(HALF_X * 2 + 1, 1, HALF_Z * 2 + 1), Palette.sand, { outline: 0.05 });
    sand.position.y = -0.5;
    this.scene.add(sand);
    // Palm trees and a few shells around the edge.
    for (const [x, z] of [[-8.8, -5], [8.8, -5], [0, -5.6]]) {
      const trunk = toonMesh(new THREE.CylinderGeometry(0.18, 0.26, 3, 8), 0xc99a6b, { outline: 0.03 });
      trunk.position.set(x, 1.5, z);
      this.scene.add(trunk);
      for (let i = 0; i < 5; i++) {
        const leaf = toonMesh(new THREE.ConeGeometry(0.35, 1.8, 4), Palette.green, { outline: 0.02 });
        leaf.position.set(x, 3, z);
        leaf.rotation.set(Math.PI / 2.4, (i / 5) * Math.PI * 2, 0, 'YXZ');
        this.scene.add(leaf);
      }
    }
    for (let i = 0; i < 8; i++) {
      const shell = toonMesh(new THREE.ConeGeometry(0.15, 0.25, 6), [Palette.rose, Palette.peach][i % 2], { outline: 0.01 });
      shell.position.set(-7 + i * 2, 0.1, HALF_Z - 0.2 - (i % 3) * 0.3);
      this.scene.add(shell);
    }

    this.teamColors = [0, 1].map((t) => this.players.find((p) => p.team === t)!.character.def.colors.accent);
    for (const team of [0, 1]) {
      const side = team === 0 ? -1 : 1;
      const chest = new THREE.Group();
      const box = toonMesh(new THREE.BoxGeometry(1.4, 0.8, 1), 0xa06a40, { outline: 0.04 });
      box.position.y = 0.4;
      const lid = toonMesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 12, 1, false, 0, Math.PI), 0xb87a48, { outline: 0.04 });
      lid.rotation.z = Math.PI / 2;
      lid.position.y = 0.8;
      const band = toonMesh(new THREE.BoxGeometry(1.45, 0.15, 1.05), this.teamColors[team], { outline: 0.02 });
      band.position.y = 0.55;
      chest.add(box, lid, band);
      chest.position.set(side * CHEST_X, 0, 0);
      chest.rotation.y = -side * Math.PI / 2;
      this.scene.add(chest);
      this.chests.push(chest);
      const mat = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), new THREE.MeshBasicMaterial({ color: this.teamColors[team], transparent: true, opacity: 0.35 }));
      mat.rotation.x = -Math.PI / 2;
      mat.position.set(side * CHEST_X, 0.01, 0);
      this.scene.add(mat);
      this.players
        .filter((p) => p.team === team)
        .forEach((p, i) => {
          p.character.position.set(side * (CHEST_X - 1.6), 0, (i - 0.5) * 2.4);
          p.character.rotation.y = -side * Math.PI / 2;
          p.data.carry = null;
          p.data.stun = 0;
          p.data.dash = 0;
          p.data.cool = 0;
        });
    }
    this.camera.position.set(0, 14, 12.5);
    this.camera.lookAt(0, 0, 0.6);
    this.board = scorePanel(this.overlay);
    this.renderScore();
    for (let i = 0; i < 3; i++) this.addGem();
  }

  private renderScore(): void {
    this.board.innerHTML = [0, 1].map((t) => `<span style="color:${css(this.teamColors[t])}">◆ ${this.score[t]}</span>`).join('');
  }

  private addGem(): void {
    const rng = this.game.rng;
    const big = rng.next() < 0.18;
    const mesh = toonMesh(new THREE.OctahedronGeometry(big ? 0.42 : 0.3, 0), big ? Palette.coral : [Palette.sky, Palette.mint, Palette.violet][rng.int(0, 2)], {
      outline: 0.02,
      emissive: 0x222222,
    });
    mesh.position.set(rng.range(-3.5, 3.5), 0.4, rng.range(-HALF_Z + 1, HALF_Z - 1));
    this.scene.add(mesh);
    this.gems.push({ mesh, value: big ? 3 : 1, holder: null, cool: 0 });
  }

  private chestPos(team: number): THREE.Vector3 {
    return new THREE.Vector3(team === 0 ? -CHEST_X : CHEST_X, 0, 0);
  }

  private cpu(p: MinigamePlayer): { dir: THREE.Vector3; dash: boolean } {
    const pos = p.character.position;
    const carry = p.data.carry as Gem | null;
    const to = (v: THREE.Vector3) => v.clone().sub(pos).setY(0);
    if (carry) {
      const dir = to(this.chestPos(p.team));
      // Sidestep a nearby enemy who is charging in.
      for (const o of this.players) {
        if (o.team === p.team) continue;
        const away = pos.clone().sub(o.character.position).setY(0);
        if (away.length() < 1.8) dir.addScaledVector(new THREE.Vector3(-away.z, 0, away.x).normalize(), 1.2);
      }
      return { dir: dir.normalize(), dash: false };
    }
    // Go after an enemy carrier if one's close.
    for (const o of this.players) {
      if (o.team === p.team || !o.data.carry || (o.data.stun as number) > 0) continue;
      const d = to(o.character.position);
      if (d.length() < 4.5) return { dir: d.clone().normalize(), dash: d.length() < 2.4 };
    }
    const mate = this.players.find((o) => o !== p && o.team === p.team);
    let best: Gem | null = null;
    let bestD = Infinity;
    for (const g of this.gems) {
      if (g.holder) continue;
      let d = g.mesh.position.distanceTo(pos) - g.value * 1.2;
      if (mate && mate.data.target === g) d += 4;
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    p.data.target = best;
    if (!best) return { dir: to(new THREE.Vector3(0, 0, 0)).normalize().multiplyScalar(0.5), dash: false };
    return { dir: to(best.mesh.position).normalize().multiplyScalar(0.92), dash: false };
  }

  private drop(p: MinigamePlayer): void {
    const g = p.data.carry as Gem | null;
    if (!g) return;
    g.holder = null;
    g.cool = 0.5;
    g.mesh.position.set(p.character.position.x, 0.4, p.character.position.z);
    p.data.carry = null;
  }

  play(dt: number): void {
    this.spawn -= dt;
    if (this.spawn <= 0 && this.gems.length < MAX_GEMS) {
      this.addGem();
      this.spawn = 1.1;
    }

    for (const p of this.players) {
      const c = p.character;
      p.data.cool = Math.max(0, (p.data.cool as number) - dt);
      if ((p.data.stun as number) > 0) {
        p.data.stun = (p.data.stun as number) - dt;
        c.rotation.y += dt * 12;
        c.pose = 'sulk';
        continue;
      }
      let dir: THREE.Vector3;
      let dash: boolean;
      if (p.controller) {
        dir = stick(p);
        dash = p.controller.pressed('a');
      } else ({ dir, dash } = this.cpu(p));

      if (dash && (p.data.cool as number) <= 0) {
        p.data.dash = DASH_TIME;
        p.data.cool = DASH_COOLDOWN;
        p.data.dashDir = dir.lengthSq() > 0.01 ? dir.clone().normalize() : new THREE.Vector3(Math.sin(c.rotation.y), 0, Math.cos(c.rotation.y));
        this.game.audio.play('jump');
      }
      if ((p.data.dash as number) > 0) {
        p.data.dash = (p.data.dash as number) - dt;
        const dd = p.data.dashDir as THREE.Vector3;
        c.position.addScaledVector(dd, DASH_SPEED * dt);
        face(p, dd, dt);
        moveAnim(p, 1);
        for (const o of this.players) {
          if (o.team === p.team || (o.data.stun as number) > 0) continue;
          if (o.character.position.distanceTo(c.position) < 0.9) {
            o.data.stun = 0.8;
            o.character.setExpression('surprised');
            this.drop(o);
            o.character.position.addScaledVector(dd, 0.7);
            this.game.audio.play('pop');
          }
        }
      } else {
        c.position.addScaledVector(dir, (p.data.carry ? CARRY_SPEED : SPEED) * dt);
        face(p, dir, dt);
        moveAnim(p, dir.length());
      }
      c.position.x = THREE.MathUtils.clamp(c.position.x, -HALF_X + 0.4, HALF_X - 0.4);
      c.position.z = THREE.MathUtils.clamp(c.position.z, -HALF_Z + 0.3, HALF_Z - 0.3);
      // Keep out of the chests themselves.
      for (const ch of this.chests) {
        const away = c.position.clone().sub(ch.position).setY(0);
        if (away.length() < 0.9) c.position.copy(ch.position).addScaledVector(away.normalize(), 0.9);
      }
    }
    separate(this.players, 0.42);

    for (const g of [...this.gems]) {
      g.cool = Math.max(0, g.cool - dt);
      if (g.holder) {
        const h = g.holder;
        g.mesh.position.set(h.character.position.x, 2.1, h.character.position.z);
        if (h.character.position.distanceTo(this.chestPos(h.team)) < 1.5) {
          this.score[h.team] += g.value;
          h.data.carry = null;
          h.character.setExpression('happy');
          this.scene.remove(g.mesh);
          this.gems.splice(this.gems.indexOf(g), 1);
          this.game.audio.play('coin');
          this.renderScore();
        }
        continue;
      }
      if (g.cool > 0) continue;
      for (const p of this.players) {
        if (p.data.carry || (p.data.stun as number) > 0) continue;
        const d = Math.hypot(p.character.position.x - g.mesh.position.x, p.character.position.z - g.mesh.position.z);
        if (d < 0.8) {
          g.holder = p;
          p.data.carry = g;
          this.game.audio.play('select');
          break;
        }
      }
    }
  }

  animate(dt: number): void {
    super.animate(dt);
    for (const g of this.gems) {
      g.mesh.rotation.y += dt * 3;
      if (!g.holder) g.mesh.position.y = 0.45 + Math.sin(this.t * 4 + g.mesh.position.x) * 0.1;
    }
    for (const p of this.players) if (p.data.carry && (p.data.stun as number) <= 0 && p.character.pose === 'idle') p.character.pose = 'jump';
  }

  protected standing(p: MinigamePlayer): number | number[] {
    return this.score[p.team];
  }

  timeout(): number[] {
    if (this.score[0] === this.score[1]) return [];
    const team = this.score[0] > this.score[1] ? 0 : 1;
    return this.players.filter((p) => p.team === team).map((p) => p.seat);
  }
}

export const treasureHaul: MinigameDef = {
  id: 'treasurehaul',
  name: 'Treasure Haul',
  kind: '2v2',
  song: treasureTheme,
  rules: 'Grab gems from the middle of the beach and carry them to your chest. Red gems are worth 3! Shove a carrier with A to make them drop it. Most gems wins!',
  controls: 'Stick: run · A: shove',
  create: () => new TreasureHaul(),
};
