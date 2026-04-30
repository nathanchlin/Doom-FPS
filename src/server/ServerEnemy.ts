import { resolveCircleVsAABBs, hasLineOfSight, type AABB2D } from '../shared/collision';
import type { RNG } from '../shared/maze';
import type { ServerPlayer } from './ServerPlayer';
import { PLAYER_RADIUS } from './ServerPlayer';

// ─── Enemy types ───

export type EnemyType = 'standard' | 'rusher' | 'tank' | 'patrol';
export type EnemyFSM = 'idle' | 'chase' | 'attack' | 'dead';

// ─── Per-type stats (matching config.ts exactly) ───

interface EnemyStats {
  hp: number;
  moveSpeed: number;
  engageDistance: number;
  stopDistance: number;
  attackCooldown: number;
  attackChance: number;
  attackDamage: number;
  contactDamage: number;
  contactCooldown: number;
  radius: number;
}

const STATS: Record<EnemyType, EnemyStats> = {
  standard: {
    hp: 100,
    moveSpeed: 2.8,
    engageDistance: 20,
    stopDistance: 6,
    attackCooldown: 1.2,
    attackChance: 0.7,
    attackDamage: 12,
    contactDamage: 0,
    contactCooldown: 0,
    radius: 0.6, // base radius * scale 1.0
  },
  rusher: {
    hp: 50,
    moveSpeed: 5.5,
    engageDistance: 20,
    stopDistance: 0,
    attackCooldown: 0,
    attackChance: 0,
    attackDamage: 0,
    contactDamage: 15,
    contactCooldown: 1.0,
    radius: 0.36, // 0.6 * 0.6
  },
  tank: {
    hp: 250,
    moveSpeed: 1.8,
    engageDistance: 25,
    stopDistance: 6,
    attackCooldown: 1.2,
    attackChance: 0.8,
    attackDamage: 20,
    contactDamage: 0,
    contactCooldown: 0,
    radius: 0.9, // 0.6 * 1.5
  },
  patrol: {
    hp: 300,
    moveSpeed: 2.2,
    engageDistance: 15,
    stopDistance: 5,
    attackCooldown: 1.5,
    attackChance: 0.6,
    attackDamage: 10,
    contactDamage: 0,
    contactCooldown: 0,
    radius: 0.51, // 0.6 * 0.85
  },
};

const RESPAWN_TIME = 10;

export interface EnemyUpdateResult {
  shotPlayerId: number;
  shotDamage: number;
  contactPlayerId: number;
  contactDamage: number;
}

const EMPTY_RESULT: EnemyUpdateResult = {
  shotPlayerId: -1, shotDamage: 0,
  contactPlayerId: -1, contactDamage: 0,
};

export class ServerEnemy {
  id: number;
  readonly type: EnemyType;
  private readonly stats: EnemyStats;

  // Position (XZ ground plane, Y=0)
  x: number;
  z: number;
  yaw = 0;
  hp: number;
  state: EnemyFSM = 'idle';
  targetPlayerId = -1;

  // Timers
  private attackTimer = 0;
  private contactTimer = 0;
  respawnTimer = 0;

  // Spawn point for respawning
  readonly spawnX: number;
  readonly spawnZ: number;

  constructor(id: number, x: number, z: number, type: EnemyType) {
    this.id = id;
    this.type = type;
    this.stats = STATS[type];
    this.x = x;
    this.z = z;
    this.spawnX = x;
    this.spawnZ = z;
    this.hp = this.stats.hp;
  }

  /** Main update. Returns damage events for this tick. */
  update(
    dt: number,
    players: ServerPlayer[],
    walls: AABB2D[],
    rng: RNG,
  ): EnemyUpdateResult {
    // Dead: count down respawn timer
    if (this.state === 'dead') {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.doRespawn();
      }
      return EMPTY_RESULT;
    }

    // Find nearest alive player
    let nearest: ServerPlayer | null = null;
    let nearestDist = Infinity;
    for (const p of players) {
      if (!p.alive) continue;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = p;
      }
    }

    if (!nearest) {
      this.targetPlayerId = -1;
      return EMPTY_RESULT;
    }

    this.targetPlayerId = nearest.id;

    const dx = nearest.x - this.x;
    const dz = nearest.z - this.z;
    const dist = nearestDist;

    // Face target
    this.yaw = Math.atan2(dx, dz);

    // FSM transitions
    if (this.state === 'idle' && dist < this.stats.engageDistance) {
      this.state = 'chase';
    }
    if (this.type !== 'rusher') {
      if (this.state === 'chase' && dist < this.stats.stopDistance) {
        this.state = 'attack';
      }
      if (this.state === 'attack' && dist > this.stats.stopDistance * 1.3) {
        this.state = 'chase';
      }
    }

    let shotPlayerId = -1;
    let shotDamage = 0;
    let contactPlayerId = -1;
    let contactDamage = 0;

    if (this.state === 'chase') {
      // Move toward target
      if (dist > 0.01) {
        const ndx = dx / dist;
        const ndz = dz / dist;
        const nx = this.x + ndx * this.stats.moveSpeed * dt;
        const nz = this.z + ndz * this.stats.moveSpeed * dt;
        const resolved = resolveCircleVsAABBs(nx, nz, this.stats.radius, walls);
        this.x = resolved.x;
        this.z = resolved.z;
      }

      // Rusher: contact damage when close
      if (this.type === 'rusher') {
        this.contactTimer = Math.max(0, this.contactTimer - dt);
        const contactRange = this.stats.radius + PLAYER_RADIUS + 0.2;
        if (dist < contactRange && this.contactTimer <= 0) {
          contactPlayerId = nearest.id;
          contactDamage = this.stats.contactDamage;
          this.contactTimer = this.stats.contactCooldown;
        }
      }
    } else if (this.state === 'attack') {
      // Ranged attack (standard / tank / patrol)
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = this.stats.attackCooldown;
        if (rng() < this.stats.attackChance &&
            hasLineOfSight(this.x, this.z, nearest.x, nearest.z, walls)) {
          shotPlayerId = nearest.id;
          shotDamage = this.stats.attackDamage;
        }
      }
    }

    return { shotPlayerId, shotDamage, contactPlayerId, contactDamage };
  }

  /** Apply damage. Returns true if died. */
  takeDamage(amount: number): boolean {
    if (this.state === 'dead') return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.respawnTimer = RESPAWN_TIME;
      return true;
    }
    return false;
  }

  private doRespawn(): void {
    this.x = this.spawnX;
    this.z = this.spawnZ;
    this.hp = this.stats.hp;
    this.state = 'idle';
    this.attackTimer = 0;
    this.contactTimer = 0;
    this.targetPlayerId = -1;
  }
}
