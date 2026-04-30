/**
 * Hud — DOM-based HUD for maze gameplay.
 * Dynamically creates all required elements (no HTML dependency).
 */
export class Hud {
  private readonly root: HTMLElement;
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
  private readonly gameEl: HTMLElement;
  private readonly weaponName: HTMLElement;
  private readonly shieldIndicator: HTMLElement;
  private readonly shieldHits: HTMLElement;
  private readonly gameoverEl: HTMLElement;
  private readonly gameoverStats: HTMLElement;
  private readonly gameoverSub: HTMLElement;
  private readonly gameoverRestart: HTMLButtonElement;

  constructor() {
    this.gameEl = document.getElementById('game')!;

    // Create root HUD container
    this.root = document.createElement('div');
    this.root.id = 'doom-hud';
    this.root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:100;font-family:"Courier New",monospace;color:#fff;';
    document.body.appendChild(this.root);

    this.root.innerHTML = `
      <style>
        #doom-hud .hud-item { position:absolute; text-align:center; }
        #doom-hud .hud-left { bottom:20px; left:20px; }
        #doom-hud .hud-right { bottom:20px; right:20px; }
        #doom-hud .hud-top-left { top:12px; left:20px; }
        #doom-hud .hud-top-right { top:12px; right:20px; }
        #doom-hud .hud-weapon { bottom:20px; left:50%; transform:translateX(-50%); }
        #doom-hud .hud-shield { bottom:60px; left:50%; transform:translateX(-50%); }
        #doom-hud .hud-center-top { top:12px; left:50%; transform:translateX(-50%); }
        #doom-hud .label { font-size:11px; color:#888; text-transform:uppercase; }
        #doom-hud .value { font-size:22px; font-weight:bold; }
        #doom-hud #doom-crosshair {
          position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
          width:20px; height:20px; border:1px solid rgba(255,255,255,0.6);
          border-radius:50%;
        }
        #doom-hud #doom-crosshair::before {
          content:''; position:absolute; top:50%; left:50%;
          width:4px; height:4px; background:#fff; border-radius:50%;
          transform:translate(-50%,-50%);
        }
        #doom-hud #doom-interact-prompt {
          position:fixed; bottom:40%; left:50%; transform:translateX(-50%);
          background:rgba(0,0,0,0.7); padding:8px 20px; border-radius:4px;
          font-size:14px; color:#fff;
        }
        #doom-hud #doom-floor-transition {
          position:fixed; inset:0; display:none; align-items:center; justify-content:center;
          z-index:200; pointer-events:none;
        }
        #doom-hud #doom-floor-text { font-size:36px; color:#fff; animation:doom-floor-fade 1.5s ease-out; }
        @keyframes doom-floor-fade { 0%{opacity:0;transform:scale(0.8)} 20%{opacity:1;transform:scale(1)} 80%{opacity:1} 100%{opacity:0} }
        #doom-hud #doom-fade-overlay {
          position:fixed; inset:0; background:#000; opacity:0;
          transition:opacity 0.3s; pointer-events:none; z-index:150;
        }
        #doom-hud #doom-fade-overlay.active { opacity:1; }
        #doom-hud #doom-damage {
          position:fixed; inset:0; background:radial-gradient(transparent 50%,rgba(200,0,0,0.5));
          opacity:0; pointer-events:none; z-index:101;
        }
        #doom-hud #doom-damage.flash { opacity:1; }
        #doom-hud #doom-hitmarker {
          position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
          font-size:18px; color:#fff; opacity:0; z-index:102;
        }
        #doom-hud #doom-hitmarker.hit { opacity:1; transition:opacity 0.15s; }
        #doom-hud #doom-gameover {
          position:fixed; inset:0; display:none; flex-direction:column;
          align-items:center; justify-content:center;
          background:rgba(0,0,0,0.85); z-index:300; pointer-events:auto;
        }
        #doom-hud #doom-gameover h2 { font-size:32px; color:#cc3333; margin-bottom:16px; }
        #doom-hud #doom-gameover-stats { font-size:14px; margin-bottom:8px; }
        #doom-hud #doom-gameover-stats div { display:flex; justify-content:space-between; gap:32px; margin:4px 0; }
        #doom-hud #doom-gameover-restart {
          margin-top:20px; padding:10px 32px; font-size:16px; cursor:pointer;
          background:#333; color:#fff; border:1px solid #666; border-radius:4px;
        }
        .shake { animation: shake 0.16s ease; }
        @keyframes shake { 0%,100%{transform:none} 25%{transform:translateX(-2px)} 75%{transform:translateX(2px)} }
      </style>

      <div id="doom-crosshair"></div>

      <div class="hud-item hud-left">
        <div class="label">生命</div>
        <div class="value" id="doom-hp">100</div>
      </div>
      <div class="hud-item hud-right">
        <div class="label">弹药</div>
        <div class="value" id="doom-ammo">30</div>
      </div>
      <div class="hud-item hud-top-left">
        <div class="label">层数</div>
        <div class="value" id="doom-floor">1</div>
      </div>
      <div class="hud-item hud-top-right">
        <div class="label">门</div>
        <div class="value" id="doom-doors">0 / 0</div>
      </div>
      <div class="hud-item hud-weapon">
        <div class="label">武器</div>
        <div class="value" id="doom-weapon-name">步枪</div>
      </div>
      <div class="hud-item hud-shield" id="doom-shield-indicator" style="display:none;">
        <div class="label">护盾</div>
        <div class="value" id="doom-shield-hits">3</div>
      </div>
      <div class="hud-item hud-center-top" id="doom-room-status" style="display:none;">
        <div class="label">敌人</div>
        <div class="value" id="doom-room-enemies">0</div>
      </div>

      <div id="doom-interact-prompt" style="display:none;"></div>

      <div id="doom-floor-transition">
        <div id="doom-floor-text">第 1 层</div>
      </div>

      <div id="doom-fade-overlay"></div>
      <div id="doom-damage"></div>
      <div id="doom-hitmarker">+</div>

      <div id="doom-gameover">
        <h2>你死了</h2>
        <div id="doom-gameover-sub"></div>
        <div id="doom-gameover-stats"></div>
        <button id="doom-gameover-restart">再来一次 [R]</button>
      </div>
    `;

    this.hp = this.get('doom-hp');
    this.ammo = this.get('doom-ammo');
    this.floorEl = this.get('doom-floor');
    this.doorsEl = this.get('doom-doors');
    this.roomStatus = this.get('doom-room-status');
    this.roomEnemies = this.get('doom-room-enemies');
    this.interactPrompt = this.get('doom-interact-prompt');
    this.floorTransition = this.get('doom-floor-transition');
    this.floorText = this.get('doom-floor-text');
    this.fadeOverlay = this.get('doom-fade-overlay');
    this.damage = this.get('doom-damage');
    this.hitmarker = this.get('doom-hitmarker');
    this.weaponName = this.get('doom-weapon-name');
    this.shieldIndicator = this.get('doom-shield-indicator');
    this.shieldHits = this.get('doom-shield-hits');
    this.gameoverEl = this.get('doom-gameover');
    this.gameoverStats = this.get('doom-gameover-stats');
    this.gameoverSub = this.get('doom-gameover-sub');
    this.gameoverRestart = this.get('doom-gameover-restart') as HTMLButtonElement;
  }

