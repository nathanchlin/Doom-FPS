/**
 * Hud — manages DOM HUD elements for maze gameplay.
 * Floor, doors, health, ammo, room enemy count, interact prompts,
 * fade transitions, floor announcement.
 */
export class Hud {
  private readonly hp: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly floorEl: HTMLElement;
  private readonly doorsEl: HTMLElement;
  private readonly roomStatus: HTMLElement;
  private readonly roomEnemies: HTMLElement;
  private readonly interactPrompt: HTMLElement;
  private readonly floorTransition: HTMLElement;
  private readonly floorText: HTMLElement;
  private readonly fadeOverlay: HTMLElement;
  private readonly damage: HTMLElement;
  private readonly hitmarker: HTMLElement;
  private readonly game: HTMLElement;

  constructor() {
    this.hp = mustGet('hp');
    this.ammo = mustGet('ammo');
    this.floorEl = mustGet('floor');
    this.doorsEl = mustGet('doors');
    this.roomStatus = mustGet('room-status');
    this.roomEnemies = mustGet('room-enemies');
    this.interactPrompt = mustGet('interact-prompt');
    this.floorTransition = mustGet('floor-transition');
    this.floorText = mustGet('floor-text');
    this.fadeOverlay = mustGet('fade-overlay');
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

  setFloor(floor: number): void {
    this.floorEl.textContent = String(floor);
  }

  setDoors(opened: number, total: number): void {
    this.doorsEl.textContent = `${opened} / ${total}`;
  }

  showRoomStatus(alive: number): void {
    this.roomStatus.style.display = '';
    this.roomEnemies.textContent = alive > 0 ? String(alive) : 'CLEARED';
  }

  hideRoomStatus(): void {
    this.roomStatus.style.display = 'none';
  }

  showInteract(text: string): void {
    this.interactPrompt.textContent = text;
    this.interactPrompt.style.display = '';
  }

  hideInteract(): void {
    this.interactPrompt.style.display = 'none';
  }

  private lootTimer: ReturnType<typeof setTimeout> | null = null;

  /** Show loot pickup notification, auto-hides after 1.5s */
  showLoot(ammo: number, health: number): void {
    const parts: string[] = [];
    if (ammo > 0) parts.push(`AMMO +${ammo}`);
    if (health > 0) parts.push(`HP +${health}`);
    if (parts.length === 0) return;
    this.interactPrompt.textContent = parts.join('  ');
    this.interactPrompt.style.display = '';
    if (this.lootTimer) clearTimeout(this.lootTimer);
    this.lootTimer = setTimeout(() => {
      this.interactPrompt.style.display = 'none';
      this.lootTimer = null;
    }, 1500);
  }

  /** Show floor number announcement (auto-hides after animation) */
  showFloorTransition(floor: number): void {
    this.floorText.textContent = `FLOOR ${floor}`;
    this.floorTransition.style.display = 'flex';
    // Reset animation
    this.floorText.style.animation = 'none';
    void this.floorText.offsetWidth;
    this.floorText.style.animation = '';
    setTimeout(() => {
      this.floorTransition.style.display = 'none';
    }, 1500);
  }

  /** Black fade in/out for room transitions */
  fadeIn(): Promise<void> {
    return new Promise((resolve) => {
      this.fadeOverlay.classList.add('active');
      setTimeout(resolve, 300);
    });
  }

  fadeOut(): Promise<void> {
    return new Promise((resolve) => {
      this.fadeOverlay.classList.remove('active');
      setTimeout(resolve, 300);
    });
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
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('hit');
  }

  showGameOver(stats: { floor: number; kills: number; time: number; doors: number }, onRestart: () => void): void {
    const el = mustGet('gameover');
    const statsEl = mustGet('gameover-stats');
    const minutes = Math.floor(stats.time / 60);
    const seconds = Math.floor(stats.time % 60);
    statsEl.innerHTML = `
      <div><span>FLOOR REACHED</span><span class="stat-value">${stats.floor}</span></div>
      <div><span>KILLS</span><span class="stat-value">${stats.kills}</span></div>
      <div><span>TIME</span><span class="stat-value">${minutes}:${String(seconds).padStart(2, '0')}</span></div>
      <div><span>DOORS OPENED</span><span class="stat-value">${stats.doors}</span></div>
    `;
    mustGet('gameover-sub').textContent = 'The maze claims another.';
    el.style.display = 'flex';
    const btn = mustGet('gameover-restart') as HTMLButtonElement;
    const handler = () => {
      btn.removeEventListener('click', handler);
      el.style.display = 'none';
      onRestart();
    };
    btn.addEventListener('click', handler);
  }

  hideEndScreens(): void {
    mustGet('gameover').style.display = 'none';
  }
}

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}
