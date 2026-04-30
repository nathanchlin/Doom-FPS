import './style.css';

const container = document.getElementById('game')!;
const mainMenu = document.getElementById('main-menu')!;
const backBtn = document.getElementById('back-to-menu')!;

let currentCleanup: (() => void) | null = null;

document.getElementById('btn-doom')!.addEventListener('click', async () => {
  mainMenu.style.display = 'none';
  backBtn.style.display = 'block';
  const { startDoom, stopDoom } = await import('./doom/main');
  currentCleanup = stopDoom;
  startDoom(container);
});

document.getElementById('btn-xianxia')!.addEventListener('click', async () => {
  mainMenu.style.display = 'none';
  backBtn.style.display = 'block';
  const { startXianxia, stopXianxia } = await import('./xianxia/main');
  currentCleanup = stopXianxia;
  startXianxia(container);
});

backBtn.addEventListener('click', () => {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  // Clear game container
  container.innerHTML = '';
  // Hide game overlay
  const overlay = document.getElementById('game-overlay');
  if (overlay) overlay.style.display = 'none';
  // Show menu
  mainMenu.style.display = 'flex';
  backBtn.style.display = 'none';
  // Exit pointer lock
  document.exitPointerLock?.();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (currentCleanup) currentCleanup();
  });
}