  private get(id: string): HTMLElement {
    return document.getElementById(id)!;
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

  setWeapon(name: string): void {
    this.weaponName.textContent = name;
  }

  setShield(hits: number): void {
    if (hits > 0) {
      this.shieldIndicator.style.display = '';
      this.shieldHits.textContent = String(hits);
    } else {
      this.shieldIndicator.style.display = 'none';
    }
  }

  showRoomStatus(alive: number): void {
    this.roomStatus.style.display = '';
    this.roomEnemies.textContent = alive > 0 ? String(alive) : '已清除';
  }

  hideRoomStatus(): void {
    this.roomStatus.style.display = 'none';
  }

  showInteract(text: string): void {
    this.interactPrompt.textContent = text;
    this.interactPrompt.style.display = '';
  }

  hideInteract(): void {
    if (this.lootTimer) return;
    this.interactPrompt.style.display = 'none';
  }

  private lootTimer: ReturnType<typeof setTimeout> | null = null;

  showLoot(ammo: number, health: number): void {
    const parts: string[] = [];
    if (ammo > 0) parts.push(`弹药 +${ammo}`);
    if (health > 0) parts.push(`生命 +${health}`);
    if (parts.length === 0) return;
    this.interactPrompt.textContent = parts.join('  ');
    this.interactPrompt.style.display = '';
    if (this.lootTimer) clearTimeout(this.lootTimer);
    this.lootTimer = setTimeout(() => {
      this.interactPrompt.style.display = 'none';
      this.lootTimer = null;
    }, 1500);
  }

  showFloorTransition(floor: number): void {
    this.floorText.textContent = `第 ${floor} 层`;
    this.floorTransition.style.display = 'flex';
    this.floorText.style.animation = 'none';
    void this.floorText.offsetWidth;
    this.floorText.style.animation = '';
    setTimeout(() => {
      this.floorTransition.style.display = 'none';
    }, 1500);
  }

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
    this.gameEl.classList.add('shake');
    setTimeout(() => { this.damage.classList.remove('flash'); }, 120);
    setTimeout(() => { this.gameEl.classList.remove('shake'); }, 160);
  }

  flashHitMarker(): void {
    this.hitmarker.classList.remove('hit');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('hit');
    setTimeout(() => { this.hitmarker.classList.remove('hit'); }, 150);
  }

  showGameOver(stats: { floor: number; kills: number; time: number; doors: number }, onRestart: () => void): void {
    const minutes = Math.floor(stats.time / 60);
    const seconds = Math.floor(stats.time % 60);
    this.gameoverStats.innerHTML = `
      <div><span>到达层数</span><span>${stats.floor}</span></div>
      <div><span>击杀数</span><span>${stats.kills}</span></div>
      <div><span>存活时间</span><span>${minutes}:${String(seconds).padStart(2, '0')}</span></div>
      <div><span>开门数</span><span>${stats.doors}</span></div>
    `;
    this.gameoverSub.textContent = '迷宫又吞噬了一个灵魂。';
    this.gameoverEl.style.display = 'flex';
    const handler = () => {
      this.gameoverRestart.removeEventListener('click', handler);
      this.gameoverEl.style.display = 'none';
      onRestart();
    };
    this.gameoverRestart.addEventListener('click', handler);
  }

  hideEndScreens(): void {
    this.gameoverEl.style.display = 'none';
  }

  /** Remove all HUD DOM when game is disposed */
  dispose(): void {
    this.root.remove();
  }
}
