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
  { category: 'weapon', weaponType: 'rifle', title: '步枪', description: '均衡全自动。34伤害，射速快，30发弹匣。' },
  { category: 'weapon', weaponType: 'shotgun', title: '霰弹枪', description: '6颗散射弹丸。8×8伤害，近距离威力强。' },
  { category: 'weapon', weaponType: 'sniper', title: '狙击枪', description: '高威力单发。120伤害，射速慢。' },
];

const STAT_CARDS: StatCard[] = [
  { category: 'stat', stat: 'health', title: '生命强化', description: '最大生命值+25，立即回复25点生命。' },
  { category: 'stat', stat: 'ammo', title: '弹药扩容', description: '最大弹匣+10，当前弹药+10。' },
  { category: 'stat', stat: 'speed', title: '移速提升', description: '移动速度+1.0，冲刺速度+1.5 m/s。' },
  { category: 'stat', stat: 'damage', title: '伤害提升', description: '所有武器伤害×1.15。' },
];

const SPECIAL_CARDS: SpecialCard[] = [
  { category: 'special', effect: 'heal', title: '满血恢复', description: '立即将生命值恢复至上限。' },
  { category: 'special', effect: 'resupply', title: '弹药补给', description: '立即将弹药补充至上限。' },
  { category: 'special', effect: 'shield', title: '护盾', description: '接下来3次受击伤害减半。' },
  { category: 'special', effect: 'scout', title: '侦察', description: '下一层：提前显示所有门的类型。' },
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
      weapon: '武器',
      stat: '属性',
      special: '特殊',
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
