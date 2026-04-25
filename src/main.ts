import './style.css';
import { Game } from './Game';

const container = document.getElementById('game')!;
const intro = document.getElementById('intro')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const introStartBtn = document.getElementById('intro-start') as HTMLButtonElement;

const game = new Game(container);

// Intro → Start overlay
introStartBtn.addEventListener('click', () => {
  intro.style.display = 'none';
  overlay.style.display = 'flex';
});

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
      startBtn.textContent = '点击继续';
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
