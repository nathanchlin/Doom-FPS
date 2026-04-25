import './style.css';
import { Game } from './Game';

const container = document.getElementById('game')!;
const intro = document.getElementById('intro')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const introStartBtn = document.getElementById('intro-start') as HTMLButtonElement;
const modeSelect = document.getElementById('mode-select')!;

const game = new Game(container);

// ─── Intro → Mode Select ───
introStartBtn.addEventListener('click', () => {
  intro.style.display = 'none';
  modeSelect.style.display = 'flex';
});

// ─── Singleplayer ───
document.getElementById('btn-singleplayer')!.addEventListener('click', () => {
  modeSelect.style.display = 'none';
  overlay.style.display = 'flex';
});

startBtn.addEventListener('click', () => {
  game.sfx.unlock();
  overlay.style.display = 'none';
  if (game.isMultiplayer()) {
    // Engine already started by game_start handler, just lock pointer
    game.input.requestPointerLock();
  } else {
    game.start();
  }
});

// ─── Create Room (host connects to localhost) ───
document.getElementById('btn-create-room')!.addEventListener('click', async () => {
  const name = (document.getElementById('player-name') as HTMLInputElement).value || 'Player';
  modeSelect.style.display = 'none';
  try {
    await game.startMultiplayer('ws://localhost:3000', name);
  } catch {
    alert('无法连接到服务器。请确保已运行服务器程序');
    modeSelect.style.display = 'flex';
  }
});

// ─── Join Room ───
document.getElementById('btn-join-room')!.addEventListener('click', async () => {
  const ip = (document.getElementById('join-ip') as HTMLInputElement).value.trim();
  const name = (document.getElementById('player-name') as HTMLInputElement).value || 'Player';
  if (!ip) {
    alert('请输入主机 IP');
    return;
  }
  modeSelect.style.display = 'none';
  try {
    await game.startMultiplayer(`ws://${ip}:3000`, name);
  } catch {
    alert(`无法连接到 ${ip}:3000`);
    modeSelect.style.display = 'flex';
  }
});

// ─── Back to menu (MP game over) ───
document.getElementById('mp-back-menu')!.addEventListener('click', () => {
  window.location.reload();
});

// ─── Pointer lock ───
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement == null) {
    const dead = (document.getElementById('gameover') as HTMLElement).style.display === 'flex';
    const mpOver = (document.getElementById('mp-gameover') as HTMLElement).style.display === 'flex';
    if (!dead && !mpOver) {
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
