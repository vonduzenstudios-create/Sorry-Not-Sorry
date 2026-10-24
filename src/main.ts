import './ui/style.css';
import { Game } from './core/game';
import { ROSTER } from './characters/roster';
import { BoardScene } from './scenes/board';
import { MinigameTestScene } from './scenes/minigameTest';
import { TitleScene } from './scenes/title';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const game = new Game(canvas, ui);
// Exposed for debugging in the browser console.
(window as unknown as { game: Game }).game = game;
// Dev aids: `?debug=board` jumps into a board game with four CPUs,
// `?debug=minigame&id=<id>` loops a single minigame.
const debug = new URLSearchParams(location.search).get('debug');
if (debug === 'board') {
  game.session.seats = ROSTER.map((d) => ({ characterId: d.id, controller: null }));
  game.scenes.go(new BoardScene());
} else if (debug === 'minigame') {
  game.scenes.go(new MinigameTestScene());
} else {
  game.scenes.go(new TitleScene());
}
game.start();
