import './ui/style.css';
import { Game } from './core/game';
import { ROSTER } from './characters/roster';
import { BoardScene } from './scenes/board';
import { EndingScene } from './scenes/ending';
import { LobbyScene } from './scenes/lobby';
import { MinigameTestScene } from './scenes/minigameTest';
import { TitleScene } from './scenes/title';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const game = new Game(canvas, ui);
// Exposed for debugging in the browser console.
(window as unknown as { game: Game }).game = game;
// Dev aids: `?debug=board` jumps into a board game with four CPUs,
// `?debug=minigame&id=<id>` loops a single minigame, `?debug=ending` shows
// the results with made-up numbers. `&turns=N` shortens a debug board game.
const params = new URLSearchParams(location.search);
const debug = params.get('debug');
if (debug === 'board') {
  game.session.seats = ROSTER.map((d) => ({ characterId: d.id, controller: null }));
  game.session.turns = Number(params.get('turns')) || game.session.turns;
  game.scenes.go(new BoardScene());
} else if (debug === 'ending') {
  game.scenes.go(
    new EndingScene(
      ROSTER.map((d, i) => ({
        characterId: d.id,
        cpu: true,
        stars: [2, 3, 1, 2][i],
        coins: [41, 12, 30, 25][i],
        stats: { minigameCoins: [40, 20, 60, 10][i], minigamesWon: [4, 2, 6, 1][i], maxCoins: [55, 48, 37, 55][i], happenings: [1, 3, 0, 2][i], itemsUsed: [2, 1, 3, 0][i] },
      })),
    ),
  );
} else if (params.get('join')) {
  // Shared invite links land straight in the lobby.
  game.scenes.go(new LobbyScene('guest', params.get('join')!));
} else if (debug === 'minigame') {
  game.scenes.go(new MinigameTestScene());
} else {
  game.scenes.go(new TitleScene());
}
game.start();
