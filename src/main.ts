import './ui/style.css';
import { Game } from './core/game';
import { TitleScene } from './scenes/title';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

const game = new Game(canvas, ui);
game.scenes.go(new TitleScene());
game.start();
