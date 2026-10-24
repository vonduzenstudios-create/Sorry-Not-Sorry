import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toonMesh } from '../render/toon';
import { Face, type Expression } from './face';
import type { CharacterDef } from './roster';

export type Pose = 'idle' | 'walk' | 'jump' | 'cheer' | 'sulk' | 'wave';

/** Attachment points a roster entry decorates with hair, hoods, antennas... */
export interface Rig {
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

const HIP_Y = 0.55;
const HEAD_R = 0.42;

/**
 * A chunky chibi character built from primitives and animated procedurally.
 * Facing is +Z. Call `update(dt)` every frame and set `pose` / `moveSpeed`.
 */
export class Character extends THREE.Group {
  readonly def: CharacterDef;
  readonly rig: Rig;
  readonly face: Face;
  pose: Pose = 'idle';
  /** 0..1, drives walk cycle speed and stride. */
  moveSpeed = 1;
  private t = Math.random() * 10;
  private phase = 0;
  private landSquash = 0;

  constructor(def: CharacterDef) {
    super();
    this.def = def;
    this.name = def.name;
    this.face = new Face(def.face);
    this.rig = def.robot ? this.buildRobot() : this.buildHuman();
    def.decorate?.(this.rig, def);
    this.add(this.rig.body);
  }

  setExpression(e: Expression): void {
    this.face.set(e);
  }

  /** Brief squash when landing from a jump. */
  land(): void {
    this.landSquash = 1;
  }

  private buildHuman(): Rig {
    const d = this.def;
    const body = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = HIP_Y;
    body.add(hips);

    const legL = this.leg(-0.15, d.colors.bottom, d.colors.shoes);
    const legR = this.leg(0.15, d.colors.bottom, d.colors.shoes);
    hips.add(legL, legR);

    const torso = new THREE.Group();
    hips.add(torso);
    const chest = toonMesh(new THREE.CapsuleGeometry(0.28, 0.28, 6, 16), d.colors.top);
    chest.position.y = 0.32;
    chest.scale.set(1.08, 1, 0.9);
    torso.add(chest);

    const armL = this.arm(-0.34, d.colors.sleeves ?? d.colors.top, d.colors.skin);
    const armR = this.arm(0.34, d.colors.sleeves ?? d.colors.top, d.colors.skin);
    torso.add(armL, armR);

    const head = new THREE.Group();
    head.position.y = 0.72;
    torso.add(head);
    const skull = toonMesh(new THREE.SphereGeometry(HEAD_R, 32, 20), d.colors.skin);
    skull.position.y = 0.38;
    head.add(skull);
    const facePatch = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_R * 1.012, 32, 16, Math.PI / 2 - 0.8, 1.6, Math.PI / 2 - 0.75, 1.5),
      new THREE.MeshBasicMaterial({ map: this.face.texture, transparent: true, depthWrite: false }),
    );
    facePatch.position.y = 0.38;
    head.add(facePatch);
    for (const side of [-1, 1]) {
      const ear = toonMesh(new THREE.SphereGeometry(0.09, 12, 8), d.colors.skin, { outline: 0.02 });
      ear.position.set(side * HEAD_R * 0.98, 0.36, 0);
      ear.scale.set(0.6, 1, 0.8);
      head.add(ear);
    }

