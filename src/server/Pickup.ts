export interface ServerPickup {
  id: number;
  x: number;
  z: number;
  kind: 'health' | 'ammo';
  active: boolean;
  respawnTimer: number;
}

// ─── Constants ───

export const HEALTH_AMOUNT = 25;
export const AMMO_AMOUNT = 15;
const PICKUP_RESPAWN_TIME = 30;
const CLAIM_RANGE = 2.0;

/**
 * Create initial pickups from corridor cells.
 * Places 3 health + 3 ammo at evenly spaced intervals through corridors.
 */
export function createPickups(
  corridorCells: Array<{ x: number; z: number }>,
): ServerPickup[] {
  const pickups: ServerPickup[] = [];
  if (corridorCells.length === 0) return pickups;

  const total = 6; // 3 health + 3 ammo
  const step = Math.max(1, Math.floor(corridorCells.length / (total + 1)));
  let nextId = 0;

  for (let i = 0; i < 3; i++) {
    const idx = Math.min((i + 1) * step, corridorCells.length - 1);
    const cell = corridorCells[idx]!;
    pickups.push({
      id: nextId++,
      x: cell.x,
      z: cell.z,
      kind: 'health',
      active: true,
      respawnTimer: 0,
    });
  }

  for (let i = 0; i < 3; i++) {
    const idx = Math.min((i + 4) * step, corridorCells.length - 1);
    const cell = corridorCells[idx]!;
    pickups.push({
      id: nextId++,
      x: cell.x,
      z: cell.z,
      kind: 'ammo',
      active: true,
      respawnTimer: 0,
    });
  }

  return pickups;
}

/**
 * Update pickup respawn timers. Returns IDs of newly respawned pickups.
 */
export function updatePickups(pickups: ServerPickup[], dt: number): number[] {
  const respawned: number[] = [];
  for (const p of pickups) {
    if (!p.active && p.respawnTimer > 0) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        p.active = true;
        p.respawnTimer = 0;
        respawned.push(p.id);
      }
    }
  }
  return respawned;
}

/**
 * Try to claim a pickup near the player position.
 * Returns the claimed pickup, or null.
 */
export function tryClaimPickup(
  pickups: ServerPickup[],
  playerX: number,
  playerZ: number,
): ServerPickup | null {
  for (const p of pickups) {
    if (!p.active) continue;
    const dx = playerX - p.x;
    const dz = playerZ - p.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < CLAIM_RANGE * CLAIM_RANGE) {
      p.active = false;
      p.respawnTimer = PICKUP_RESPAWN_TIME;
      return p;
    }
  }
  return null;
}
