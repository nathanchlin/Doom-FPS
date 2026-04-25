import { ServerPlayer } from './ServerPlayer';
import type { TeamManager } from './TeamManager';
import type { AABB2D } from '../shared/collision';
import { hasLineOfSight } from '../shared/collision';
import { KEY } from '../shared/protocol';
import type { ServerEnemy } from './ServerEnemy';

const BOT_NAMES = ['Crash', 'Bones', 'Sarge', 'Grunt', 'Reaper', 'Havoc', 'Blitz'];

export function getBotName(index: number): string {
  return BOT_NAMES[index % BOT_NAMES.length]!;
}

/** Target can be an enemy player or a monster */
interface BotTarget {
  kind: 'player' | 'enemy';
  id: number;
  x: number;
  z: number;
  y: number; // eye-level for players, ~1.0 for enemies
  dist: number;
  priority: number; // lower = more important
}

export class BotPlayer extends ServerPlayer {
  private targetKind: 'player' | 'enemy' | 'none' = 'none';
  private targetId = -1;
  private retargetTimer = 0;
  private shootTimer = 0;
  private wanderYaw = 0;
  private wanderTimer = 0;
  private stuckTimer = 0;
  private lastX = 0;
  private lastZ = 0;

  constructor(id: number, name: string) {
    super(id, name);
    this.isBot = true;
  }

  generateInput(
    dt: number,
    allPlayers: ServerPlayer[],
    walls: AABB2D[],
    teamManager: TeamManager,
    rng: () => number,
    enemies: ServerEnemy[] = [],
  ): void {
    if (!this.alive) return;

    this.retargetTimer -= dt;
    this.shootTimer -= dt;

    // Detect stuck (hasn't moved much)
    const movedDist = Math.hypot(this.x - this.lastX, this.z - this.lastZ);
    if (movedDist < 0.05 * dt) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = this.x;
    this.lastZ = this.z;

    // Retarget periodically or if current target is gone
    if (this.retargetTimer <= 0 || this.targetId === -1) {
      this.retargetTimer = 0.8 + rng() * 0.4; // 0.8-1.2s
      this.pickBestTarget(allPlayers, teamManager, enemies, walls, rng);
    }

    // Validate current target
    const curTarget = this.resolveTarget(allPlayers, enemies);
    if (!curTarget) {
      this.pickBestTarget(allPlayers, teamManager, enemies, walls, rng);
    }

    const target = this.resolveTarget(allPlayers, enemies);
    if (!target) {
      // No targets — wander
      this.doWander(dt, rng);
      return;
    }

    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);

    // Aim at target with jitter (less jitter when closer)
    const targetYaw = Math.atan2(dx, dz);
    const jitterScale = Math.min(1.0, dist / 10);
    const jitter = (rng() - 0.5) * 0.09 * jitterScale;
    const aimYaw = targetYaw + jitter;

    // Pitch toward target
    const dy = target.y - this.y;
    const targetPitch = Math.atan2(dy, Math.max(dist, 0.1));
    const aimPitch = targetPitch + (rng() - 0.5) * 0.04;

    // Movement
    let keys = 0;

    if (dist > 2.5) {
      // Move toward target
      keys |= KEY.W;

      // Strafe to dodge and avoid getting stuck
      if (this.stuckTimer > 0.5) {
        keys |= rng() < 0.5 ? KEY.A : KEY.D;
        if (this.stuckTimer > 1.5) {
          // Try backing up if really stuck
          keys = KEY.S | (rng() < 0.5 ? KEY.A : KEY.D);
        }
      } else if (rng() < 0.15) {
        keys |= rng() < 0.5 ? KEY.A : KEY.D;
      }

      // Sprint if far
      if (dist > 8) {
        keys |= KEY.SHIFT;
      }
    } else {
      // Close range: circle-strafe
      keys |= rng() < 0.5 ? KEY.A : KEY.D;
      if (rng() < 0.3) keys |= KEY.S; // backpedal sometimes
    }

    // Shoot if in range and has LOS
    let fire = false;
    const shootRange = target.kind === 'enemy' ? 15 : 20;
    if (dist < shootRange && this.shootTimer <= 0) {
      if (hasLineOfSight(this.x, this.z, target.x, target.z, walls)) {
        fire = true;
        this.shootTimer = 0.2 + rng() * 0.3; // 0.2-0.5s between shots
      }
    }

    this.inputQueue.push({
      type: 'input', seq: 0,
      keys,
      yaw: aimYaw,
      pitch: aimPitch,
      fire,
      interact: false,
    });
  }

  private pickBestTarget(
    allPlayers: ServerPlayer[],
    teamManager: TeamManager,
    enemies: ServerEnemy[],
    walls: AABB2D[],
    rng: () => number,
  ): void {
    const candidates: BotTarget[] = [];

    // Enemy players (high priority if close)
    for (const p of allPlayers) {
      if (p.id === this.id || !p.alive) continue;
      if (teamManager.sameTeam(this.id, p.id)) continue;
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      // Priority: players with high score are juicier targets
      const scorePri = p.score > 0 ? -1 : 0;
      candidates.push({
        kind: 'player', id: p.id,
        x: p.x, z: p.z, y: p.y,
        dist: d,
        priority: d * 0.8 + scorePri * 5, // prefer closer + high-value players
      });
    }

    // Alive monsters
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.x - this.x, e.z - this.z);
      candidates.push({
        kind: 'enemy', id: e.id,
        x: e.x, z: e.z, y: 0.9, // approx enemy eye height
        dist: d,
        priority: d * 1.0, // slightly lower priority than players at same distance
      });
    }

    if (candidates.length === 0) {
      this.targetKind = 'none';
      this.targetId = -1;
      return;
    }

    // Sort by priority (with some randomness to avoid all bots targeting same thing)
    candidates.sort((a, b) => (a.priority + rng() * 3) - (b.priority + rng() * 3));

    // Prefer targets with LOS
    for (const c of candidates.slice(0, 5)) {
      if (hasLineOfSight(this.x, this.z, c.x, c.z, walls)) {
        this.targetKind = c.kind;
        this.targetId = c.id;
        return;
      }
    }

    // No LOS target, pick closest
    const best = candidates[0]!;
    this.targetKind = best.kind;
    this.targetId = best.id;
  }

  private resolveTarget(
    allPlayers: ServerPlayer[],
    enemies: ServerEnemy[],
  ): { x: number; z: number; y: number; kind: 'player' | 'enemy' } | null {
    if (this.targetKind === 'player') {
      const p = allPlayers.find(p => p.id === this.targetId && p.alive);
      if (p) return { x: p.x, z: p.z, y: p.y, kind: 'player' };
    } else if (this.targetKind === 'enemy') {
      const e = enemies.find(e => e.id === this.targetId && e.state !== 'dead');
      if (e) return { x: e.x, z: e.z, y: 0.9, kind: 'enemy' };
    }
    return null;
  }

  private doWander(dt: number, rng: () => number): void {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderYaw = this.yaw + (rng() - 0.5) * 1.5;
      this.wanderTimer = 1.5 + rng() * 2;
    }

    this.inputQueue.push({
      type: 'input', seq: 0,
      keys: KEY.W,
      yaw: this.wanderYaw,
      pitch: 0,
      fire: false,
      interact: false,
    });
  }
}