    return { body, hips, torso, head, armL, armR, legL, legR };
  }

  private buildRobot(): Rig {
    const d = this.def;
    const metal = d.colors.bottom;
    const body = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = HIP_Y;
    body.add(hips);

    const legs = [-0.16, 0.16].map((x) => {
      const pivot = new THREE.Group();
      pivot.position.x = x;
      const shin = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 16), metal, { outline: 0.02 });
      shin.position.y = -0.22;
      const foot = toonMesh(new RoundedBoxGeometry(0.24, 0.14, 0.32, 3, 0.06), d.colors.shoes, { outline: 0.025 });
      foot.position.set(0, -0.47, 0.04);
      pivot.add(shin, foot);
      return pivot;
    });
    hips.add(...legs);

    const torso = new THREE.Group();
    hips.add(torso);
    const chest = toonMesh(new RoundedBoxGeometry(0.7, 0.6, 0.5, 4, 0.14), d.colors.top);
    chest.position.y = 0.3;
    torso.add(chest);
    const panel = toonMesh(new THREE.CircleGeometry(0.11, 24), d.colors.accent, { outline: false, emissive: 0x332200 });
    panel.position.set(0, 0.34, 0.252);
    torso.add(panel);

    const arms = [-0.42, 0.42].map((x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.48, 0);
      const shoulder = toonMesh(new THREE.SphereGeometry(0.1, 16, 12), metal, { outline: 0.02 });
      const limb = toonMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 12), metal, { outline: 0.02 });
      limb.position.y = -0.2;
      const hand = toonMesh(new THREE.SphereGeometry(0.11, 16, 12), d.colors.top, { outline: 0.025 });
      hand.position.y = -0.4;
      pivot.add(shoulder, limb, hand);
      return pivot;
    });
    torso.add(...arms);

    const head = new THREE.Group();
    head.position.y = 0.66;
    torso.add(head);
    const neck = toonMesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 12), metal, { outline: 0.02 });
    neck.position.y = 0.04;
    const shell = toonMesh(new RoundedBoxGeometry(0.86, 0.7, 0.64, 4, 0.18), d.colors.top);
    shell.position.y = 0.42;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.56),
      new THREE.MeshBasicMaterial({ map: this.face.texture, transparent: true }),
    );
    screen.position.set(0, 0.42, 0.322);
    head.add(neck, shell, screen);

    return { body, hips, torso, head, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1] };
  }

  private leg(x: number, pants: number, shoes: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.x = x;
    const limb = toonMesh(new THREE.CapsuleGeometry(0.11, 0.22, 4, 12), pants, { outline: 0.025 });
    limb.position.y = -0.2;
    const shoe = toonMesh(new THREE.SphereGeometry(0.14, 16, 12), shoes, { outline: 0.025 });
    shoe.scale.set(0.95, 0.6, 1.35);
    shoe.position.set(0, -0.44, 0.05);
    pivot.add(limb, shoe);
    return pivot;
  }

  private arm(x: number, sleeve: number, skin: number): THREE.Group {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.5, 0);
    const limb = toonMesh(new THREE.CapsuleGeometry(0.085, 0.24, 4, 12), sleeve, { outline: 0.022 });
    limb.position.y = -0.18;
    const hand = toonMesh(new THREE.SphereGeometry(0.1, 16, 12), skin, { outline: 0.022 });
    hand.position.y = -0.4;
    pivot.add(limb, hand);
    return pivot;
  }

  update(dt: number): void {
    this.t += dt;
    this.face.update(dt);
    const r = this.rig;
    const t = this.t;
    const ease = 1 - Math.exp(-dt * 14);
    const lerp = (obj: THREE.Object3D, key: 'x' | 'y' | 'z', target: number) => {
      obj.rotation[key] += (target - obj.rotation[key]) * ease;
    };

    let bodyY = 0;
    let lean = 0;
    let headPitch = 0;
    let armRaiseL = 0.12;
    let armRaiseR = 0.12;
    let armSwing = 0;
    let legSwing = 0;
    let squash = 0;

    switch (this.pose) {
      case 'idle':
        bodyY = Math.sin(t * 2.2) * 0.015;
        squash = Math.sin(t * 2.2) * 0.015;
        armRaiseL = armRaiseR = 0.12 + Math.sin(t * 2.2) * 0.03;
        break;
      case 'walk': {
        const s = Math.max(0.2, this.moveSpeed);
        this.phase += dt * (6 + 6 * s);
        legSwing = Math.sin(this.phase) * 0.75 * s;
        armSwing = -legSwing * 0.8;
        bodyY = Math.abs(Math.sin(this.phase)) * 0.07 * s;
        lean = 0.12 * s;
        break;
      }
      case 'jump':
        armRaiseL = armRaiseR = 2.5;
        legSwing = 0.35;
        squash = -0.06;
        break;
      case 'cheer': {
        const hop = Math.max(0, Math.sin(t * 9));
        bodyY = hop * 0.25;
        armRaiseL = 2.6 + Math.sin(t * 18) * 0.25;
        armRaiseR = 2.6 - Math.sin(t * 18) * 0.25;
        squash = hop > 0.05 ? -0.04 : 0.06;
        headPitch = -0.15;
        break;
      }
      case 'sulk':
        headPitch = 0.45;
        lean = 0.18;
        armRaiseL = armRaiseR = 0.02;
        bodyY = -0.04 + Math.sin(t * 1.2) * 0.01;
        squash = 0.05;
        break;
      case 'wave':
        armRaiseL = 0.12;
        armRaiseR = 2.4 + Math.sin(t * 10) * 0.35;
        bodyY = Math.sin(t * 2.2) * 0.015;
        break;
    }

    this.landSquash = Math.max(0, this.landSquash - dt * 5);
    squash += this.landSquash * 0.18;

    r.body.position.y += (bodyY - r.body.position.y) * (this.pose === 'cheer' ? 1 : ease);
    r.body.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    lerp(r.torso, 'x', lean);
    lerp(r.head, 'x', headPitch);
    lerp(r.armL, 'z', -armRaiseL);
    lerp(r.armR, 'z', armRaiseR);
    lerp(r.armL, 'x', armSwing);
    lerp(r.armR, 'x', -armSwing);
    lerp(r.legL, 'x', legSwing);
    lerp(r.legR, 'x', this.pose === 'jump' ? -0.2 : -legSwing);
  }
}
