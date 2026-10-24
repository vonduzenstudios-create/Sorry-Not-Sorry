import './ui/style.css';
import { Game } from './core/game';
import { ROSTER } from './characters/roster';
import { BoardScene } from './scenes/board';
import { TitleScene } from './scenes/title';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const game = new Game(canvas, ui);
// Exposed for debugging in the browser console.
(window as unknown as { game: Game }).game = game;
// Dev aid: `?debug=board` jumps straight into a board game with four CPUs.
if (new URLSearchParams(location.search).get('debug') === 'board') {
  game.session.seats = ROSTER.map((d) => ({ characterId: d.id, controller: null }));
  game.scenes.go(new BoardScene());
} else {
  game.scenes.go(new TitleScene());
}
game.start();
