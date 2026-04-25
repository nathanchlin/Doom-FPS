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
