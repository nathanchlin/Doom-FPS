/**
 * Global game configuration — tweak these to rebalance the MVP.
 */

export const CONFIG = {
  // Player
  player: {
    height: 1.75,         // eye height in world units (1 unit = 1 meter)
    radius: 0.4,
    moveSpeed: 6.0,       // m/s walking
    sprintSpeed: 10.0,    // m/s with Shift
    jumpVelocity: 6.2,    // initial jump velocity
    gravity: 22.0,        // m/s^2
    maxHealth: 100,
    maxAmmo: 30,
    damageTakenPerHit: 12,
  },

  // Weapon
  weapon: {
    fireRate: 0.14,       // seconds between shots
    damage: 34,           // hitscan damage per shot
    recoilKick: 0.05,     // radians pitched up per shot
    recoilRecover: 8.0,   // recovery speed
    muzzleFlashDuration: 0.05,
    maxRange: 80,
  },

  // Enemy
  enemy: {
    count: 6,             // spawn count
    radius: 0.6,
    height: 1.9,
    health: 100,
    moveSpeed: 2.8,
    attackRange: 18,
    attackCooldown: 1.2,  // seconds between enemy shots
    attackChance: 0.7,    // accuracy (0..1)
    engageDistance: 20,   // starts moving toward player within this
    stopDistance: 6,      // stops moving and shoots from here
  },

  // World
  world: {
    size: 60,             // square arena edge length (m)
    wallHeight: 4.5,
  },

  // Rendering
  render: {
    fov: 78,
    near: 0.05,
    far: 200,
    fogDensity: 0.004,
  },

  // Colors — bright white scene with black outlines
  colors: {
    floor: 0xf5f5f5,
    wall: 0xe8e8e8,
    wallAccent: 0xdddddd,
    ceiling: 0xfafafa,
    player: 0x4ade80,
    enemy: 0xf0f0f0,
    enemyDead: 0xcccccc,
    bullet: 0xff6600,
    muzzleFlash: 0xffcc55,
    light1: 0xffffff,
    light2: 0xffffff,
    fog: 0xf0f0f0,
    pickupAmmo: 0xf59e0b,
    pickupHealth: 0x4ade80,
  },
} as const;
