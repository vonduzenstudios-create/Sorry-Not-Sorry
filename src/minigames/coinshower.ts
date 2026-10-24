import * as THREE from 'three';
import { css, Palette } from '../render/palette';
import { makeCoin } from '../render/props';
import { toonMesh } from '../render/toon';
import { arenaBasics } from './arena';
import { face, moveAnim, ring, separate, stick } from './common';
import { Minigame, type MinigameDef, type MinigamePlayer } from './types';

const RADIUS = 7.5;
const SPEED = 6;
const GRAB = 0.9;

interface Drop {
  mesh: THREE.Object3D;
  shadow: THREE.Mesh;
  vy: number;
  /** 1 or 5 for coins, 0 for a spiky bomb. */
  value: number;
  landed: number;
}

/**
 * Coins rain from the sky. Run under them to collect: silver is 1, gold is 5.
 * Spiky balls stun you for a moment. Most coins when time runs out wins.
 */
class CoinShower extends Minigame {
  readonly timeLimit = 30;
  private drops: Drop[] = [];
  private spawn = 0;
  private board!: HTMLDivElement;
  private shadowGeo = new THREE.CircleGeometry(0.45, 16);
  private shadowMat = new THREE.MeshBasicMaterial({ color: Palette.ink, transparent: true, opacity: 0.25 });

  protected setup(): void {
    arenaBasics(this.scene, [0xb8e2ff, 0xfff0a8], 0x9fd8ff);
    const floor = toonMesh(new THREE.CylinderGeometry(RADIUS, RADIUS + 0.3, 0.6, 48), Palette.butter, { outline: 0.06 });
    floor.position.y = -0.3;
    const rim = toonMesh(new THREE.TorusGeometry(RADIUS, 0.2, 8, 48), Palette.peach, { outline: 0.03 });
    rim.rotation.x = Math.PI / 2;
    this.scene.add(floor, rim);
    ring(this.players, 3.5);
    for (const p of this.players) {
      p.data.coins = 0;
      p.data.stun = 0;
    }
    this.camera.position.set(0, 15, 13);
    this.camera.lookAt(0, 0, 0.6);
    this.board = document.createElement('div');
    this.board.className = 'mg-score panel';
    this.overlay.appendChild(this.board);
    this.renderScore();
  }

  private renderScore(): void {
    this.board.innerHTML = this.players
      .map((p) => `<span style="color:${css(p.character.def.colors.accent)}">● ${p.data.coins as number}</span>`)
      .join('');
  }

  private drop(): void {
    const rng = this.game.rng;
    const r = rng.next();
    const value = r < 0.12 ? 0 : r < 0.27 ? 5 : 1;
    let mesh: THREE.Object3D;
    if (value === 0) {
      const ball = toonMesh(new THREE.IcosahedronGeometry(0.45, 0), Palette.ink, { outline: 0.03 });
      for (let i = 0; i < 6; i++) {
        const spike = toonMesh(new THREE.ConeGeometry(0.12, 0.4, 6), Palette.coral, { outline: false });
        const dir = new THREE.Vector3(Math.cos(i), Math.sin(i * 1.7), Math.sin(i)).normalize();
        spike.position.copy(dir).multiplyScalar(0.5);
        spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        ball.add(spike);
      }
      mesh = ball;
    } else {
      mesh = makeCoin(value === 5 ? 0.55 : 0.4);
      if (value === 1) ((mesh as THREE.Mesh).material as THREE.MeshToonMaterial).color.setHex(0xdfe4f0);
    }
    const a = rng.next() * Math.PI * 2;
    const d = Math.sqrt(rng.next()) * (RADIUS - 0.8);
    mesh.position.set(Math.cos(a) * d, 12 + rng.next() * 4, Math.sin(a) * d);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(mesh.position.x, 0.02, mesh.position.z);
    this.scene.add(mesh, shadow);
    this.drops.push({ mesh, shadow, vy: -4, value, landed: 0 });
  }

  private remove(d: Drop): void {
    this.scene.remove(d.mesh, d.shadow);
    this.drops.splice(this.drops.indexOf(d), 1);
  }

