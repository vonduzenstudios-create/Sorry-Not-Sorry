import * as THREE from 'three';
import type { Character } from '../characters/character';
import type { Ui } from '../ui/ui';
import { css } from '../render/palette';

export interface HudPlayer {
  character: Character;
  coins: number;
  stars: number;
  cpu: boolean;
}

/** Board-game overlay: player panels, turn counter, dialog box, floating labels. */
export class Hud {
  private panels: HTMLDivElement[] = [];
  private turnEl: HTMLDivElement;
  private dialog: HTMLDivElement;
  private labels: { el: HTMLDivElement; target: () => THREE.Vector3 }[] = [];
  private layer: HTMLDivElement;

  constructor(
    ui: Ui,
    private camera: THREE.Camera,
  ) {
    this.turnEl = ui.add('turn-counter panel');
    const corners = ui.add('hud-corners');
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = `hud-player panel corner-${i}`;
      corners.appendChild(el);
      this.panels.push(el);
    }
    this.layer = ui.add('labels');
    this.dialog = ui.add('dialog panel hidden');
  }

  setTurn(turn: number, total: number): void {
    this.turnEl.innerHTML = `Turn <b>${turn}</b> / ${total}`;
  }

  setPlayers(players: HudPlayer[], active: number): void {
    const ranks = rank(players);
    players.forEach((p, i) => {
      const el = this.panels[i];
      el.style.borderColor = css(p.character.def.colors.accent);
      el.classList.toggle('active', i === active);
      el.innerHTML = `
        <div class="rank">${ordinal(ranks[i])}</div>
        <div class="who"><div class="name">${p.character.def.name}${p.cpu ? ' <span class="cpu">CPU</span>' : ''}</div>
        <div class="stats"><span class="star">★ ${p.stars}</span><span class="coin">● ${p.coins}</span></div></div>`;
    });
  }

  say(text: string, speaker?: string): void {
    this.dialog.classList.remove('hidden');
    this.dialog.innerHTML = (speaker ? `<div class="speaker">${speaker}</div>` : '') + `<div class="text">${text}</div>`;
  }

  /** Dialog with selectable options; `selected` is highlighted. */
  choices(text: string, options: string[], selected: number): void {
    this.dialog.classList.remove('hidden');
    this.dialog.innerHTML =
      `<div class="text">${text}</div><div class="options">` +
      options.map((o, i) => `<span class="${i === selected ? 'sel' : ''}">${o}</span>`).join('') +
      '</div>';
  }

  hideDialog(): void {
    this.dialog.classList.add('hidden');
  }

  /** A label that follows a 3D point. Returns a remover. */
  label(className: string, html: string, target: () => THREE.Vector3): { el: HTMLDivElement; remove: () => void } {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = html;
    this.layer.appendChild(el);
    const entry = { el, target };
    this.labels.push(entry);
    this.place(entry);
    return {
      el,
      remove: () => {
        el.remove();
        this.labels = this.labels.filter((l) => l !== entry);
      },
    };
  }

  /** "+3" style popup that floats up and fades out by itself. */
  popup(text: string, at: THREE.Vector3, good: boolean): void {
    const point = at.clone();
    const l = this.label(`popup ${good ? 'good' : 'bad'}`, text, () => point);
    window.setTimeout(l.remove, 1200);
  }

  update(): void {
    for (const l of this.labels) this.place(l);
  }

  private place(l: { el: HTMLDivElement; target: () => THREE.Vector3 }): void {
    const p = l.target().clone().project(this.camera);
    l.el.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
    l.el.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
    l.el.style.display = p.z > 1 ? 'none' : '';
  }
}

/** 1-based rank by stars, then coins; ties share a rank. */
export function rank(players: { stars: number; coins: number }[]): number[] {
  const score = (p: { stars: number; coins: number }) => p.stars * 10000 + p.coins;
  return players.map((p) => 1 + players.filter((o) => score(o) > score(p)).length);
}

export function ordinal(n: number): string {
  return ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`;
}
