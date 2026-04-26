/**
 * Global game configuration — tweak these to rebalance.
 */

export const CONFIG = {
  // Player
  player: {
    height: 1.75,
    radius: 0.4,
    moveSpeed: 6.0,
    sprintSpeed: 10.0,
    jumpVelocity: 6.2,
    gravity: 22.0,
    maxHealth: 100,
    maxAmmo: 30,
    damageTakenPerHit: 12,
  },

  // Weapon
  weapon: {
    fireRate: 0.14,
    damage: 34,
    recoilKick: 0.05,
    recoilRecover: 8.0,
    muzzleFlashDuration: 0.05,
    maxRange: 80,
  },

  // Enemy base stats (before type multipliers)
  enemy: {
    radius: 0.6,
    height: 1.9,
    // Type-specific overrides
    types: {
      standard: {
        health: 100,
        moveSpeed: 2.8,
        attackCooldown: 1.2,
        attackChance: 0.7,
        attackDamage: 12,
        engageDistance: 20,
        stopDistance: 6,
        color: 0xf0f0f0,
        scale: 1.0,
      },
      rusher: {
        health: 50,
        moveSpeed: 5.5,
        contactDamage: 15,
        contactCooldown: 1.0,
        engageDistance: 20,
        color: 0xcc3333,
        scale: 0.6,
      },
      tank: {
        health: 250,
        moveSpeed: 1.8,
        attackCooldown: 1.2,
        attackChance: 0.8,
        attackDamage: 20,
        engageDistance: 25,
        stopDistance: 6,
        color: 0x666666,
        scale: 1.5,
      },
      patrol: {
        health: 300,
        moveSpeed: 2.2,
        attackCooldown: 1.5,
        attackChance: 0.6,
        attackDamage: 10,
        engageDistance: 15,
        stopDistance: 5,
        color: 0x664488,
        scale: 0.85,
      },
    },
    // Per-floor scaling
    scaling: {
      hpPerFloor: 0.1,      // base × (1 + 0.1 × floor)
      damagePerFloor: 0.08,  // base × (1 + 0.08 × floor)
    },
  },

  // Maze generation
  maze: {
    cellSize: 6,           // meters per cell
    wallThickness: 0.5,
    baseGridSize: 8,       // floor 1 = 8×8
    maxGridSize: 14,        // cap
    minDeadEnds: 3,        // regenerate if fewer
  },

  // Doors
  door: {
    baseDoorCount: 5,
    maxDoorCount: 8,
    interactDistance: 2.0,
    // Probabilities (before exit assignment)
    combatChance: 0.765,   // 65 / (65+20) for non-exit doors
    treasureChance: 0.235, // 20 / (65+20)
    width: 1.4,
    height: 3.0,
    frameColor: 0x333333,
    glowColor: 0x88aaff,
    usedColor: 0x999999,
    exitGlowColor: 0x44ff88,
  },

  // Rooms
  room: {
    size: 12,              // 12×12 meters
    wallHeight: 4.5,
    coverCount: { min: 1, max: 2 },  // low walls in combat rooms
    coverHeight: 1.5,
    // Enemy count per floor tier
    enemyCount: {
      tier1: { min: 2, max: 3 },   // floor 1-2
      tier2: { min: 3, max: 4 },   // floor 3-4
      tier3: { min: 3, max: 5 },   // floor 5+
    },
    tankUnlockFloor: 3,
    maxTanksTier2: 1,
    maxTanksTier3: 2,
  },

  // Chest
  chest: {
    ammoChance: 0.7,
    ammoMin: 10,
    ammoMax: 20,
    healthChance: 0.5,
    healthMin: 20,
    healthMax: 40,
    color: 0xdaa520,         // gold
    emissiveColor: 0xdaa520,
    emissiveIntensity: 0.8,
  },

  // World
  world: {
    wallHeight: 4.5,
  },

  // Rendering
  render: {
    fov: 78,
    near: 0.05,
    far: 200,
    fogDensity: 0.004,
  },

  // Transition
  transition: {
    fadeDuration: 0.3,     // seconds
    floorDisplayDuration: 1.5,
  },

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

  // Floor hazards
  hazard: {
    damage: 15,        // HP per second
    size: 3,           // 3m × 3m
    baseCount: 3,      // floor 1 count
    maxCount: 12,
    color: 0xdd0000,
    emissiveColor: 0xaa0000,
    emissiveIntensity: 0.8,
  },

  // Colors
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

  // Touch controls (mobile)
  touch: {
    moveDeadzone: 15,        // Movement joystick deadzone (px)
    lookSensitivity: 0.4,    // Look sensitivity (lower than mouse 0.0022)
    jumpSwipeThreshold: 80,  // Swipe-up jump threshold (px)
    joystickRadius: 50,      // Joystick visual radius (px)
    buttonSize: 48,          // Action button size (px)
  },
} as const;
