import { ServerPlayer } from './ServerPlayer';
import type { TeamManager } from './TeamManager';
import type { AABB2D } from '../shared/collision';
import { hasLineOfSight } from '../shared/collision';
import { KEY } from '../shared/protocol';

const BOT_NAMES = ['Crash', 'Bones', 'Sarge', 'Grunt', 'Reaper', 'Havoc', 'Blitz'];

export function getBotName(index: number): string {
  return BOT_NAMES[index % BOT_NAMES.length]!;
}

export class BotPlayer extends ServerPlayer {
  private targetId = -1;
  private retargetTimer = 0;
  private shootTimer = 0;

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
  ): void {
    if (!this.alive) return;

    this.retargetTimer -= dt;
    this.shootTimer -= dt;

    // Retarget every 1 second
    if (this.retargetTimer <= 0 || this.targetId === -1) {
      this.retargetTimer = 1.0;
      this.targetId = this.pickTarget(allPlayers, teamManager);
    }

    // Check target still valid
    const target = allPlayers.find(p => p.id === this.targetId && p.alive);
    if (!target) {
      this.targetId = this.pickTarget(allPlayers, teamManager);
      const newTarget = allPlayers.find(p => p.id === this.targetId && p.alive);
      if (!newTarget) {
        // No targets — wander
        this.inputQueue.push({
          type: 'input', seq: 0,
          keys: KEY.W,
          yaw: this.yaw + (rng() - 0.5) * 0.2,
          pitch: 0,
          fire: false, interact: false,
        });
        return;
      }
    }

    const t = allPlayers.find(p => p.id === this.targetId && p.alive);
    if (!t) return;

    const dx = t.x - this.x;
    const dz = t.z - this.z;
    const dist = Math.hypot(dx, dz);

    // Aim at target with jitter
    const targetYaw = Math.atan2(dx, dz);
    const jitter = (rng() - 0.5) * 0.09; // ±~5 degrees
    const aimYaw = targetYaw + jitter;

    // Pitch toward target (approximate)
    const dy = (t.y) - this.y;
    const targetPitch = Math.atan2(dy, Math.max(dist, 0.1));
    const aimPitch = targetPitch + (rng() - 0.5) * 0.05;

    // Movement: move toward target
    let keys = KEY.W; // always move forward (toward where we're facing)

    // Strafe occasionally
    if (rng() < 0.3) {
      keys |= rng() < 0.5 ? KEY.A : KEY.D;
    }

    // Sprint if far
    if (dist > 10) {
      keys |= KEY.SHIFT;
    }

    // Shoot if close enough and has LOS
    let fire = false;
    if (dist < 20 && this.shootTimer <= 0) {
      if (hasLineOfSight(this.x, this.z, t.x, t.z, walls)) {
        fire = true;
        this.shootTimer = 0.3 + rng() * 0.4; // 0.3-0.7s between shots
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

  private pickTarget(allPlayers: ServerPlayer[], teamManager: TeamManager): number {
    let nearest = -1;
    let nearestDist = Infinity;
    for (const p of allPlayers) {
      if (p.id === this.id || !p.alive) continue;
      if (teamManager.sameTeam(this.id, p.id)) continue;
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p.id;
      }
    }
    return nearest;
  }
}
