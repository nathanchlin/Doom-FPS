import { lookDirection, rayVsAABB3D, type AABB3D, type Ray3D } from '../shared/collision';
import type { ServerPlayer } from './ServerPlayer';
import { PLAYER_HEIGHT } from './ServerPlayer';
import type { ServerEnemy } from './ServerEnemy';

// ─── Rifle constants (multiplayer only has rifle) ───

const WEAPON_DAMAGE = 34;
const WEAPON_RANGE = 80;
const WEAPON_COOLDOWN = 0.14;

// ─── Hitbox sizing ───

// Player hitbox: 0.8 wide × 1.75 tall × 0.8 deep, centered at player x/z
const PLAYER_HITBOX_HALF = 0.4; // half of 0.8

// Enemy scale factors (from config.ts)
const ENEMY_SCALE: Record<string, number> = {
  standard: 1.0,
  rusher: 0.6,
  tank: 1.5,
  patrol: 0.85,
};

const ENEMY_BASE_RADIUS = 0.6;
const ENEMY_BASE_HEIGHT = 1.9;

// ─── Cooldown tracker ───

export class WeaponCooldown {
  private timers = new Map<number, number>();

  canFire(playerId: number): boolean {
    return (this.timers.get(playerId) ?? 0) <= 0;
  }

  fire(playerId: number): void {
    this.timers.set(playerId, WEAPON_COOLDOWN);
  }

  update(dt: number): void {
    for (const [id, t] of this.timers) {
      const next = t - dt;
      if (next <= 0) {
        this.timers.delete(id);
      } else {
        this.timers.set(id, next);
      }
    }
  }

  removePlayer(playerId: number): void {
    this.timers.delete(playerId);
  }
}

// ─── Shot result ───

export interface ShotResult {
  hit: boolean;
  targetType: 'player' | 'enemy';
  targetId: number;
  damage: number;
  killed: boolean;
}

/**
 * Process a hitscan shot from a shooter.
 * Tests against all other players and all alive enemies.
 * Returns the closest hit, or null if nothing was hit.
 */
export function processShot(
  shooter: ServerPlayer,
  players: ServerPlayer[],
  enemies: ServerEnemy[],
): ShotResult | null {
  const dir = lookDirection(shooter.yaw, shooter.pitch);
  const ray: Ray3D = {
    ox: shooter.x,
    oy: shooter.y, // eye level
    oz: shooter.z,
    dx: dir.dx,
    dy: dir.dy,
    dz: dir.dz,
  };

  let closestDist = WEAPON_RANGE;
  let closestResult: ShotResult | null = null;

  // Test against other players
  for (const p of players) {
    if (p.id === shooter.id || !p.alive) continue;

    // Player hitbox: centered at (p.x, p.y - PLAYER_HEIGHT/2, p.z)
    // feet at p.y - PLAYER_HEIGHT, head at p.y
    const box: AABB3D = {
      minX: p.x - PLAYER_HITBOX_HALF,
      maxX: p.x + PLAYER_HITBOX_HALF,
      minY: p.y - PLAYER_HEIGHT, // feet
      maxY: p.y,                 // eye level
      minZ: p.z - PLAYER_HITBOX_HALF,
      maxZ: p.z + PLAYER_HITBOX_HALF,
    };

    const dist = rayVsAABB3D(ray, box, closestDist);
    if (dist !== null && dist < closestDist) {
      closestDist = dist;
      closestResult = {
        hit: true,
        targetType: 'player',
        targetId: p.id,
        damage: WEAPON_DAMAGE,
        killed: false, // caller applies damage and sets this
      };
    }
  }

  // Test against alive enemies
  for (const e of enemies) {
    if (e.state === 'dead') continue;

    const scale = ENEMY_SCALE[e.type] ?? 1.0;
    const r = ENEMY_BASE_RADIUS * scale * 0.9;
    const h = ENEMY_BASE_HEIGHT * scale;

    const box: AABB3D = {
      minX: e.x - r,
      maxX: e.x + r,
      minY: 0,
      maxY: h,
      minZ: e.z - r,
      maxZ: e.z + r,
    };

    const dist = rayVsAABB3D(ray, box, closestDist);
    if (dist !== null && dist < closestDist) {
      closestDist = dist;
      closestResult = {
        hit: true,
        targetType: 'enemy',
        targetId: e.id,
        damage: WEAPON_DAMAGE,
        killed: false,
      };
    }
  }

  return closestResult;
}

export { WEAPON_DAMAGE, WEAPON_RANGE, WEAPON_COOLDOWN };
