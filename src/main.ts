import './style.css';
import { Game } from './Game';

const container = document.getElementById('game')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;

const game = new Game(container);

startBtn.addEventListener('click', () => {
  game.sfx.unlock();
  overlay.style.display = 'none';
  game.start();
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement == null) {
    const dead = (document.getElementById('gameover') as HTMLElement).style.display === 'flex';
    if (!dead) {
      overlay.style.display = 'flex';
      startBtn.textContent = 'CLICK TO RESUME';
    }
  } else {
    overlay.style.display = 'none';
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