  /** CPUs go for the best coin they can reach, and steer clear of spikes. */
  private cpu(p: MinigamePlayer): THREE.Vector3 {
    const pos = p.character.position;
    let best: Drop | null = null;
    let score = -Infinity;
    for (const d of this.drops) {
      if (d.value === 0) continue;
      const dist = Math.hypot(d.mesh.position.x - pos.x, d.mesh.position.z - pos.z);
      // Don't bother racing a rival who is already closer.
      const beaten = this.players.some(
        (o) => o !== p && Math.hypot(d.mesh.position.x - o.character.position.x, d.mesh.position.z - o.character.position.z) < dist - 0.5,
      );
      const s = d.value * 2 - dist - (beaten ? 4 : 0) - Math.max(0, d.mesh.position.y) * 0.15 + Math.sin(p.seat * 3 + d.mesh.position.x) * 0.8;
      if (s > score) {
        score = s;
        best = d;
      }
    }
    const dir = best ? new THREE.Vector3(best.mesh.position.x - pos.x, 0, best.mesh.position.z - pos.z) : new THREE.Vector3(-pos.x, 0, -pos.z);
    for (const d of this.drops) {
      if (d.value !== 0 || d.mesh.position.y > 5) continue;
      const away = new THREE.Vector3(pos.x - d.mesh.position.x, 0, pos.z - d.mesh.position.z);
      const dist = away.length();
      if (dist < 2) dir.addScaledVector(away.normalize(), 6 / Math.max(0.3, dist));
    }
    if (dir.lengthSq() < 0.05) return new THREE.Vector3();
    return dir.normalize().multiplyScalar(0.85);
  }

  play(dt: number): void {
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.drop();
      this.spawn = 0.22;
    }

    for (const p of this.players) {
      const c = p.character;
      const stun = p.data.stun as number;
      if (stun > 0) {
        p.data.stun = stun - dt;
        c.rotation.y += dt * 12;
        c.pose = 'sulk';
        continue;
      }
      const move = p.controller ? stick(p) : this.cpu(p);
      c.position.addScaledVector(move, SPEED * dt);
      const flat = Math.hypot(c.position.x, c.position.z);
      if (flat > RADIUS - 0.5) c.position.multiplyScalar((RADIUS - 0.5) / flat);
      face(p, move, dt);
      moveAnim(p, move.length());
    }
    separate(this.players, 0.45);

    for (const d of [...this.drops]) {
      d.vy -= 9 * dt;
      d.mesh.position.y = Math.max(0.4, d.mesh.position.y + d.vy * dt);
      d.mesh.rotation.y += dt * 4;
      const s = Math.max(0.3, 1 - d.mesh.position.y / 14);
      d.shadow.scale.setScalar(s);
      if (d.mesh.position.y <= 0.4) {
        d.landed += dt;
        // Coins on the ground blink away after a moment.
        d.mesh.visible = d.landed < 1.5 || Math.floor(d.landed * 10) % 2 === 0;
        if (d.landed > 2.2) {
          this.remove(d);
          continue;
        }
      }
      if (d.mesh.position.y > 2.2) continue;
      for (const p of this.players) {
        if ((p.data.stun as number) > 0) continue;
        const dx = p.character.position.x - d.mesh.position.x;
        const dz = p.character.position.z - d.mesh.position.z;
        if (dx * dx + dz * dz > GRAB * GRAB) continue;
        if (d.value === 0) {
          p.data.stun = 1.2;
          p.character.setExpression('surprised');
          this.game.audio.play('boom');
        } else {
          p.data.coins = (p.data.coins as number) + d.value;
          p.character.setExpression('happy');
          this.game.audio.play('coin');
          this.renderScore();
        }
        this.remove(d);
        break;
      }
    }
  }

  timeout(): number[] {
    const best = Math.max(...this.players.map((p) => p.data.coins as number));
    return this.players.filter((p) => p.data.coins === best).map((p) => p.seat);
  }
}

export const coinShower: MinigameDef = {
  id: 'coinshower',
  name: 'Coin Shower',
  kind: 'ffa',
  duel: true,
  rules: 'Coins rain down! Silver is worth 1, gold is worth 5. Dodge the spiky balls. Most coins wins!',
  controls: 'Stick: run',
  create: () => new CoinShower(),
};
