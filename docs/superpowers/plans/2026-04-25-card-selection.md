# Card Selection System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Roguelike card selection screen between floors with weapon switching (rifle/shotgun/sniper), stat buffs, and special effects.

**Architecture:** New `CardPicker.ts` handles card UI (DOM overlay, click selection, returns Promise). New `weapons.ts` defines weapon configs. `Game.ts` intercepts floor advance to show cards and tracks `playerBuffs`. `Weapon.ts` gains multi-weapon support with shotgun spread rays. `Player.ts` applies speed/health buffs and shield damage reduction.

**Tech Stack:** Three.js, TypeScript, Vite, DOM overlay (existing pattern)

**Spec:** `docs/superpowers/specs/2026-04-25-card-selection-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/weapons.ts` | Create | Weapon type configs (rifle/shotgun/sniper stats), `WeaponType` type, `getWeaponConfig()` |
| `src/CardPicker.ts` | Create | Card definitions, random draw logic, DOM overlay UI, click handling, returns Promise with selected card |
| `src/config.ts` | Modify | Add card-related config (stat card values, special card values) |
| `src/Weapon.ts` | Modify | Accept weapon config, support shotgun multi-ray spread, `switchWeapon()` method |
| `src/Player.ts` | Modify | Accept speed/health bonuses, shield damage reduction in `takeDamage()` |
| `src/Game.ts` | Modify | Add `playerBuffs`, intercept `advanceFloor()` to show CardPicker, apply card effects, reset on restart |
| `src/Door.ts` | Modify | Add scout glow (colored point light above door based on roomType) |
| `src/Hud.ts` | Modify | Show current weapon name, shield indicator |
| `index.html` | Modify | Add card picker overlay HTML + weapon/shield HUD elements |
| `src/style.css` | Modify | Card picker styles, weapon/shield HUD styles |
| `src/Sfx.ts` | Modify | Add card select sound |

---

## Task 1: Create weapons.ts — weapon type definitions

**Files:**
- Create: `src/weapons.ts`

- [ ] **Step 1: Create weapons.ts**

Create `src/weapons.ts`:

```typescript
export type WeaponType = 'rifle' | 'shotgun' | 'sniper';

export interface WeaponConfig {
  type: WeaponType;
  name: string;
  damage: number;
  fireRate: number;
  magazine: number;
  maxRange: number;
  recoilKick: number;
  /** Number of rays per shot (1 for rifle/sniper, 6 for shotgun) */
  pellets: number;
  /** Spread angle in radians (0 for rifle/sniper) */
  spread: number;
}

const WEAPONS: Record<WeaponType, WeaponConfig> = {
  rifle: {
    type: 'rifle',
    name: 'RIFLE',
    damage: 34,
    fireRate: 0.14,
    magazine: 30,
    maxRange: 80,
    recoilKick: 0.05,
    pellets: 1,
    spread: 0,
  },
  shotgun: {
    type: 'shotgun',
    name: 'SHOTGUN',
    damage: 8,
    fireRate: 0.8,
    magazine: 8,
    maxRange: 20,
    recoilKick: 0.12,
    pellets: 6,
    spread: Math.PI / 36, // ±5 degrees
  },
  sniper: {
    type: 'sniper',
    name: 'SNIPER',
    damage: 120,
    fireRate: 1.2,
    magazine: 5,
    maxRange: 150,
    recoilKick: 0.15,
    pellets: 1,
    spread: 0,
  },
};

export function getWeaponConfig(type: WeaponType): WeaponConfig {
  return WEAPONS[type];
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: Pass (new file, no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add src/weapons.ts
git commit -m "feat: add weapon type definitions (rifle/shotgun/sniper)"
```

---

## Task 2: Update Weapon.ts for multi-weapon support

**Files:**
- Modify: `src/Weapon.ts`

- [ ] **Step 1: Rewrite Weapon.ts with weapon config support**

