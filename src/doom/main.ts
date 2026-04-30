import { Game } from './Game';
import { Input } from '../shared/Input';
import { TouchControls } from './TouchControls';
import { createTouchUI } from './touch-ui';
import type { WeaponType } from './weapons';

let game: Game | null = null;

export function startDoom(container: HTMLElement): void {
  game = new Game(container);

  // Touch controls
  const WEAPON_NAMES: WeaponType[] = ['rifle', 'shotgun', 'sniper'];
  if (Input.isTouchDevice()) {
    const touchUI = createTouchUI();
    const touchControls = new TouchControls(
      game.input,
      touchUI,
      (index: number) => { game!.switchWeapon(WEAPON_NAMES[index]!); },
    );
    game.input.setTouchControls(touchControls);
    game.input.setLockedOverride(true);
  }

  const overlay = document.getElementById('game-overlay')!;
  const startBtn = document.getElementById('game-start') as HTMLButtonElement;

  overlay.style.display = 'flex';
  startBtn.textContent = '点击开始';

  startBtn.addEventListener('click', () => {
    game!.sfx.unlock();
    overlay.style.display = 'none';
    game!.start();
  }, { once: true });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement == null && game) {
      overlay.style.display = 'flex';
      startBtn.textContent = '点击继续';
      startBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
        game!.start();
      }, { once: true });
    } else {
      overlay.style.display = 'none';
    }
  });
}

export function stopDoom(): void {
  if (game) {
    game.dispose();
    game = null;
  }
}
