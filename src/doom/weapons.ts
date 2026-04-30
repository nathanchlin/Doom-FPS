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
    name: '步枪',
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
    name: '霰弹枪',
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
    name: '狙击枪',
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