Replace the entire `src/Weapon.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from './config';
import type { Player } from './Player';
import type { Enemy } from './Enemy';
import type { WeaponModel } from './WeaponModel';
import type { Sfx } from './Sfx';
import { getWeaponConfig, type WeaponType, type WeaponConfig } from './weapons';

export interface HitResult {
  enemy: Enemy;
  distance: number;
  point: THREE.Vector3;
}

/**
 * Weapon — manages fire rate, ammo, hitscan logic.
 * Supports multiple weapon types with different stats.
 * Shotgun fires multiple spread rays; rifle/sniper fire single rays.
 */
export class Weapon {
  private cooldown = 0;
  private readonly raycaster = new THREE.Raycaster();
  private config: WeaponConfig;
  private damageMultiplier = 1.0;

  constructor(
    private readonly player: Player,
    private readonly model: WeaponModel,
    private readonly sfx: Sfx,
  ) {
    this.config = getWeaponConfig('rifle');
  }

  reset(): void {
    this.cooldown = 0;
  }

  getConfig(): WeaponConfig {
    return this.config;
  }

  /** Switch to a new weapon type. Returns new magazine size for ammo reset. */
  switchWeapon(type: WeaponType, ammoBonus: number): number {
    this.config = getWeaponConfig(type);
    this.cooldown = 0;
    return this.config.magazine + ammoBonus;
  }

  setDamageMultiplier(mult: number): void {
    this.damageMultiplier = mult;
  }

  canFire(): boolean {
    return this.cooldown <= 0 && this.player.ammo > 0 && this.player.alive;
  }

  getEffectiveDamage(): number {
    return Math.round(this.config.damage * this.damageMultiplier);
  }

  /**
   * Attempt to fire; returns the first hit enemy (if any) or null.
   * Shotgun fires multiple pellets — each can hit independently.
   * Returns the first hit for HUD feedback.
   */
  tryFire(enemies: Enemy[]): HitResult | null {
    if (!this.canFire()) {
      if (this.player.ammo <= 0) this.sfx.empty();
      return null;
    }

    this.cooldown = this.config.fireRate;
    this.player.ammo -= 1;
    this.player.addRecoil(this.config.recoilKick);
    this.model.fire();
    this.sfx.shoot();

    const origin = this.player.camera.position.clone();
    const baseDir = this.player.getLookDir();
    const effectiveDmg = this.getEffectiveDamage();

    // Build enemy mesh list
    const meshes: THREE.Object3D[] = [];
    const meshToEnemy = new Map<number, Enemy>();
    for (const e of enemies) {
      if (!e.alive) continue;
      meshes.push(e.hitbox);
      meshToEnemy.set(e.hitbox.id, e);
    }

    let firstHit: HitResult | null = null;

    for (let p = 0; p < this.config.pellets; p++) {
      let dir: THREE.Vector3;
      if (this.config.spread > 0) {
        // Random spread within cone
        dir = baseDir.clone();
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(baseDir, up).normalize();
        const actualUp = new THREE.Vector3().crossVectors(right, baseDir).normalize();
        const angle = (Math.random() - 0.5) * 2 * this.config.spread;
        const angle2 = (Math.random() - 0.5) * 2 * this.config.spread;
        dir.add(right.multiplyScalar(Math.sin(angle)));
        dir.add(actualUp.multiplyScalar(Math.sin(angle2)));
        dir.normalize();
      } else {
        dir = baseDir;
      }

      this.raycaster.set(origin, dir);
      this.raycaster.far = this.config.maxRange;

      const hits = this.raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const first = hits[0]!;
        const enemy = meshToEnemy.get(first.object.id);
        if (enemy) {
          enemy.takeDamage(effectiveDmg);
          if (!firstHit) {
            firstHit = {
              enemy,
              distance: first.distance,
              point: first.point.clone(),
            };
          }
        }
      }
    }

    return firstHit;
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: Pass. `Weapon` API is backward-compatible (`tryFire`, `update`, `reset` unchanged). `CONFIG.weapon.damage` etc. are no longer used by Weapon.ts directly — it uses `this.config`.

- [ ] **Step 3: Commit**

```bash
git add src/Weapon.ts
git commit -m "feat: Weapon supports multi-type configs with shotgun spread rays"
```

---

## Task 3: Update config.ts with card values

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add cards config section**

Add after the `transition` section (before `colors`) in `src/config.ts`:

```typescript
  // Cards
  cards: {
    stat: {
      healthBoost: 25,
      ammoExpand: 10,
      speedUp: 1.0,
      sprintUp: 1.5,
      damageMultiplier: 1.15,
    },
    special: {
      shieldHits: 3,
    },
  },
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add card stat/special values to config"
```

---

## Task 4: Update Player.ts with buff support and shield

**Files:**
- Modify: `src/Player.ts`

- [ ] **Step 1: Add buff properties and shield to Player**

Add these properties after `alive = true;` (line 25):

```typescript
  // Buff bonuses (applied by Game from card picks)
  speedBonus = 0;
  sprintBonus = 0;
  maxHealthBonus = 0;
  shieldHits = 0;
