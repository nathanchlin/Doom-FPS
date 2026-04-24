/**
 * Hud — thin controller over the DOM elements declared in index.html.
 * Updates numeric readouts and triggers damage-flash / hit-marker animations.
 */
export class Hud {
  private readonly hp: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly enemies: HTMLElement;
  private readonly damage: HTMLElement;
  private readonly hitmarker: HTMLElement;
  private readonly game: HTMLElement;

  constructor() {
    this.hp = mustGet('hp');
    this.ammo = mustGet('ammo');
    this.enemies = mustGet('enemies');
    this.damage = mustGet('damage');
    this.hitmarker = mustGet('hitmarker');
    this.game = mustGet('game');
  }

  setHp(v: number): void {
    this.hp.textContent = String(Math.max(0, Math.floor(v)));
  }
  setAmmo(v: number): void {
    this.ammo.textContent = String(Math.max(0, Math.floor(v)));
  }
  setEnemies(alive: number, total: number): void {
    this.enemies.textContent = `${alive} / ${total}`;
  }

  flashDamage(): void {
    this.damage.classList.add('flash');
    this.game.classList.add('shake');
    setTimeout(() => {
      this.damage.classList.remove('flash');
    }, 120);
    setTimeout(() => {
      this.game.classList.remove('shake');
    }, 160);
  }

  flashHitMarker(): void {
    this.hitmarker.classList.remove('hit');
    // reflow to restart animation
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('hit');
  }

  showGameOver(message: string, onRestart: () => void): void {
    const el = mustGet('gameover');
    mustGet('gameover-sub').textContent = message;
    el.style.display = 'flex';
    const btn = mustGet('gameover-restart') as HTMLButtonElement;
    const handler = () => {
      btn.removeEventListener('click', handler);
      el.style.display = 'none';
      onRestart();
    };
    btn.addEventListener('click', handler);
  }

  showVictory(message: string, onRestart: () => void): void {
    const el = mustGet('victory');
    mustGet('victory-sub').textContent = message;
    el.style.display = 'flex';
    const btn = mustGet('victory-restart') as HTMLButtonElement;
    const handler = () => {
      btn.removeEventListener('click', handler);
      el.style.display = 'none';
      onRestart();
    };
    btn.addEventListener('click', handler);
  }

  hideEndScreens(): void {
    mustGet('gameover').style.display = 'none';
    mustGet('victory').style.display = 'none';
  }
}

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}
