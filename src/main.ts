import './style.css';
import { Game } from './Game';

const container = document.getElementById('game')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;

const game = new Game(container);

// First click: unlock audio + pointer lock + hide start overlay
startBtn.addEventListener('click', () => {
  game.sfx.unlock();
  overlay.style.display = 'none';
  game.start();
});

// Re-show overlay if user releases pointer lock mid-game (ESC)
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement == null) {
    const dead = (document.getElementById('gameover') as HTMLElement).style.display === 'flex';
    const won = (document.getElementById('victory') as HTMLElement).style.display === 'flex';
    if (!dead && !won) {
      overlay.style.display = 'flex';
      startBtn.textContent = 'CLICK TO RESUME';
    }
  } else {
    overlay.style.display = 'none';
  }
});

// HMR cleanup — otherwise renderer canvases stack up during dev
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