```

Update `takeDamage` to handle shield:

```typescript
  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    let dmg = amount;
    if (this.shieldHits > 0) {
      dmg = Math.round(dmg / 2);
      this.shieldHits--;
    }
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }
```

Update `update()` to use buffed speed. Change line 136 from:

```typescript
    const speed = sprint ? CONFIG.player.sprintSpeed : CONFIG.player.moveSpeed;
```

to:

```typescript
    const speed = sprint
      ? CONFIG.player.sprintSpeed + this.sprintBonus
      : CONFIG.player.moveSpeed + this.speedBonus;
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add src/Player.ts
git commit -m "feat: Player supports speed/health buffs and shield damage reduction"
```

---

## Task 5: Create CardPicker.ts — UI and selection logic

**Files:**
- Create: `src/CardPicker.ts`

- [ ] **Step 1: Create CardPicker.ts**

Create `src/CardPicker.ts`:

```typescript
import type { WeaponType } from './weapons';

export type CardCategory = 'weapon' | 'stat' | 'special';

export interface WeaponCard {
  category: 'weapon';
  weaponType: WeaponType;
  title: string;
  description: string;
}

export interface StatCard {
  category: 'stat';
  stat: 'health' | 'ammo' | 'speed' | 'damage';
  title: string;
  description: string;
}

export interface SpecialCard {
  category: 'special';
  effect: 'heal' | 'resupply' | 'shield' | 'scout';
  title: string;
  description: string;
}

export type Card = WeaponCard | StatCard | SpecialCard;

// --- Card pools ---

const WEAPON_CARDS: WeaponCard[] = [
  { category: 'weapon', weaponType: 'rifle', title: 'RIFLE', description: 'Balanced auto. 34 dmg, fast fire, 30 mag.' },
  { category: 'weapon', weaponType: 'shotgun', title: 'SHOTGUN', description: '6 pellets spread. 8×8 dmg, close range.' },
  { category: 'weapon', weaponType: 'sniper', title: 'SNIPER', description: 'High power single shot. 120 dmg, slow fire.' },
];

const STAT_CARDS: StatCard[] = [
  { category: 'stat', stat: 'health', title: 'HEALTH BOOST', description: 'Max HP +25, heal +25.' },
  { category: 'stat', stat: 'ammo', title: 'AMMO EXPAND', description: 'Max magazine +10, ammo +10.' },
  { category: 'stat', stat: 'speed', title: 'SPEED UP', description: 'Move +1.0, sprint +1.5 m/s.' },
  { category: 'stat', stat: 'damage', title: 'DAMAGE UP', description: 'All weapon damage ×1.15.' },
];

