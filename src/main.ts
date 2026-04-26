import './style.css';
import { Game } from './Game';
import { Input } from './Input';
import { createTouchUI } from './touch-ui';
import { TouchControls } from './TouchControls';

const container = document.getElementById('game')!;
const intro = document.getElementById('intro')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const introStartBtn = document.getElementById('intro-start') as HTMLButtonElement;
const modeSelect = document.getElementById('mode-select')!;

const game = new Game(container);

// ─── Mobile touch controls ───
let touchControls: TouchControls | null = null;
const WEAPON_NAMES = ['rifle', 'shotgun', 'sniper'] as const;

if (Input.isTouchDevice()) {
  const touchUI = createTouchUI();
  touchControls = new TouchControls(
    game.input,
    touchUI,
    (index: number) => {
      game.switchWeapon(WEAPON_NAMES[index]);
    },
  );
  game.input.setTouchControls(touchControls);
  game.input.setLockedOverride(true);

  // Adapt start overlay for mobile
  const controlsDiv = overlay.querySelector('.controls');
  if (controlsDiv) {
    controlsDiv.innerHTML = `
      <div>左侧滑动 → 移动</div>
      <div>右侧滑动 → 视角</div>
      <div>右侧按住 → 射击</div>
      <div>右侧上滑 → 跳跃</div>
      <div>[R] → 换弹</div>
      <div>[E] → 交互</div>
      <div>[1][2][3] → 切换武器</div>
    `;
  }
  // Hide pointer lock hint
  const hint = overlay.querySelector('.hint');
  if (hint) (hint as HTMLElement).style.display = 'none';
}

function activateTouchUI(): void {
  const el = document.getElementById('touch-ui');
  if (el) el.classList.add('active');
}

function deactivateTouchUI(): void {
  const el = document.getElementById('touch-ui');
  if (el) el.classList.remove('active');
}

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
    if (Input.isTouchDevice()) {
      activateTouchUI();
    } else {
      game.input.requestPointerLock();
    }
  } else {
    game.start();
    activateTouchUI();
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
  if (Input.isTouchDevice()) return; // No pointer lock management on mobile
  if (document.pointerLockElement == null) {
    deactivateTouchUI();
    const dead = (document.getElementById('gameover') as HTMLElement).style.display === 'flex';
    const mpOver = (document.getElementById('mp-gameover') as HTMLElement).style.display === 'flex';
    if (!dead && !mpOver) {
      overlay.style.display = 'flex';
      startBtn.textContent = '点击继续';
    }
  } else {
    overlay.style.display = 'none';
    activateTouchUI();
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