const SPECIAL_CARDS: SpecialCard[] = [
  { category: 'special', effect: 'heal', title: 'FULL HEAL', description: 'Restore HP to maximum.' },
  { category: 'special', effect: 'resupply', title: 'AMMO RESUPPLY', description: 'Restore ammo to maximum.' },
  { category: 'special', effect: 'shield', title: 'SHIELD', description: 'Next 3 hits deal half damage.' },
  { category: 'special', effect: 'scout', title: 'SCOUT', description: 'Next floor: see all door types.' },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Draw 3 cards: one weapon, one stat, one special.
 */
export function drawCards(): [WeaponCard, StatCard, SpecialCard] {
  return [pickRandom(WEAPON_CARDS), pickRandom(STAT_CARDS), pickRandom(SPECIAL_CARDS)];
}

/**
 * Show the card picker overlay and return the selected card.
 * Resolves when the player clicks a card.
 */
export function showCardPicker(cards: Card[]): Promise<Card> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('card-picker')!;
    const container = document.getElementById('card-container')!;

    // Clear previous cards
    container.innerHTML = '';

    const CATEGORY_LABELS: Record<CardCategory, string> = {
      weapon: 'WEAPON',
      stat: 'STAT',
      special: 'SPECIAL',
    };

    for (const card of cards) {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `
        <div class="card-category">${CATEGORY_LABELS[card.category]}</div>
        <div class="card-title">${card.title}</div>
        <div class="card-desc">${card.description}</div>
      `;
      el.addEventListener('click', () => {
        // Flash effect
        el.classList.add('card-selected');
        setTimeout(() => {
          overlay.style.display = 'none';
          resolve(card);
        }, 300);
      });
      container.appendChild(el);
    }

    overlay.style.display = 'flex';
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: Pass (will warn about missing DOM element at runtime, but types are fine).

- [ ] **Step 3: Commit**

```bash
git add src/CardPicker.ts
git commit -m "feat: add CardPicker with card definitions and DOM overlay UI"
```

---

## Task 6: Add card picker HTML and CSS

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`

- [ ] **Step 1: Add card picker overlay to index.html**

Add after the `<!-- Fade overlay -->` div (after line 48) in `index.html`:

```html
    <!-- Card picker overlay -->
    <div id="card-picker" style="display:none;">
      <div class="card-picker-title">CHOOSE A CARD</div>
      <div id="card-container" class="card-container"></div>
    </div>
```

Add weapon name and shield indicator to the HUD section. After the `hud-top-right` div (line 31), add:

```html
      <div class="hud-item hud-weapon">
        <div class="label">WEAPON</div>
        <div class="value" id="weapon-name">RIFLE</div>
      </div>
      <div class="hud-item hud-shield" id="shield-indicator" style="display:none;">
        <div class="label">SHIELD</div>
        <div class="value" id="shield-hits">3</div>
      </div>
```

- [ ] **Step 2: Add card picker CSS**

Add at the end of `src/style.css` (before the shake keyframe):

```css
/* ============ Card Picker ============ */

#card-picker {
  position: fixed;
  inset: 0;
  z-index: 130;
  background: rgba(240, 240, 240, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
  cursor: default;
}
.card-picker-title {
  font-size: 28px;
  font-weight: bold;
  letter-spacing: 8px;
  margin-bottom: 40px;
  opacity: 0.6;
}
.card-container {
  display: flex;
  gap: 24px;
}
.card {
  background: var(--panel-bg);
  border: 3px solid var(--border);
  padding: 32px 28px;
  width: 200px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.card:hover {
  transform: translateY(-6px);
  border-color: #000000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.card-category {
  font-size: 11px;
  letter-spacing: 3px;
  opacity: 0.4;
  margin-bottom: 12px;
}
.card-title {
  font-size: 22px;
  font-weight: bold;
  letter-spacing: 2px;
  margin-bottom: 12px;
}
.card-desc {
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.7;
  letter-spacing: 0.5px;
}
.card-selected {
  background: #222222;
  color: #ffffff;
  transform: translateY(-6px) scale(1.05);
}

/* ============ Weapon & Shield HUD ============ */

.hud-weapon {
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  text-align: center;
}
.hud-weapon .value { font-size: 16px; }
.hud-shield {
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  text-align: center;
  border-color: #4488ff;
}
.hud-shield .value { font-size: 16px; color: #4488ff; }
```

- [ ] **Step 3: Commit**

```bash
git add index.html src/style.css
git commit -m "feat: add card picker overlay HTML/CSS and weapon/shield HUD"
```

---

## Task 7: Update Hud.ts with weapon name and shield display

**Files:**
- Modify: `src/Hud.ts`

- [ ] **Step 1: Add weapon and shield elements to Hud**

Add properties after `private readonly game: HTMLElement;` (line 18):

```typescript
  private readonly weaponName: HTMLElement;
  private readonly shieldIndicator: HTMLElement;
  private readonly shieldHits: HTMLElement;
```

Add to constructor after `this.game = mustGet('game');`:

```typescript
    this.weaponName = mustGet('weapon-name');
    this.shieldIndicator = mustGet('shield-indicator');
    this.shieldHits = mustGet('shield-hits');
```

Add new methods after `setDoors`:

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add src/Hud.ts
git commit -m "feat: Hud shows current weapon name and shield indicator"
```

---

## Task 8: Add card select sound to Sfx.ts

**Files:**
- Modify: `src/Sfx.ts`

- [ ] **Step 1: Add cardSelect sound**

Add after the `floorTransition()` method in `src/Sfx.ts`:

```typescript
  cardSelect(): void {
    if (!this.ready()) return;
    this.beep(520, 0.08, 'sine', 0.4);
    this.beep(780, 0.12, 'sine', 0.5);
    this.sweep(400, 1200, 0.3, 'triangle', 0.3);
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/Sfx.ts
git commit -m "feat: add card select sound effect"
```

---

## Task 9: Update Door.ts with scout glow

**Files:**
- Modify: `src/Door.ts`

- [ ] **Step 1: Add scout glow support to Door**

Add a `scoutLight` property after `private glowMesh: THREE.Mesh;`:

```typescript
  private scoutLight: THREE.PointLight | null = null;
```

Add a method at the end of the class (before `dispose`):

```typescript
  /** Show colored glow above door indicating room type (scout card) */
  enableScout(): void {
    if (this.scoutLight || this.state === 'used') return;
    const colorMap: Record<string, number> = {
      combat: 0xff4444,
      treasure: 0xffaa22,
      exit: 0x44ff88,
    };
    const color = colorMap[this.roomType] ?? 0xffffff;
    this.scoutLight = new THREE.PointLight(color, 3.0, 8, 1.0);
    this.scoutLight.position.set(0, CONFIG.door.height + 0.5, 0);
    this.group.add(this.scoutLight);
  }
```

Add `import * as THREE from 'three';` is already at top — just need to make sure the import is there (it is).

Update `dispose` to clean up the scout light:

Change the `dispose` method to add before `scene.remove(this.group);`:

```typescript
  dispose(scene: THREE.Scene): void {
    if (this.scoutLight) {
      this.group.remove(this.scoutLight);
      this.scoutLight.dispose();
      this.scoutLight = null;
    }
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add src/Door.ts
git commit -m "feat: Door supports scout glow (colored light by room type)"
```

---

## Task 10: Integrate card system into Game.ts

**Files:**
- Modify: `src/Game.ts`

- [ ] **Step 1: Add imports, playerBuffs, and card integration**

Add imports at the top of `src/Game.ts`:

```typescript
import { drawCards, showCardPicker, type Card, type WeaponCard, type StatCard, type SpecialCard } from './CardPicker';
import type { WeaponType } from './weapons';
```

Add `playerBuffs` property after `private nearDoor: Door | null = null;`:

```typescript
  private playerBuffs = {
    currentWeapon: 'rifle' as WeaponType,
    damageMultiplier: 1.0,
    maxHealthBonus: 0,
    maxAmmoBonus: 0,
    speedBonus: 0,
    sprintBonus: 0,
    shieldHits: 0,
    scoutActive: false,
  };
```

- [ ] **Step 2: Rewrite advanceFloor to show cards**

Replace the `advanceFloor` method:

```typescript
  private async advanceFloor(): Promise<void> {
    this.transitioning = true;
    this.sfx.floorTransition();
    await this.hud.fadeIn();

    // Dispose room
    if (this.currentRoom) {
      this.currentRoom.dispose(this.engine.scene);
      this.currentRoom = null;
    }

    // Stop game loop updates during card pick
    this.state = 'exploring'; // prevent in_room updates
    this.hud.hideRoomStatus();

    // Show card picker (unlock mouse for clicking)
    this.input.exitPointerLock();
    await this.hud.fadeOut();

    const cards = drawCards();
    const picked = await showCardPicker(cards);
    this.sfx.cardSelect();

    // Apply card effect
    this.applyCard(picked);

    // Fade and generate new floor
    await this.hud.fadeIn();

    // Reset scout for previous floor
    this.playerBuffs.scoutActive = false;

    this.initFloor(this.floor + 1);

    // Apply scout if it was just picked
    if (picked.category === 'special' && (picked as SpecialCard).effect === 'scout') {
      this.playerBuffs.scoutActive = true;
      for (const door of this.doors) {
        door.enableScout();
      }
    }

    this.refreshHud();

    await this.hud.fadeOut();
    this.hud.showFloorTransition(this.floor);
    this.input.requestPointerLock();
    this.transitioning = false;
  }
```

- [ ] **Step 3: Add applyCard method**

Add after `advanceFloor`:

```typescript
  private applyCard(card: Card): void {
    if (card.category === 'weapon') {
      const wc = card as WeaponCard;
      this.playerBuffs.currentWeapon = wc.weaponType;
      const newMax = this.weapon.switchWeapon(wc.weaponType, this.playerBuffs.maxAmmoBonus);
      this.player.ammo = newMax;
      this.weapon.setDamageMultiplier(this.playerBuffs.damageMultiplier);
      this.hud.setWeapon(wc.title);
    } else if (card.category === 'stat') {
      const sc = card as StatCard;
      switch (sc.stat) {
        case 'health':
          this.playerBuffs.maxHealthBonus += CONFIG.cards.stat.healthBoost;
          this.player.maxHealthBonus = this.playerBuffs.maxHealthBonus;
          this.player.hp = Math.min(
            this.player.hp + CONFIG.cards.stat.healthBoost,
            CONFIG.player.maxHealth + this.playerBuffs.maxHealthBonus,
          );
          break;
        case 'ammo':
          this.playerBuffs.maxAmmoBonus += CONFIG.cards.stat.ammoExpand;
          this.player.ammo = Math.min(
            this.player.ammo + CONFIG.cards.stat.ammoExpand,
            this.weapon.getConfig().magazine + this.playerBuffs.maxAmmoBonus,
          );
          break;
        case 'speed':
          this.playerBuffs.speedBonus += CONFIG.cards.stat.speedUp;
          this.playerBuffs.sprintBonus += CONFIG.cards.stat.sprintUp;
          this.player.speedBonus = this.playerBuffs.speedBonus;
          this.player.sprintBonus = this.playerBuffs.sprintBonus;
          break;
        case 'damage':
          this.playerBuffs.damageMultiplier *= CONFIG.cards.stat.damageMultiplier;
          this.weapon.setDamageMultiplier(this.playerBuffs.damageMultiplier);
          break;
      }
    } else {
      const sp = card as SpecialCard;
      switch (sp.effect) {
        case 'heal': {
          const maxHp = CONFIG.player.maxHealth + this.playerBuffs.maxHealthBonus;
          this.player.hp = maxHp;
          break;
        }
        case 'resupply': {
          const maxAmmo = this.weapon.getConfig().magazine + this.playerBuffs.maxAmmoBonus;
          this.player.ammo = maxAmmo;
          break;
        }
        case 'shield':
          this.playerBuffs.shieldHits += CONFIG.cards.special.shieldHits;
          this.player.shieldHits = this.playerBuffs.shieldHits;
          this.hud.setShield(this.playerBuffs.shieldHits);
          break;
        case 'scout':
          // Applied after floor generation in advanceFloor
          break;
      }
    }
  }
```

- [ ] **Step 4: Update onPlayerHit to sync shield HUD**

Replace `onPlayerHit`:

```typescript
  private onPlayerHit(damage: number): void {
    if (this.state === 'dead') return;
    const died = this.player.takeDamage(damage);
    this.sfx.damage();
    this.hud.flashDamage();
    this.hud.setHp(this.player.hp);
    // Sync shield display
    this.playerBuffs.shieldHits = this.player.shieldHits;
    this.hud.setShield(this.playerBuffs.shieldHits);
    if (died) {
      this.onDeath();
    }
  }
```

- [ ] **Step 5: Update restart to reset buffs**

In `restart()`, add after `this.elapsedTime = 0;`:

```typescript
    // Reset buffs
    this.playerBuffs = {
      currentWeapon: 'rifle',
      damageMultiplier: 1.0,
      maxHealthBonus: 0,
      maxAmmoBonus: 0,
      speedBonus: 0,
      sprintBonus: 0,
      shieldHits: 0,
      scoutActive: false,
    };
    this.weapon.switchWeapon('rifle', 0);
    this.weapon.setDamageMultiplier(1.0);
    this.player.speedBonus = 0;
    this.player.sprintBonus = 0;
    this.player.maxHealthBonus = 0;
    this.player.shieldHits = 0;
    this.hud.setWeapon('RIFLE');
    this.hud.setShield(0);
```

- [ ] **Step 6: Update R key reload to use effective max ammo**

In `bindActions`, change the R key handler:

```typescript
    this.input.registerKey('r', () => {
      if (this.state === 'dead') {
        this.restart();
      } else {
        const maxAmmo = this.weapon.getConfig().magazine + this.playerBuffs.maxAmmoBonus;
        this.player.ammo = maxAmmo;
        this.hud.setAmmo(this.player.ammo);
      }
    });
```

- [ ] **Step 7: Verify typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Expected: Pass.

- [ ] **Step 8: Commit**

```bash
git add src/Game.ts
git commit -m "feat: integrate card selection into floor advance with buff system"
```

---

## Task 11: Integration testing and fixes

**Files:**
- Possibly modify any file with type issues

- [ ] **Step 1: Run full typecheck**

Run: `cd /Users/lindeng/doom-fps && pnpm typecheck`

Fix any errors. Likely issues:
- `CONFIG.cards` type inference from `as const` — should work
- `Player.maxHealthBonus` needs to be a public property (already added in Task 4)

- [ ] **Step 2: Run build**

Run: `cd /Users/lindeng/doom-fps && pnpm build`

Expected: Success.

- [ ] **Step 3: Run dev and test**

Run: `cd /Users/lindeng/doom-fps && pnpm dev`

Test checklist:
1. Play through floor 1, find exit room, press E at portal
2. Card picker appears with 3 cards (WEAPON / STAT / SPECIAL)
3. Mouse cursor visible, can hover cards (scale up effect)
4. Click a card — brief flash, overlay dismisses
5. Next floor generates, "FLOOR 2" shows
6. Weapon card: gun switches (shotgun = multi-pellet spread, sniper = slow high dmg)
7. Stat card: health/ammo/speed/damage buffs apply
8. Special card: heal/resupply/shield/scout work
9. Shield: HUD shows remaining hits, halves damage
10. Scout: colored lights above doors on next floor
11. Death → restart: all buffs reset, back to rifle
12. Weapon name shown in HUD bottom center

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes for card selection system"
```
