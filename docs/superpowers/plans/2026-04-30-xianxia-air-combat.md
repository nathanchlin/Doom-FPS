# XianxiaAirCombat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Doom-FPS into a 3D xianxia air combat game with 6DOF flight, dual camera system, three-weapon combat, wave-based enemies with boss fights, and floating palace arenas.

**Architecture:** Fork Doom-FPS and heavily refactor. Keep Engine.ts render loop, Input.ts base, Sfx.ts primitives, collision.ts math, and Vite+TS build config. Rewrite Player -> FlightController (6DOF physics), Level -> Arena (floating buildings), Enemy -> air combat AI with behavior tree, Weapon -> WeaponSystem (beam/missile/sword). Add CameraSystem (3rd/1st person toggle), PlayerModel (3rd person character), Boss (multi-phase). Delete all multiplayer, maze, room, door, chest, card, hazard code.

**Tech Stack:** Three.js, TypeScript, Vite, Web Audio API, pnpm

**Design Spec:** `docs/superpowers/specs/2026-04-29-xianxia-air-combat-design.md`

---

## Phase 1: Project Cleanup & New Config

### Task 1: Delete Multiplayer & Unused Files

**Files:**
- Delete: `src/client/NetClient.ts`
- Delete: `src/client/Interpolation.ts`
- Delete: `src/client/RemotePlayer.ts`
- Delete: `src/client/MultiplayerHud.ts`
- Delete: `src/client/LobbyUI.ts`
- Delete: `src/server/GameServer.ts`
- Delete: `src/server/ServerEnemy.ts`
- Delete: `src/server/ServerPlayer.ts`
- Delete: `src/server/ServerWeapon.ts`
- Delete: `src/server/TeamManager.ts`
- Delete: `src/server/Lobby.ts`
- Delete: `src/server/BotPlayer.ts`
- Delete: `src/server/Pickup.ts`
- Delete: `src/server/main.ts`
- Delete: `src/shared/protocol.ts`
- Delete: `src/shared/maze.ts`
- Delete: `src/Maze.ts`
- Delete: `src/Room.ts`
- Delete: `src/Door.ts`
- Delete: `src/Chest.ts`
- Delete: `src/CardPicker.ts`
- Delete: `src/Hazard.ts`
- Delete: `src/weapons.ts`
- Delete: `src/Weapon.ts`
- Delete: `src/WeaponModel.ts`
- Delete: `src/Player.ts`
- Delete: `src/Level.ts`
- Delete: `src/Enemy.ts`
- Delete: `src/TouchControls.ts`
- Delete: `src/touch-ui.ts`
- Delete: `vite.server.config.ts` (if exists)
- Delete: `dist-server/` (if exists)
- Modify: `package.json` — remove `ws`, `@types/ws`, `tsx` deps and server scripts

- [ ] **Step 1: Delete all multiplayer files**

```bash
rm -rf src/client/ src/server/ src/shared/protocol.ts src/shared/maze.ts
```

- [ ] **Step 2: Delete maze/room/door/chest/card/hazard/weapon/player/enemy files**

```bash
rm -f src/Maze.ts src/Room.ts src/Door.ts src/Chest.ts src/CardPicker.ts src/Hazard.ts
rm -f src/weapons.ts src/Weapon.ts src/WeaponModel.ts src/Player.ts src/Level.ts src/Enemy.ts
rm -f src/TouchControls.ts src/touch-ui.ts
```

- [ ] **Step 3: Delete server build artifacts and config**

```bash
rm -rf dist-server/
rm -f vite.server.config.ts
```

- [ ] **Step 4: Update package.json — remove multiplayer deps and scripts**

Remove the `ws` dependency, `@types/ws` and `tsx` devDependencies, and the `host`, `build:server`, `start` scripts. Keep `three`, `@types/three`, `typescript`, `vite`.

Result `package.json`:
```json
{
  "name": "xianxia-air-combat",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "3D xianxia air combat game built with Three.js + TypeScript + Vite.",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/three": "^0.184.0",
    "typescript": "~6.0.2",
    "vite": "^8.0.10"
  },
  "dependencies": {
    "three": "^0.184.0"
  }
}
```

- [ ] **Step 5: Create placeholder files so the project structure compiles**

Create empty stub files so `pnpm build` won't error on missing imports. These will be filled in subsequent tasks.

Create `src/player/FlightController.ts`:
```typescript
import * as THREE from 'three';

export class FlightController {
  readonly position = new THREE.Vector3(0, 60, 0);
  readonly velocity = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  hp = 100;
  alive = true;
  update(_dt: number): void {}
  dispose(): void {}
}
```

Create `src/core/CameraSystem.ts`:
```typescript
import * as THREE from 'three';

export class CameraSystem {
  readonly camera: THREE.PerspectiveCamera;
  constructor(camera: THREE.PerspectiveCamera) { this.camera = camera; }
  update(_dt: number): void {}
  dispose(): void {}
}
```

Create `src/world/Arena.ts`:
```typescript
import * as THREE from 'three';

export interface ArenaCollider {
  resolveSpherVsBuildings(x: number, y: number, z: number, radius: number): { x: number; y: number; z: number };
}

export class Arena implements ArenaCollider {
  readonly group = new THREE.Group();
  resolveSpherVsBuildings(x: number, y: number, z: number, _radius: number): { x: number; y: number; z: number } {
    return { x, y, z };
  }
  dispose(scene: THREE.Scene): void { scene.remove(this.group); }
}
```

- [ ] **Step 6: Rewrite Game.ts as minimal shell**

Replace the entire `src/Game.ts` with a minimal orchestrator that just boots the engine:

```typescript
import { Engine } from './Engine';
import { Input } from './Input';
import { Sfx } from './Sfx';

export type GameState = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'level_complete' | 'game_over';

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly sfx: Sfx;

  private state: GameState = 'menu';

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.renderer.domElement);
    this.sfx = new Sfx();
    this.engine.addUpdater((dt) => this.update(dt));
  }

  start(): void {
    this.state = 'playing';
    this.sfx.unlock();
    this.input.requestPointerLock();
    this.engine.start();
  }

  private update(_dt: number): void {
    if (this.state !== 'playing') return;
    // Subsystems will be wired here in later tasks
  }

  dispose(): void {
    this.input.dispose();
    this.engine.dispose();
  }
}
```

- [ ] **Step 7: Rewrite main.ts as minimal entry**

Replace `src/main.ts`:
```typescript
import './style.css';
import { Game } from './Game';

const container = document.getElementById('game')!;
const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;

const game = new Game(container);

startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  game.start();
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement == null) {
    overlay.style.display = 'flex';
    startBtn.textContent = '点击继续';
  } else {
    overlay.style.display = 'none';
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
```

- [ ] **Step 8: Update index.html — simplify to minimal HUD**

Strip the old HUD DOM elements, keep only the essential overlay. The new HUD will be built in a later task.

- [ ] **Step 9: Verify build compiles**

```bash
pnpm install && pnpm typecheck
```

Expected: 0 errors. If errors exist, fix missing imports/references.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: strip multiplayer, maze, room, card systems — clean slate for xianxia air combat"
```

---

### Task 2: Write New Config

**Files:**
- Rewrite: `src/config.ts`

- [ ] **Step 1: Replace config.ts with full xianxia air combat config**

```typescript
/**
 * Global game configuration for XianxiaAirCombat.
 * All tunable parameters in one place. Hot-reloads via Vite HMR.
 */
export const CONFIG = {
  // ─── Flight Physics ───
  flight: {
    maxThrust: 80,
    maxSpeed: 120,
    drag: 0.98,
    angularThrust: 3.0,
    maxAngularSpeed: 2.5,
    angularDrag: 0.92,
    boostMultiplier: 2.0,
    boostDuration: 3.0,
    boostCooldown: 5.0,
    playerRadius: 0.8,
    // Height limits
    minHeight: -50,
    maxHeight: 200,
    heightDragStart: 180,
    // Arena boundary
    boundaryRadius: 500,
    boundaryDragWidth: 30,
  },

  // ─── Camera ───
  camera: {
    // Third person
    thirdPersonDistance: 8,
    thirdPersonHeight: 3,
    springStiffness: 6.0,
    springDamping: 4.0,
    // First person (no offset)
    // Transition
    transitionDuration: 0.4,
    fov: 78,
    near: 0.1,
    far: 800,
  },

  // ─── Spirit (Mana) ───
  spirit: {
    maxSpirit: 100,
    regenRate: 5,
    beamCost: 3,
    dashCost: 15,
  },

  // ─── Weapons ───
  weapons: {
    beam: {
      name: '灵力射线',
      damage: 25,
      fireRate: 0.12,
      maxRange: 150,
      spiritCost: 3,
      color: 0x88ccff,
    },
    missile: {
      name: '符箓追踪弹',
      damage: 45,
      aoeRadius: 3,
      fireRate: 0.5,
      maxInFlight: 4,
      maxRange: 200,
      trackDuration: 5,
      lockAngle: Math.PI / 36, // 5 degrees
      lockTime: 1.0,
      initialAmmo: 8,
      color: 0xffcc00,
    },
    sword: {
      name: '飞剑近战',
      damage: 80,
      dashDistance: 15,
      dashDuration: 0.2,
      cooldown: 2.0,
      invincibleDuration: 0.3,
      spiritCost: 15,
      color: 0x00ffcc,
    },
  },

  // ─── Player ───
  player: {
    maxHealth: 100,
    startHeight: 80,
  },

  // ─── Enemies ───
  enemies: {
    types: {
      crow: {
        name: '灵鸦',
        hp: 30,
        speed: 25,
        attackDamage: 10,
        attackType: 'fireball' as const,
        color: 0x222222,
        scale: 0.5,
        groupSize: { min: 3, max: 5 },
      },
      serpent: {
        name: '岩蟒',
        hp: 120,
        speed: 15,
        attackDamage: 25,
        attackType: 'breath' as const,
        breathAngle: Math.PI / 6,
        color: 0x886644,
        scale: 1.5,
      },
      dragon: {
        name: '蛟龙',
        hp: 300,
        speed: 40,
        attackDamage: 35,
        chargeDamage: 50,
        attackType: 'dragonbreath' as const,
        color: 0x2244aa,
        scale: 2.5,
      },
    },
    scaling: {
      hpPerLevel: 0.15,
      damagePerLevel: 0.10,
      speedPerLevel: 0.03,
    },
    engageDistance: 80,
    fleeHpPercent: 0.2,
    avoidDistance: 15,
  },

  // ─── Boss ───
  boss: {
    baseHp: 800,
    phase1Threshold: 0.6,
    phase2Threshold: 0.3,
    phase2SpeedBoost: 1.5,
    phase3SpeedBoost: 1.3,
    summonCount: 2,
    shieldHp: 200,
    color: 0xcc00ff,
  },

  // ─── Arena ───
  arena: {
    levelConfigs: [
      { buildings: 8, bridges: 3, islands: 5, spread: 200, skyTint: '#0a0a3e' },
      { buildings: 12, bridges: 5, islands: 8, spread: 300, skyTint: '#1a0a2e' },
      { buildings: 15, bridges: 6, islands: 10, spread: 400, skyTint: '#2a1a1e' },
    ] as Array<{ buildings: number; bridges: number; islands: number; spread: number; skyTint: string }>,
    skyTintPresets: ['#0a0a3e', '#1a0a2e', '#2a1a1e', '#0a1a2e'],
    buildingMinGap: 20,
    heightRange: [30, 120] as [number, number],
    islandRadius: [1, 3] as [number, number],
    buildingsPerLevel: 2,
    spreadPerLevel: 30,
    // Visual
    bodyColor: 0xf0f0f0,
    accentColor: 0xdaa520,
    fogDensity: 0.008,
    cloudHeight: 0,
  },

  // ─── Pickups ───
  pickups: {
    spiritOrb: { color: 0x4488ff, value: 30 },
    healthPill: { color: 0x44ff88, value: 25 },
    missileBox: { color: 0xffcc00, value: 2 },
  },

  // ─── Progression ───
  progression: {
    totalLevels: 12,
    bossLevels: [3, 6, 9, 12],
    wavesPerLevel: 3,
    waveRestTime: 5,
    scaling: {
      hpPerLevel: 1.15,
      damagePerLevel: 1.10,
      enemyCountBase: 3,
      enemyCountPerLevel: 0.5,
      speedPerLevel: 1.03,
    },
    arenaScaling: {
      buildingsPerLevel: 2,
      spreadPerLevel: 30,
    },
    unlocks: [
      { level: 3, type: 'weapon', id: 'missile' },
      { level: 6, type: 'upgrade', id: 'missile_dual_lock' },
      { level: 9, type: 'upgrade', id: 'beam_pierce' },
      { level: 12, type: 'upgrade', id: 'sword_enhanced' },
    ] as Array<{ level: number; type: string; id: string }>,
  },

  // ─── Rendering ───
  render: {
    fov: 78,
    near: 0.1,
    far: 800,
    fogColor: 0x0a0a2e,
    fogDensity: 0.003,
    ambientColor: 0x8888cc,
    ambientIntensity: 0.6,
    moonColor: 0xffffff,
    moonIntensity: 1.2,
  },

  // ─── HUD ───
  hud: {
    radarRadius: 200,
    radarSize: 150,
  },
} as const;
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add xianxia air combat game config with flight, weapons, enemies, arena parameters"
```

---

## Phase 2: Core Flight & Camera

### Task 3: FlightController — 6DOF Physics

**Files:**
- Create: `src/player/FlightController.ts`
- Modify: `src/Input.ts` (add Q/E roll keys)

- [ ] **Step 1: Add Q/E roll input support to Input.ts**

In `src/Input.ts`, no code changes needed — `isDown('q')` and `isDown('e')` already work because the `keys` Set stores all pressed keys. The existing Input class is sufficient for flight controls.

Verify by checking: `input.isDown('q')` returns true when Q is held. This works because `handleKeyDown` adds `e.key.toLowerCase()` to the set.

- [ ] **Step 2: Implement FlightController**

Replace `src/player/FlightController.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Input } from '../Input';

/**
 * FlightController — 6DOF physics flight with thrust, drag, angular velocity.
 * Uses quaternion-based orientation for gimbal-lock-free rotation.
 *
 * Per-frame:
 * 1. Collect input → 6 thrust axes + 3 rotation axes
 * 2. Apply thrust in local frame → convert to world acceleration
 * 3. Integrate velocity (with drag) → position
 * 4. Apply angular thrust → angular velocity → quaternion rotation
 * 5. Boundary/height clamping
 */
export class FlightController {
  readonly position = new THREE.Vector3(0, CONFIG.player.startHeight, 0);
  readonly velocity = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  readonly angularVelocity = new THREE.Vector3(); // local-space rad/s (pitch, yaw, roll)

  hp = CONFIG.player.maxHealth;
  spirit = CONFIG.spirit.maxSpirit;
  alive = true;

  // Boost state
  private boostActive = false;
  private boostTimer = 0;
  private boostCooldownTimer = 0;

  // Sword dash state (set by WeaponSystem, read by Game for invincibility)
  dashing = false;
  dashInvincible = false;

  private readonly mouseSens = 0.002;

  constructor(private readonly input: Input) {}

  /** Get the forward direction (local -Z in world space). */
  getForward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
  }

  /** Get the right direction (local +X in world space). */
  getRight(): THREE.Vector3 {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
  }

  /** Get the up direction (local +Y in world space). */
  getUp(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
  }

  getSpeed(): number {
    return this.velocity.length();
  }

  getAltitude(): number {
    return this.position.y;
  }

  /** Attempt to activate boost. Returns true if activated. */
  tryBoost(): boolean {
    if (this.boostActive || this.boostCooldownTimer > 0) return false;
    this.boostActive = true;
    this.boostTimer = CONFIG.flight.boostDuration;
    return true;
  }

  /** Consume spirit energy. Returns false if insufficient. */
  consumeSpirit(amount: number): boolean {
    if (this.spirit < amount) return false;
    this.spirit -= amount;
    return true;
  }

  takeDamage(amount: number): boolean {
    if (!this.alive || this.dashInvincible) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.alive = false;
      return true; // died
    }
    return false;
  }

  update(dt: number): void {
    if (!this.alive) return;

    const cfg = CONFIG.flight;

    // ─── Spirit regen ───
    this.spirit = Math.min(CONFIG.spirit.maxSpirit, this.spirit + CONFIG.spirit.regenRate * dt);

    // ─── Boost management ───
    if (this.boostActive) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.boostActive = false;
        this.boostCooldownTimer = cfg.boostCooldown;
      }
    }
    if (this.boostCooldownTimer > 0) {
      this.boostCooldownTimer -= dt;
    }

    const thrustMult = this.boostActive ? cfg.boostMultiplier : 1.0;

    // ─── Collect thrust input (local frame) ───
    let thrustX = 0, thrustY = 0, thrustZ = 0;
    if (this.input.isDown('w')) thrustZ -= 1; // forward = -Z local
    if (this.input.isDown('s')) thrustZ += 1;
    if (this.input.isDown('a')) thrustX -= 1;
    if (this.input.isDown('d')) thrustX += 1;
    if (this.input.isDown(' ')) thrustY += 1; // up
    if (this.input.isDown('shift')) thrustY -= 1; // down

    // Normalize if multiple axes
    const thrustLen = Math.hypot(thrustX, thrustY, thrustZ);
    if (thrustLen > 1) {
      thrustX /= thrustLen;
      thrustY /= thrustLen;
      thrustZ /= thrustLen;
    }

    // Convert local thrust to world acceleration
    const localThrust = new THREE.Vector3(thrustX, thrustY, thrustZ);
    localThrust.multiplyScalar(cfg.maxThrust * thrustMult);
    const worldAccel = localThrust.applyQuaternion(this.quaternion);

    // ─── Integrate linear velocity ───
    this.velocity.add(worldAccel.multiplyScalar(dt));

    // Drag
    this.velocity.multiplyScalar(Math.pow(cfg.drag, dt * 60)); // frame-rate independent drag

    // Clamp speed
    const speed = this.velocity.length();
    const maxSpd = cfg.maxSpeed * thrustMult;
    if (speed > maxSpd) {
      this.velocity.multiplyScalar(maxSpd / speed);
    }

    // ─── Integrate position ───
    this.position.addScaledVector(this.velocity, dt);

    // ─── Rotation from mouse input ───
    const { dx, dy } = this.input.consumeMouseDelta();
    // Yaw (mouse X) and Pitch (mouse Y) as angular impulse
    let pitchInput = -dy * this.mouseSens; // mouse up = pitch up
    let yawInput = -dx * this.mouseSens;   // mouse left = yaw left
    let rollInput = 0;
    if (this.input.isDown('q')) rollInput += cfg.angularThrust * dt;
    if (this.input.isDown('e')) rollInput -= cfg.angularThrust * dt;

    // Apply angular velocity in local frame (pitch=X, yaw=Y, roll=Z)
    this.angularVelocity.x += pitchInput * cfg.angularThrust;
    this.angularVelocity.y += yawInput * cfg.angularThrust;
    this.angularVelocity.z += rollInput;

    // Angular drag
    this.angularVelocity.multiplyScalar(Math.pow(cfg.angularDrag, dt * 60));

    // Clamp angular speed
    const angSpeed = this.angularVelocity.length();
    if (angSpeed > cfg.maxAngularSpeed) {
      this.angularVelocity.multiplyScalar(cfg.maxAngularSpeed / angSpeed);
    }

    // Apply rotation as incremental quaternion
    const angDelta = this.angularVelocity.clone().multiplyScalar(dt);
    const dq = new THREE.Quaternion();
    // Local-space rotation: pitch around local X, yaw around local Y, roll around local Z
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angDelta.x);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angDelta.y);
    const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angDelta.z);
    dq.multiply(yawQ).multiply(pitchQ).multiply(rollQ);
    this.quaternion.multiply(dq);
    this.quaternion.normalize();

    // ─── Boundary enforcement ───
    this.enforceBounds();
  }

  private enforceBounds(): void {
    const cfg = CONFIG.flight;

    // Height limits
    if (this.position.y < cfg.minHeight) {
      this.position.y = cfg.minHeight;
      this.velocity.y = Math.max(0, this.velocity.y);
    }
    if (this.position.y > cfg.maxHeight) {
      // Soft ceiling: increase drag above heightDragStart
      const over = this.position.y - cfg.heightDragStart;
      if (over > 0) {
        const factor = 1 - Math.min(0.95, over / (cfg.maxHeight - cfg.heightDragStart));
        this.velocity.y *= factor;
      }
      if (this.position.y > cfg.maxHeight) {
        this.position.y = cfg.maxHeight;
        this.velocity.y = Math.min(0, this.velocity.y);
      }
    }

    // Circular arena boundary
    const distXZ = Math.hypot(this.position.x, this.position.z);
    const boundaryStart = cfg.boundaryRadius - cfg.boundaryDragWidth;
    if (distXZ > boundaryStart) {
      const penetration = distXZ - boundaryStart;
      const factor = 1 - Math.min(0.95, penetration / cfg.boundaryDragWidth);
      // Push velocity inward
      const nx = this.position.x / distXZ;
      const nz = this.position.z / distXZ;
      const outward = this.velocity.x * nx + this.velocity.z * nz;
      if (outward > 0) {
        this.velocity.x -= nx * outward * (1 - factor);
        this.velocity.z -= nz * outward * (1 - factor);
      }
      // Hard clamp at boundary
      if (distXZ > cfg.boundaryRadius) {
        this.position.x = nx * cfg.boundaryRadius;
        this.position.z = nz * cfg.boundaryRadius;
      }
    }
  }

  /** Teleport to position, reset velocity. */
  teleportTo(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  dispose(): void {
    // No GPU resources to clean up
  }
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/player/FlightController.ts src/Input.ts
git commit -m "feat: implement 6DOF FlightController with thrust, drag, quaternion rotation, boundary enforcement"
```

---

### Task 4: CameraSystem — Dual Camera with Spring-Damper

**Files:**
- Create: `src/core/CameraSystem.ts`

- [ ] **Step 1: Implement CameraSystem**

Replace `src/core/CameraSystem.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightController } from '../player/FlightController';

export type CameraMode = 'third_person' | 'first_person';

/**
 * CameraSystem — dual-mode camera with smooth transitions.
 *
 * Third-person: Spring-damper follow behind and above the player.
 * First-person: Camera at player position, looking along player forward.
 * V key toggles with 0.4s smooth interpolation.
 */
export class CameraSystem {
  readonly camera: THREE.PerspectiveCamera;
  private mode: CameraMode = 'third_person';
  private transitioning = false;
  private transitionProgress = 0; // 0 = current mode settled, goes to 1 during transition

  // Spring-damper state for third-person
  private idealOffset = new THREE.Vector3();
  private currentOffset = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  isTransitioning(): boolean {
    return this.transitioning;
  }

  toggleMode(): void {
    if (this.transitioning) return;
    this.mode = this.mode === 'third_person' ? 'first_person' : 'third_person';
    this.transitioning = true;
    this.transitionProgress = 0;
  }

  update(dt: number, flight: FlightController): void {
    const cfg = CONFIG.camera;

    // Calculate target positions for both modes
    const playerPos = flight.position;
    const playerQuat = flight.quaternion;

    // Third-person: offset behind and above in player's local frame
    const thirdOffset = new THREE.Vector3(0, cfg.thirdPersonHeight, cfg.thirdPersonDistance);
    thirdOffset.applyQuaternion(playerQuat);
    const thirdTarget = playerPos.clone().add(thirdOffset);
    const thirdLookAt = playerPos.clone();

    // First-person: at player position, looking forward
    const firstTarget = playerPos.clone();
    const firstLookAt = playerPos.clone().add(flight.getForward().multiplyScalar(10));

    // Handle transition
    if (this.transitioning) {
      this.transitionProgress += dt / cfg.transitionDuration;
      if (this.transitionProgress >= 1) {
        this.transitionProgress = 1;
        this.transitioning = false;
      }
    }

    // Smooth ease-in-out
    const t = this.transitioning ? this.easeInOut(this.transitionProgress) : 1;

    let targetPos: THREE.Vector3;
    let lookAt: THREE.Vector3;

    if (this.mode === 'third_person') {
      if (this.transitioning) {
        // Transitioning TO third-person: interpolate from first-person
        targetPos = firstTarget.lerp(thirdTarget, t);
        lookAt = firstLookAt.lerp(thirdLookAt, t);
      } else {
        targetPos = thirdTarget;
        lookAt = thirdLookAt;
      }
    } else {
      if (this.transitioning) {
        // Transitioning TO first-person: interpolate from third-person
        targetPos = thirdTarget.lerp(firstTarget, t);
        lookAt = thirdLookAt.lerp(firstLookAt, t);
      } else {
        targetPos = firstTarget;
        lookAt = firstLookAt;
      }
    }

    // Spring-damper follow (smooths out jitter in third-person)
    if (this.mode === 'third_person' && !this.transitioning) {
      const stiffness = cfg.springStiffness;
      const damping = cfg.springDamping;
      // Spring force toward target
      const diff = targetPos.clone().sub(this.camera.position);
      const springForce = diff.multiplyScalar(stiffness * dt);
      this.camera.position.add(springForce);
      // Smooth lookAt
      this.currentLookAt.lerp(lookAt, Math.min(1, damping * dt));
      this.camera.lookAt(this.currentLookAt);
    } else {
      // First-person or during transition: direct placement
      this.camera.position.copy(targetPos);
      this.camera.lookAt(lookAt);
    }

    // Match player roll for camera tilt
    if (this.mode === 'first_person' && !this.transitioning) {
      this.camera.quaternion.copy(playerQuat);
    }
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  dispose(): void {
    // No GPU resources
  }
}
```

- [ ] **Step 2: Register V key toggle in Input.ts**

No changes needed — `input.registerKey('v', callback)` is already supported.

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/core/CameraSystem.ts
git commit -m "feat: implement dual-mode CameraSystem with spring-damper follow and smooth transitions"
```

---

### Task 5: Wire Flight + Camera into Game — First Flyable Build

**Files:**
- Modify: `src/Game.ts`
- Modify: `src/Engine.ts` (update fog/sky for xianxia)

- [ ] **Step 1: Update Engine.ts for xianxia atmosphere**

In `src/Engine.ts`, change the constructor to use new render config:

Replace the scene setup section:
```typescript
// Old:
this.scene.background = new THREE.Color(CONFIG.colors.fog);
this.scene.fog = new THREE.FogExp2(CONFIG.colors.fog, CONFIG.render.fogDensity);

// New:
this.scene.background = new THREE.Color(CONFIG.render.fogColor);
this.scene.fog = new THREE.FogExp2(CONFIG.render.fogColor, CONFIG.render.fogDensity);
```

Replace the camera setup:
```typescript
// Old:
this.camera = new THREE.PerspectiveCamera(
  CONFIG.render.fov,
  window.innerWidth / window.innerHeight,
  CONFIG.render.near,
  CONFIG.render.far,
);
this.camera.position.set(0, CONFIG.player.height, 8);

// New:
this.camera = new THREE.PerspectiveCamera(
  CONFIG.render.fov,
  window.innerWidth / window.innerHeight,
  CONFIG.render.near,
  CONFIG.render.far,
);
this.camera.position.set(0, CONFIG.player.startHeight, 0);
```

- [ ] **Step 2: Wire FlightController + CameraSystem into Game.ts**

Replace `src/Game.ts`:

```typescript
import { CONFIG } from './config';
import { Engine } from './Engine';
import { Input } from './Input';
import { Sfx } from './Sfx';
import { FlightController } from './player/FlightController';
import { CameraSystem } from './core/CameraSystem';
import * as THREE from 'three';

export type GameState = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'level_complete' | 'game_over';

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly sfx: Sfx;
  readonly flight: FlightController;
  readonly cameraSystem: CameraSystem;

  private state: GameState = 'menu';
  private level = 1;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.renderer.domElement);
    this.sfx = new Sfx();

    this.flight = new FlightController(this.input);
    this.cameraSystem = new CameraSystem(this.engine.camera);

    // Temp: add a ground plane and some boxes to see movement
    this.addDebugScene();

    // V to toggle camera
    this.input.registerKey('v', () => {
      this.cameraSystem.toggleMode();
    });

    this.engine.addUpdater((dt) => this.update(dt));
  }

  start(): void {
    this.state = 'playing';
    this.sfx.unlock();
    this.input.requestPointerLock();
    this.engine.start();
  }

  private update(dt: number): void {
    if (this.state !== 'playing') return;

    this.flight.update(dt);
    this.cameraSystem.update(dt, this.flight);
  }

  /** Temporary debug geometry to visualize flight. Will be replaced by Arena. */
  private addDebugScene(): void {
    // Ambient + directional light
    this.engine.scene.add(new THREE.AmbientLight(CONFIG.render.ambientColor, CONFIG.render.ambientIntensity));
    const sun = new THREE.DirectionalLight(CONFIG.render.moonColor, CONFIG.render.moonIntensity);
    sun.position.set(50, 100, 50);
    this.engine.scene.add(sun);

    // Cloud-like ground plane at y=0
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4466aa,
      transparent: true,
      opacity: 0.3,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.engine.scene.add(ground);

    // Floating boxes to show spatial reference
    const boxGeo = new THREE.BoxGeometry(10, 30, 10);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0 });
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xdaa520 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 80;
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.set(Math.cos(angle) * r, 40 + Math.random() * 40, Math.sin(angle) * r);
      this.engine.scene.add(box);
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), outlineMat);
      wire.position.copy(box.position);
      this.engine.scene.add(wire);
    }
  }

  dispose(): void {
    this.flight.dispose();
    this.cameraSystem.dispose();
    this.input.dispose();
    this.engine.dispose();
  }
}
```

- [ ] **Step 3: Verify typecheck and run dev server**

```bash
pnpm typecheck && pnpm dev
```

Open browser — you should be able to fly with WASD/Space/Shift, look with mouse, roll with Q/E, and toggle camera with V. Floating white boxes serve as spatial reference.

- [ ] **Step 4: Commit**

```bash
git add src/Game.ts src/Engine.ts
git commit -m "feat: wire FlightController + CameraSystem — first flyable build with debug scene"
```

---

## Phase 3: Floating World

### Task 6: Arena — Procedural Floating Buildings

**Files:**
- Create: `src/world/Arena.ts`
- Modify: `src/shared/collision.ts` (add 3D sphere-vs-AABB)

- [ ] **Step 1: Add 3D sphere-vs-AABB collision to shared/collision.ts**

Append to `src/shared/collision.ts`:

```typescript
/**
 * Resolve a sphere against a list of 3D AABBs.
 * Pushes the sphere center out of any penetrating box, with bounce elasticity.
 */
export function resolveSphereVsAABB3Ds(
  x: number, y: number, z: number,
  radius: number,
  boxes: AABB3D[],
  elasticity = 0.3,
): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
  let rx = x, ry = y, rz = z;
  let bounceVx = 0, bounceVy = 0, bounceVz = 0;

  for (const b of boxes) {
    // Nearest point on AABB to sphere center
    const cx = Math.max(b.minX, Math.min(rx, b.maxX));
    const cy = Math.max(b.minY, Math.min(ry, b.maxY));
    const cz = Math.max(b.minZ, Math.min(rz, b.maxZ));

    const dx = rx - cx;
    const dy = ry - cy;
    const dz = rz - cz;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < radius * radius && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      rx += nx * push;
      ry += ny * push;
      rz += nz * push;
      bounceVx += nx * elasticity;
      bounceVy += ny * elasticity;
      bounceVz += nz * elasticity;
    } else if (distSq === 0) {
      // Inside box: push out along shortest axis
      const exits = [
        { axis: 'x' as const, sign: -1, d: rx - b.minX },
        { axis: 'x' as const, sign: 1, d: b.maxX - rx },
        { axis: 'y' as const, sign: -1, d: ry - b.minY },
        { axis: 'y' as const, sign: 1, d: b.maxY - ry },
        { axis: 'z' as const, sign: -1, d: rz - b.minZ },
        { axis: 'z' as const, sign: 1, d: b.maxZ - rz },
      ];
      exits.sort((a, b) => a.d - b.d);
      const e = exits[0]!;
      if (e.axis === 'x') { rx += e.sign * (e.d + radius); bounceVx += e.sign * elasticity; }
      else if (e.axis === 'y') { ry += e.sign * (e.d + radius); bounceVy += e.sign * elasticity; }
      else { rz += e.sign * (e.d + radius); bounceVz += e.sign * elasticity; }
    }
  }

  return { x: rx, y: ry, z: rz, vx: bounceVx, vy: bounceVy, vz: bounceVz };
}
```

- [ ] **Step 2: Implement Arena with Poisson disk building placement**

Replace `src/world/Arena.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { AABB3D } from '../shared/collision';
import { resolveSphereVsAABB3Ds } from '../shared/collision';

export interface LevelConfig {
  buildings: number;
  bridges: number;
  islands: number;
  spread: number;
  skyTint: string;
}

/**
 * Arena — procedural floating building field.
 *
 * 1. Poisson disk sampling for building anchor points
 * 2. Each anchor → floating building (box + roof + bottom rocks)
 * 3. Bridges as glowing beams between close buildings
 * 4. Small floating islands for pickups
 * 5. Cloud sea at y=0
 * 6. AABB3D collision list for sphere collision
 */
export class Arena {
  readonly group = new THREE.Group();
  readonly colliders: AABB3D[] = [];
  readonly pickupSpots: THREE.Vector3[] = [];

  private config: LevelConfig;

  constructor(scene: THREE.Scene, level: number) {
    this.config = this.getLevelConfig(level);
    this.generate();
    scene.add(this.group);
  }

  private getLevelConfig(level: number): LevelConfig {
    const presets = CONFIG.arena.levelConfigs;
    if (level <= presets.length) {
      return presets[level - 1]!;
    }
    // Auto-scale beyond preset levels
    const base = presets[presets.length - 1]!;
    const extra = level - presets.length;
    const tintIdx = (level - 1) % CONFIG.arena.skyTintPresets.length;
    return {
      buildings: base.buildings + extra * CONFIG.arena.buildingsPerLevel,
      bridges: base.bridges + Math.floor(extra * 0.5),
      islands: base.islands + extra,
      spread: base.spread + extra * CONFIG.arena.spreadPerLevel,
      skyTint: CONFIG.arena.skyTintPresets[tintIdx]!,
    };
  }

  private generate(): void {
    const cfg = this.config;
    const arenaCfg = CONFIG.arena;

    // ─── Buildings via Poisson disk sampling ───
    const anchors = this.poissonDisk(cfg.buildings, cfg.spread, arenaCfg.buildingMinGap);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: arenaCfg.bodyColor,
      roughness: 0.4,
      metalness: 0.0,
    });
    const outlineMat = new THREE.LineBasicMaterial({ color: arenaCfg.accentColor });

    for (const anchor of anchors) {
      const w = 8 + Math.random() * 12; // 8-20m wide
      const d = 8 + Math.random() * 12;
      const h = arenaCfg.heightRange[0] + Math.random() * (arenaCfg.heightRange[1] - arenaCfg.heightRange[0]);
      const baseY = 20 + Math.random() * 40; // floating base height

      // Main body
      const boxGeo = new THREE.BoxGeometry(w, h, d);
      const box = new THREE.Mesh(boxGeo, bodyMat);
      box.position.set(anchor.x, baseY + h / 2, anchor.z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.group.add(box);

      // Gold wireframe outline
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), outlineMat);
      edges.position.copy(box.position);
      this.group.add(edges);

      // Roof accent (smaller box on top)
      const roofGeo = new THREE.BoxGeometry(w + 2, 1.5, d + 2);
      const roof = new THREE.Mesh(roofGeo, bodyMat);
      roof.position.set(anchor.x, baseY + h + 0.75, anchor.z);
      this.group.add(roof);
      const roofEdge = new THREE.LineSegments(new THREE.EdgesGeometry(roofGeo), outlineMat);
      roofEdge.position.copy(roof.position);
      this.group.add(roofEdge);

      // Bottom rocks (inverted cone shape, simple box)
      const rockGeo = new THREE.BoxGeometry(w * 0.6, 8, d * 0.6);
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x665544, roughness: 0.8 });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(anchor.x, baseY - 4, anchor.z);
      this.group.add(rock);

      // Collision AABB
      this.colliders.push({
        minX: anchor.x - w / 2,
        maxX: anchor.x + w / 2,
        minY: baseY,
        maxY: baseY + h + 1.5,
        minZ: anchor.z - d / 2,
        maxZ: anchor.z + d / 2,
      });

      // Top of building = potential pickup spot
      this.pickupSpots.push(new THREE.Vector3(anchor.x, baseY + h + 3, anchor.z));
    }

    // ─── Bridges between nearby buildings ───
    const bridgeMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.6,
    });
    let bridgeCount = 0;
    for (let i = 0; i < anchors.length && bridgeCount < cfg.bridges; i++) {
      for (let j = i + 1; j < anchors.length && bridgeCount < cfg.bridges; j++) {
        const dx = anchors[j]!.x - anchors[i]!.x;
        const dz = anchors[j]!.z - anchors[i]!.z;
        const dist = Math.hypot(dx, dz);
        if (dist < arenaCfg.buildingMinGap * 3) {
          const midX = (anchors[i]!.x + anchors[j]!.x) / 2;
          const midZ = (anchors[i]!.z + anchors[j]!.z) / 2;
          const bridgeGeo = new THREE.BoxGeometry(dist, 0.3, 2);
          const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
          bridge.position.set(midX, 50, midZ);
          bridge.rotation.y = Math.atan2(dz, dx);
          this.group.add(bridge);
          bridgeCount++;
        }
      }
    }

    // ─── Floating islands ───
    const islandMat = new THREE.MeshStandardMaterial({
      color: 0xaabb88,
      roughness: 0.7,
    });
    for (let i = 0; i < cfg.islands; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * cfg.spread * 0.8;
      const ix = Math.cos(angle) * r;
      const iz = Math.sin(angle) * r;
      const iy = 30 + Math.random() * 60;
      const ir = arenaCfg.islandRadius[0] + Math.random() * (arenaCfg.islandRadius[1] - arenaCfg.islandRadius[0]);

      const islandGeo = new THREE.SphereGeometry(ir, 8, 6);
      const island = new THREE.Mesh(islandGeo, islandMat);
      island.scale.y = 0.4; // flatten
      island.position.set(ix, iy, iz);
      this.group.add(island);

      this.pickupSpots.push(new THREE.Vector3(ix, iy + ir * 0.5, iz));
    }

    // ─── Cloud sea (y=0) ───
    const cloudGeo = new THREE.PlaneGeometry(cfg.spread * 3, cfg.spread * 3);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0x8888cc,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.y = 0;
    this.group.add(cloud);

    // ─── Atmosphere particles (rising light dots) ───
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * cfg.spread * 2;
      positions[i * 3 + 1] = Math.random() * 150;
      positions[i * 3 + 2] = (Math.random() - 0.5) * cfg.spread * 2;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.5,
      transparent: true,
      opacity: 0.6,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    this.group.add(particles);

    // ─── Lighting ───
    this.group.add(new THREE.AmbientLight(CONFIG.render.ambientColor, CONFIG.render.ambientIntensity));

    const moon = new THREE.DirectionalLight(CONFIG.render.moonColor, CONFIG.render.moonIntensity);
    moon.position.set(100, 200, 100);
    moon.castShadow = true;
    moon.shadow.camera.left = -200;
    moon.shadow.camera.right = 200;
    moon.shadow.camera.top = 200;
    moon.shadow.camera.bottom = -200;
    moon.shadow.mapSize.set(2048, 2048);
    this.group.add(moon);
    this.group.add(moon.target);
  }

  /**
   * Simple Poisson disk sampling for scattered non-overlapping points.
   * Returns array of {x, z} positions.
   */
  private poissonDisk(count: number, spread: number, minDist: number): Array<{ x: number; z: number }> {
    const points: Array<{ x: number; z: number }> = [];
    const maxAttempts = count * 30;
    let attempts = 0;

    while (points.length < count && attempts < maxAttempts) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      let valid = true;
      for (const p of points) {
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < minDist * minDist) {
          valid = false;
          break;
        }
      }

      if (valid) {
        points.push({ x, z });
      }
      attempts++;
    }

    return points;
  }

  /** Resolve sphere collision against all building AABBs. */
  resolveSphereVsBuildings(
    x: number, y: number, z: number, radius: number,
  ): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
    return resolveSphereVsAABB3Ds(x, y, z, radius, this.colliders);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
```

- [ ] **Step 3: Wire Arena into Game.ts**

In `src/Game.ts`, add Arena import and creation. Remove the `addDebugScene()` method and call.

Add import:
```typescript
import { Arena } from './world/Arena';
```

Add field:
```typescript
private arena!: Arena;
```

In constructor, replace `this.addDebugScene()` with:
```typescript
this.arena = new Arena(this.engine.scene, this.level);
```

In `update()`, add collision after flight update:
```typescript
private update(dt: number): void {
  if (this.state !== 'playing') return;

  this.flight.update(dt);

  // Building collision
  const resolved = this.arena.resolveSphereVsBuildings(
    this.flight.position.x,
    this.flight.position.y,
    this.flight.position.z,
    CONFIG.flight.playerRadius,
  );
  this.flight.position.set(resolved.x, resolved.y, resolved.z);

  this.cameraSystem.update(dt, this.flight);
}
```

In `dispose()`:
```typescript
this.arena.dispose(this.engine.scene);
```

Delete the `addDebugScene` method entirely.

- [ ] **Step 4: Verify and test**

```bash
pnpm typecheck && pnpm dev
```

Open browser — you should see floating white buildings with gold outlines, cloud sea, and particles. Flying into buildings should push you out.

- [ ] **Step 5: Commit**

```bash
git add src/world/Arena.ts src/shared/collision.ts src/Game.ts
git commit -m "feat: implement Arena with Poisson-disk floating buildings, 3D sphere collision, cloud sea"
```

---

### Task 7: Skybox & Atmosphere

**Files:**
- Create: `src/world/Skybox.ts`

- [ ] **Step 1: Implement Skybox with gradient dome**

Create `src/world/Skybox.ts`:

```typescript
import * as THREE from 'three';

/**
 * Skybox — procedural gradient sky dome with color tint per level.
 * Uses a large sphere with ShaderMaterial for smooth vertical gradient.
 */
export class Skybox {
  readonly mesh: THREE.Mesh;

  constructor(tintHex: string) {
    const tintColor = new THREE.Color(tintHex);
    const topColor = new THREE.Color(0x000011).lerp(tintColor, 0.3);
    const bottomColor = tintColor.clone();

    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: topColor },
        bottomColor: { value: bottomColor },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
```

- [ ] **Step 2: Wire Skybox into Arena constructor**

In `src/world/Arena.ts`, import and add Skybox at the end of `generate()`:

```typescript
import { Skybox } from './Skybox';
```

Add field:
```typescript
private skybox: Skybox | null = null;
```

At the end of `generate()`:
```typescript
// Skybox
this.skybox = new Skybox(cfg.skyTint);
this.group.add(this.skybox.mesh);
```

In `dispose()`, before `scene.remove`:
```typescript
if (this.skybox) this.skybox.dispose();
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm dev
```

Sky should show a dark gradient dome matching the level tint color.

- [ ] **Step 4: Commit**

```bash
git add src/world/Skybox.ts src/world/Arena.ts
git commit -m "feat: add procedural gradient Skybox with per-level tint"
```

---

## Phase 4: Weapon Systems

### Task 8: Spirit Beam — Hitscan Primary Weapon

**Files:**
- Create: `src/player/WeaponSystem.ts`

- [ ] **Step 1: Implement WeaponSystem with Spirit Beam**

Create `src/player/WeaponSystem.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightController } from './FlightController';
import type { Input } from '../Input';
import type { Sfx } from '../Sfx';

export type WeaponSlot = 'beam' | 'missile' | 'sword';

export interface WeaponHitResult {
  targetId: number;
  point: THREE.Vector3;
  damage: number;
}

/**
 * WeaponSystem — manages all three weapons:
 * - Spirit Beam: hitscan primary (mouse click)
 * - Talisman Missile: lock-on tracking projectile (right click)
 * - Flying Sword: dash melee (F key)
 *
 * This task implements beam only. Missile and sword are added in subsequent tasks.
 */
export class WeaponSystem {
  private beamCooldown = 0;
  private missileAmmo: number;
  private swordCooldown = 0;
  private activeWeapon: WeaponSlot = 'beam';

  // Lock-on state for missile
  private lockTarget: THREE.Object3D | null = null;
  private lockTimer = 0;
  private locked = false;

  // Visual: beam line
  private beamLine: THREE.Line | null = null;
  private beamTimer = 0;

  // Missiles in flight
  readonly missiles: Missile[] = [];

  // Enemy hitboxes registered externally
  private enemyMeshes: THREE.Object3D[] = [];
  private enemyMap = new Map<number, { id: number; mesh: THREE.Object3D }>();

  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly flight: FlightController,
    private readonly input: Input,
    private readonly scene: THREE.Scene,
    private readonly sfx: Sfx,
  ) {
    this.missileAmmo = CONFIG.weapons.missile.initialAmmo;
  }

  /** Register enemy hitbox meshes for raycast targeting. */
  setEnemyTargets(targets: Array<{ id: number; mesh: THREE.Object3D }>): void {
    this.enemyMeshes = targets.map(t => t.mesh);
    this.enemyMap.clear();
    for (const t of targets) {
      this.enemyMap.set(t.mesh.id, t);
    }
  }

  getActiveWeapon(): WeaponSlot {
    return this.activeWeapon;
  }

  getMissileAmmo(): number {
    return this.missileAmmo;
  }

  isLocked(): boolean {
    return this.locked;
  }

  /** Fire beam (called on mouse click). Returns hit result or null. */
  fireBeam(): WeaponHitResult | null {
    if (this.beamCooldown > 0) return null;

    const cfg = CONFIG.weapons.beam;
    if (!this.flight.consumeSpirit(cfg.spiritCost)) return null;

    this.beamCooldown = cfg.fireRate;
    this.sfx.shoot();

    // Raycast from player position along forward
    const origin = this.flight.position.clone();
    const dir = this.flight.getForward();
    this.raycaster.set(origin, dir);
    this.raycaster.far = cfg.maxRange;

    // Show beam visual
    this.showBeamVisual(origin, origin.clone().add(dir.clone().multiplyScalar(cfg.maxRange)));

    const hits = this.raycaster.intersectObjects(this.enemyMeshes, false);
    if (hits.length > 0) {
      const first = hits[0]!;
      const target = this.enemyMap.get(first.object.id);
      if (target) {
        // Update beam end point to hit location
        this.showBeamVisual(origin, first.point.clone());
        return {
          targetId: target.id,
          point: first.point.clone(),
          damage: cfg.damage,
        };
      }
    }
    return null;
  }

  private showBeamVisual(start: THREE.Vector3, end: THREE.Vector3): void {
    if (this.beamLine) {
      this.scene.remove(this.beamLine);
      this.beamLine.geometry.dispose();
    }

    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
      color: CONFIG.weapons.beam.color,
      transparent: true,
      opacity: 0.8,
    });
    this.beamLine = new THREE.Line(geometry, material);
    this.scene.add(this.beamLine);
    this.beamTimer = 0.1; // visible for 100ms
  }

  addMissileAmmo(amount: number): void {
    this.missileAmmo += amount;
  }

  update(dt: number): void {
    // Cooldowns
    if (this.beamCooldown > 0) this.beamCooldown -= dt;
    if (this.swordCooldown > 0) this.swordCooldown -= dt;

    // Beam visual fade
    if (this.beamTimer > 0) {
      this.beamTimer -= dt;
      if (this.beamTimer <= 0 && this.beamLine) {
        this.scene.remove(this.beamLine);
        this.beamLine.geometry.dispose();
        (this.beamLine.material as THREE.Material).dispose();
        this.beamLine = null;
      }
    }

    // Update missiles in flight
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]!;
      m.update(dt);
      if (m.expired) {
        m.dispose(this.scene);
        this.missiles.splice(i, 1);
      }
    }
  }

  dispose(): void {
    if (this.beamLine) {
      this.scene.remove(this.beamLine);
      this.beamLine.geometry.dispose();
      (this.beamLine.material as THREE.Material).dispose();
    }
    for (const m of this.missiles) {
      m.dispose(this.scene);
    }
  }
}

/**
 * Missile — tracking projectile fired by talisman weapon.
 * Follows locked target with turning speed, explodes on contact or timeout.
 */
export class Missile {
  readonly mesh: THREE.Mesh;
  readonly position = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private target: THREE.Object3D | null = null;
  private lifetime: number;
  expired = false;
  targetId = -1;

  constructor(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    target: THREE.Object3D | null,
    targetId: number,
    scene: THREE.Scene,
  ) {
    this.position.copy(origin);
    this.velocity.copy(direction).multiplyScalar(60); // initial speed
    this.target = target;
    this.targetId = targetId;
    this.lifetime = CONFIG.weapons.missile.trackDuration;

    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.8);
    const mat = new THREE.MeshBasicMaterial({
      color: CONFIG.weapons.missile.color,
      emissive: CONFIG.weapons.missile.color,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin);
    scene.add(this.mesh);
  }

  update(dt: number): void {
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.expired = true;
      return;
    }

    // Track target
    if (this.target) {
      const toTarget = new THREE.Vector3();
      this.target.getWorldPosition(toTarget);
      toTarget.sub(this.position).normalize();

      // Gradually turn toward target
      const currentDir = this.velocity.clone().normalize();
      currentDir.lerp(toTarget, Math.min(1, 3 * dt));
      currentDir.normalize();
      this.velocity.copy(currentDir).multiplyScalar(60);
    }

    this.position.addScaledVector(this.velocity, dt);
    this.mesh.position.copy(this.position);
    this.mesh.lookAt(this.position.clone().add(this.velocity));

    // Check distance traveled
    if (this.position.length() > CONFIG.weapons.missile.maxRange) {
      this.expired = true;
    }
  }

  /** Check if missile hit a sphere at given position. */
  checkHit(targetPos: THREE.Vector3, radius: number): boolean {
    return this.position.distanceTo(targetPos) < radius + 0.5;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
```

- [ ] **Step 2: Wire WeaponSystem into Game.ts**

Import and instantiate in Game constructor:
```typescript
import { WeaponSystem } from './player/WeaponSystem';
```

Add field:
```typescript
readonly weaponSystem: WeaponSystem;
```

In constructor after `this.cameraSystem`:
```typescript
this.weaponSystem = new WeaponSystem(this.flight, this.input, this.engine.scene, this.sfx);
```

Wire mouse click to beam fire:
```typescript
this.input.onMouseDown.push(() => {
  if (this.state !== 'playing') return;
  const hit = this.weaponSystem.fireBeam();
  if (hit) {
    // Enemy damage will be handled when enemy system is added
  }
});
```

In `update()`:
```typescript
this.weaponSystem.update(dt);
```

In `dispose()`:
```typescript
this.weaponSystem.dispose();
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm dev
```

Click should fire a white-blue beam line that fades after 100ms. Spirit energy depletes and regenerates.

- [ ] **Step 4: Commit**

```bash
git add src/player/WeaponSystem.ts src/Game.ts
git commit -m "feat: implement WeaponSystem with Spirit Beam hitscan, missile framework, beam visual"
```

---

### Task 9: Enemy Base — Air Combat AI

**Files:**
- Create: `src/enemy/Enemy.ts`
- Create: `src/enemy/enemy-types.ts`

- [ ] **Step 1: Create enemy type definitions**

Create `src/enemy/enemy-types.ts`:

```typescript
import { CONFIG } from '../config';

export type EnemyTypeName = 'crow' | 'serpent' | 'dragon';

export interface EnemyTypeConfig {
  name: string;
  hp: number;
  speed: number;
  attackDamage: number;
  attackType: string;
  color: number;
  scale: number;
}

export function getEnemyConfig(type: EnemyTypeName, level: number): EnemyTypeConfig {
  const base = CONFIG.enemies.types[type];
  const scaling = CONFIG.enemies.scaling;
  const hpMult = 1 + scaling.hpPerLevel * level;
  const dmgMult = 1 + scaling.damagePerLevel * level;

  return {
    name: base.name,
    hp: Math.round(base.hp * hpMult),
    speed: base.speed * (1 + scaling.speedPerLevel * level),
    attackDamage: Math.round(base.attackDamage * dmgMult),
    attackType: base.attackType,
    color: base.color,
    scale: base.scale,
  };
}
```

- [ ] **Step 2: Implement Enemy with behavior tree AI**

Create `src/enemy/Enemy.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnemyTypeName } from './enemy-types';
import { getEnemyConfig } from './enemy-types';

export type EnemyState = 'patrol' | 'chase' | 'attack' | 'flee' | 'dead';

/**
 * Enemy — 3D air combat AI with behavior tree.
 *
 * Priority:
 * 1. Flee when HP < 20%
 * 2. Avoid obstacles (not yet — needs Arena collision pass)
 * 3. Attack if in range and cooldown ready
 * 4. Chase toward player
 * 5. Patrol random waypoints
 */
export class Enemy {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  readonly id: number;
  readonly typeName: EnemyTypeName;

  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  hp: number;
  maxHp: number;
  alive = true;
  state: EnemyState = 'patrol';

  private readonly speed: number;
  private readonly attackDamage: number;
  private readonly color: number;
  private attackCooldown = 0;
  private readonly attackCooldownTime = 2.0;

  private bodyMat: THREE.MeshStandardMaterial;
  private deathTimer = 0;
  private patrolTarget = new THREE.Vector3();
  private patrolTimer = 0;

  constructor(
    id: number,
    spawn: THREE.Vector3,
    typeName: EnemyTypeName,
    level: number,
    scene: THREE.Scene,
  ) {
    this.id = id;
    this.typeName = typeName;
    this.position.copy(spawn);

    const cfg = getEnemyConfig(typeName, level);
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.speed = cfg.speed;
    this.attackDamage = cfg.attackDamage;
    this.color = cfg.color;

    // Build mesh
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: 0.4,
      metalness: 0.1,
    });

    const scale = cfg.scale;
    const bodyGeo = new THREE.BoxGeometry(1.2 * scale, 0.8 * scale, 2.0 * scale);
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.group.add(body);

    // Wing-like side panels
    const wingGeo = new THREE.BoxGeometry(3.0 * scale, 0.1 * scale, 1.0 * scale);
    const wingMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });
    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.x = -1.5 * scale;
    this.group.add(leftWing);
    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    rightWing.position.x = 1.5 * scale;
    this.group.add(rightWing);

    // Eyes (glowing)
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff2222,
      emissiveIntensity: 2.0,
    });
    const eyeGeo = new THREE.SphereGeometry(0.15 * scale, 6, 6);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.3 * scale, 0.2 * scale, -1.0 * scale);
    this.group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.3 * scale, 0.2 * scale, -1.0 * scale);
    this.group.add(rightEye);

    // Wireframe outline
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    const bodyWire = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), outlineMat);
    this.group.add(bodyWire);

    // Invisible hitbox (larger for easier targeting)
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitGeo = new THREE.BoxGeometry(3.5 * scale, 1.5 * scale, 2.5 * scale);
    this.hitbox = new THREE.Mesh(hitGeo, hitMat);
    this.group.add(this.hitbox);

    this.group.position.copy(spawn);
    scene.add(this.group);

    // Initial patrol target
    this.randomPatrolTarget();
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;

    // Flash white
    this.bodyMat.color.setHex(0xffffff);
    setTimeout(() => {
      if (this.alive) this.bodyMat.color.setHex(this.color);
    }, 80);

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die(): void {
    this.alive = false;
    this.state = 'dead';
    this.deathTimer = 2.0;
    this.bodyMat.color.setHex(0x666666);
    this.bodyMat.opacity = 0.5;
    this.bodyMat.transparent = true;
  }

  /**
   * Update AI and movement.
   * Returns { attacked: boolean, damage: number } if enemy fires this frame.
   */
  update(dt: number, playerPos: THREE.Vector3): { attacked: boolean; damage: number } {
    if (!this.alive) {
      // Death animation: fall and fade
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        this.group.position.y -= 20 * dt;
        this.bodyMat.opacity = Math.max(0, this.deathTimer / 2.0);
      }
      return { attacked: false, damage: 0 };
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const toPlayer = playerPos.clone().sub(this.position);
    const dist = toPlayer.length();
    const fleeThreshold = this.maxHp * CONFIG.enemies.fleeHpPercent;

    // ─── Behavior tree ───
    let attacked = false;

    if (this.hp < fleeThreshold) {
      // FLEE: move away from player
      this.state = 'flee';
      const fleeDir = toPlayer.normalize().negate();
      this.velocity.lerp(fleeDir.multiplyScalar(this.speed), Math.min(1, 3 * dt));
    } else if (dist < CONFIG.enemies.engageDistance && this.attackCooldown <= 0) {
      // ATTACK
      this.state = 'attack';
      this.attackCooldown = this.attackCooldownTime;
      attacked = true;
      // Face player
      this.group.lookAt(playerPos);
    } else if (dist < CONFIG.enemies.engageDistance) {
      // CHASE: move toward player with offset
      this.state = 'chase';
      const chaseDir = toPlayer.normalize();
      // Add slight strafing for more interesting movement
      const strafe = new THREE.Vector3(-chaseDir.z, 0, chaseDir.x).multiplyScalar(
        Math.sin(performance.now() * 0.002 + this.id) * 0.3,
      );
      const moveDir = chaseDir.add(strafe).normalize();
      this.velocity.lerp(moveDir.multiplyScalar(this.speed), Math.min(1, 3 * dt));
    } else {
      // PATROL: wander
      this.state = 'patrol';
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0 || this.position.distanceTo(this.patrolTarget) < 5) {
        this.randomPatrolTarget();
      }
      const toTarget = this.patrolTarget.clone().sub(this.position).normalize();
      this.velocity.lerp(toTarget.multiplyScalar(this.speed * 0.5), Math.min(1, 2 * dt));
    }

    // Integrate position
    this.position.addScaledVector(this.velocity, dt);

    // Keep above cloud layer
    if (this.position.y < 20) this.position.y = 20;

    // Update visual
    this.group.position.copy(this.position);
    if (this.velocity.lengthSq() > 0.1) {
      const lookTarget = this.position.clone().add(this.velocity);
      this.group.lookAt(lookTarget);
    }

    // Bob animation
    this.group.position.y += Math.sin(performance.now() * 0.003 + this.id * 7) * 0.3;

    return { attacked, damage: attacked ? this.attackDamage : 0 };
  }

  private randomPatrolTarget(): void {
    this.patrolTarget.set(
      this.position.x + (Math.random() - 0.5) * 100,
      30 + Math.random() * 80,
      this.position.z + (Math.random() - 0.5) * 100,
    );
    this.patrolTimer = 5 + Math.random() * 5;
  }

  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
```

- [ ] **Step 3: Wire enemies into Game.ts**

Import:
```typescript
import { Enemy } from './enemy/Enemy';
import type { EnemyTypeName } from './enemy/enemy-types';
```

Add fields:
```typescript
private enemies: Enemy[] = [];
private nextEnemyId = 0;
```

Add a `spawnWave` method:
```typescript
private spawnWave(): void {
  const count = Math.floor(
    CONFIG.progression.scaling.enemyCountBase +
    CONFIG.progression.scaling.enemyCountPerLevel * this.level,
  );
  const types: EnemyTypeName[] = ['crow', 'serpent', 'dragon'];
  const spread = this.arena ? 150 : 100;

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length]!;
    const angle = Math.random() * Math.PI * 2;
    const r = 50 + Math.random() * spread;
    const spawn = new THREE.Vector3(
      Math.cos(angle) * r,
      40 + Math.random() * 60,
      Math.sin(angle) * r,
    );
    const enemy = new Enemy(this.nextEnemyId++, spawn, type, this.level, this.engine.scene);
    this.enemies.push(enemy);
  }

  // Register enemy hitboxes with weapon system
  this.weaponSystem.setEnemyTargets(
    this.enemies.filter(e => e.alive).map(e => ({ id: e.id, mesh: e.hitbox })),
  );
}
```

Call `this.spawnWave()` after arena creation in constructor.

In `update()`, add enemy updates and beam hit handling:
```typescript
// Update enemies
for (const enemy of this.enemies) {
  const result = enemy.update(dt, this.flight.position);
  if (result.attacked) {
    const died = this.flight.takeDamage(result.damage);
    this.sfx.damage();
    if (died) {
      this.state = 'dead';
    }
  }
}
```

Update mouse click handler to apply beam damage:
```typescript
this.input.onMouseDown.push(() => {
  if (this.state !== 'playing') return;
  const hit = this.weaponSystem.fireBeam();
  if (hit) {
    const enemy = this.enemies.find(e => e.id === hit.targetId);
    if (enemy) {
      const killed = enemy.takeDamage(hit.damage);
      this.sfx.hit();
      if (killed) this.sfx.enemyDie();
    }
  }
});
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck && pnpm dev
```

Enemies should spawn in the arena, patrol/chase/attack the player. Beam shots should damage enemies. Enemy death should trigger fall animation.

- [ ] **Step 5: Commit**

```bash
git add src/enemy/Enemy.ts src/enemy/enemy-types.ts src/Game.ts
git commit -m "feat: implement Enemy air combat AI with behavior tree, crow/serpent/dragon types"
```

---

### Task 10: Boss Enemy — Multi-Phase

**Files:**
- Create: `src/enemy/Boss.ts`

- [ ] **Step 1: Implement Boss with 3-phase state machine**

Create `src/enemy/Boss.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnemyTypeName } from './enemy-types';

export type BossPhase = 1 | 2 | 3;

/**
 * Boss — enemy cultivator with 3 combat phases.
 *
 * Phase 1 (100%-60%): Sword volleys, occasional dodge
 * Phase 2 (60%-30%): AOE spells + summon 2 crows, speed +50%
 * Phase 3 (30%-0%): Berserk dashes, spirit shield, speed +30%
 */
export class Boss {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  readonly id: number;

  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  hp: number;
  maxHp: number;
  alive = true;
  phase: BossPhase = 1;

  private bodyMat: THREE.MeshStandardMaterial;
  private shieldMesh: THREE.Mesh | null = null;
  private shieldHp = 0;
  private attackCooldown = 0;
  private dashCooldown = 0;
  private readonly baseSpeed: number = 30;
  private deathTimer = 0;

  // Callback for summoning minions
  onSummon: ((count: number, pos: THREE.Vector3) => void) | null = null;
  // Callback for phase transition visual
  onPhaseChange: ((phase: BossPhase) => void) | null = null;
  // Track if phase 2 summon has happened
  private phase2Summoned = false;

  constructor(id: number, spawn: THREE.Vector3, level: number, scene: THREE.Scene) {
    this.id = id;
    this.position.copy(spawn);

    const cfg = CONFIG.boss;
    const scaling = CONFIG.progression.scaling;
    this.hp = Math.round(cfg.baseHp * Math.pow(scaling.hpPerLevel, level));
    this.maxHp = this.hp;

    // Large humanoid body
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: 0.3,
      metalness: 0.2,
      emissive: cfg.color,
      emissiveIntensity: 0.3,
    });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(2, 3, 1.5);
    const torso = new THREE.Mesh(torsoGeo, this.bodyMat);
    torso.position.y = 1.5;
    this.group.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(1, 1, 1);
    const head = new THREE.Mesh(headGeo, this.bodyMat);
    head.position.y = 3.5;
    this.group.add(head);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 3.0,
    });
    const eyeGeo = new THREE.SphereGeometry(0.15, 6, 6);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.25, 3.6, -0.5);
    this.group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.25, 3.6, -0.5);
    this.group.add(rightEye);

    // Wireframe
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xffcc00 });
    this.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(torsoGeo), outlineMat));
    this.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(headGeo), outlineMat));

    // Hitbox
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 3), hitMat);
    this.hitbox.position.y = 2;
    this.group.add(this.hitbox);

    this.group.position.copy(spawn);
    scene.add(this.group);
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;

    // Phase 3 shield absorbs damage
    if (this.shieldHp > 0) {
      this.shieldHp -= amount;
      if (this.shieldHp <= 0) {
        this.shieldHp = 0;
        if (this.shieldMesh) {
          this.shieldMesh.visible = false;
        }
      }
      return false;
    }

    this.hp -= amount;

    // Flash
    this.bodyMat.emissiveIntensity = 1.0;
    setTimeout(() => {
      if (this.alive) this.bodyMat.emissiveIntensity = 0.3;
    }, 100);

    // Check phase transitions
    const hpPct = this.hp / this.maxHp;
    if (this.phase === 1 && hpPct <= CONFIG.boss.phase1Threshold) {
      this.phase = 2;
      this.onPhaseChange?.(2);
    } else if (this.phase === 2 && hpPct <= CONFIG.boss.phase2Threshold) {
      this.phase = 3;
      this.onPhaseChange?.(3);
      this.activateShield();
    }

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private activateShield(): void {
    this.shieldHp = CONFIG.boss.shieldHp;
    if (!this.shieldMesh) {
      const geo = new THREE.SphereGeometry(4, 16, 12);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x8800ff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      this.shieldMesh = new THREE.Mesh(geo, mat);
      this.shieldMesh.position.y = 2;
      this.group.add(this.shieldMesh);
    }
    this.shieldMesh.visible = true;
  }

  private die(): void {
    this.alive = false;
    this.deathTimer = 3.0;
    this.bodyMat.emissiveIntensity = 0;
    this.bodyMat.color.setHex(0x333333);
  }

  update(dt: number, playerPos: THREE.Vector3): { attacked: boolean; damage: number; aoe: boolean } {
    if (!this.alive) {
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        this.group.position.y -= 10 * dt;
        this.group.rotation.x += dt * 0.5;
      }
      return { attacked: false, damage: 0, aoe: false };
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    const toPlayer = playerPos.clone().sub(this.position);
    const dist = toPlayer.length();
    const speed = this.getPhaseSpeed();

    let attacked = false;
    let damage = 0;
    let aoe = false;

    // Phase-specific behavior
    if (this.phase === 1) {
      // Chase and shoot
      if (dist > 30) {
        const dir = toPlayer.normalize();
        this.velocity.lerp(dir.multiplyScalar(speed), Math.min(1, 3 * dt));
      }
      if (this.attackCooldown <= 0 && dist < 80) {
        this.attackCooldown = 1.5;
        attacked = true;
        damage = 20;
      }
    } else if (this.phase === 2) {
      // Summon crows once
      if (!this.phase2Summoned) {
        this.phase2Summoned = true;
        this.onSummon?.(CONFIG.boss.summonCount, this.position.clone());
      }
      // AOE + ranged attacks
      if (this.attackCooldown <= 0 && dist < 60) {
        this.attackCooldown = 1.0;
        attacked = true;
        damage = 25;
        aoe = dist < 20; // AOE if close
      }
      // Aggressive chase
      const dir = toPlayer.normalize();
      this.velocity.lerp(dir.multiplyScalar(speed), Math.min(1, 4 * dt));
    } else {
      // Phase 3: Berserk dashes
      if (this.dashCooldown <= 0 && dist < 50) {
        this.dashCooldown = 2.0;
        const dashDir = toPlayer.normalize().multiplyScalar(speed * 2);
        this.velocity.copy(dashDir);
        attacked = true;
        damage = 40;
      } else {
        const dir = toPlayer.normalize();
        this.velocity.lerp(dir.multiplyScalar(speed), Math.min(1, 5 * dt));
      }
    }

    // Integrate
    this.position.addScaledVector(this.velocity, dt);
    this.velocity.multiplyScalar(0.95); // drag
    if (this.position.y < 30) this.position.y = 30;

    this.group.position.copy(this.position);
    if (dist > 1) this.group.lookAt(playerPos);

    // Rotate shield
    if (this.shieldMesh && this.shieldMesh.visible) {
      this.shieldMesh.rotation.y += dt * 2;
    }

    return { attacked, damage, aoe };
  }

  private getPhaseSpeed(): number {
    const base = this.baseSpeed;
    if (this.phase === 2) return base * CONFIG.boss.phase2SpeedBoost;
    if (this.phase === 3) return base * CONFIG.boss.phase3SpeedBoost;
    return base;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/enemy/Boss.ts
git commit -m "feat: implement Boss enemy with 3-phase state machine, shield, summon mechanics"
```

---

## Phase 5: HUD & Audio

### Task 11: Flight HUD

**Files:**
- Rewrite: `src/ui/Hud.ts` (move from `src/Hud.ts` to `src/ui/Hud.ts`)
- Modify: `index.html`

- [ ] **Step 1: Create src/ui/ directory and new Hud.ts**

Create `src/ui/Hud.ts`:

```typescript
/**
 * Hud — DOM-based flight instrument HUD.
 *
 * Layout:
 * - Top: Level/wave/enemy count
 * - Center: Crosshair (red when locked)
 * - Left bottom: Weapon status (name + ammo/cooldown)
 * - Right bottom: Radar circle
 * - Bottom bar: HP (red), Spirit (blue), altitude, speed, boost
 * - Floating 3D: damage numbers (future)
 */
export class Hud {
  private readonly root: HTMLElement;

  // Elements
  private levelInfo!: HTMLElement;
  private waveInfo!: HTMLElement;
  private enemyCount!: HTMLElement;
  private crosshair!: HTMLElement;
  private weaponName!: HTMLElement;
  private weaponAmmo!: HTMLElement;
  private hpBar!: HTMLElement;
  private hpText!: HTMLElement;
  private spiritBar!: HTMLElement;
  private spiritText!: HTMLElement;
  private altitudeText!: HTMLElement;
  private speedText!: HTMLElement;
  private boostBar!: HTMLElement;
  private damageFlash!: HTMLElement;
  private hitMarker!: HTMLElement;
  private killText!: HTMLElement;
  private bossPhaseText!: HTMLElement;
  private radarCanvas!: HTMLCanvasElement;
  private radarCtx!: CanvasRenderingContext2D;

  constructor() {
    this.root = document.getElementById('hud') ?? this.createHudRoot();
    this.buildHud();
  }

  private createHudRoot(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'hud';
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:100;font-family:monospace;color:#fff;';
    document.body.appendChild(el);
    return el;
  }

  private buildHud(): void {
    this.root.innerHTML = `
      <!-- Top bar -->
      <div style="position:absolute;top:12px;left:50%;transform:translateX(-50%);text-align:center;font-size:14px;">
        <span id="hud-level" style="color:#daa520;font-weight:bold;"></span>
        <span id="hud-wave" style="margin-left:16px;"></span>
        <span id="hud-enemies" style="margin-left:16px;color:#ff6666;"></span>
      </div>

      <!-- Crosshair -->
      <div id="hud-crosshair" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:24px;height:24px;">
        <div style="position:absolute;top:50%;left:0;width:8px;height:2px;background:#fff;transform:translateY(-50%);"></div>
        <div style="position:absolute;top:50%;right:0;width:8px;height:2px;background:#fff;transform:translateY(-50%);"></div>
        <div style="position:absolute;top:0;left:50%;width:2px;height:8px;background:#fff;transform:translateX(-50%);"></div>
        <div style="position:absolute;bottom:0;left:50%;width:2px;height:8px;background:#fff;transform:translateX(-50%);"></div>
      </div>

      <!-- Weapon info (left bottom) -->
      <div style="position:absolute;bottom:60px;left:20px;font-size:13px;">
        <div id="hud-weapon-name" style="color:#88ccff;font-weight:bold;">灵力射线</div>
        <div id="hud-weapon-ammo"></div>
      </div>

      <!-- Radar (right bottom) -->
      <canvas id="hud-radar" width="150" height="150" style="position:absolute;bottom:60px;right:20px;border-radius:50%;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.3);"></canvas>

      <!-- Bottom status bar -->
      <div style="position:absolute;bottom:12px;left:20px;right:20px;display:flex;gap:16px;align-items:center;font-size:12px;">
        <!-- HP -->
        <div style="flex:1;max-width:200px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
            <span>HP</span><span id="hud-hp-text">100</span>
          </div>
          <div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;">
            <div id="hud-hp-bar" style="height:100%;background:#cc3333;border-radius:3px;width:100%;transition:width 0.3s;"></div>
          </div>
        </div>
        <!-- Spirit -->
        <div style="flex:1;max-width:200px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
            <span>灵力</span><span id="hud-spirit-text">100</span>
          </div>
          <div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;">
            <div id="hud-spirit-bar" style="height:100%;background:#4488ff;border-radius:3px;width:100%;transition:width 0.3s;"></div>
          </div>
        </div>
        <!-- Altitude -->
        <div>高度: <span id="hud-altitude">0</span>m</div>
        <!-- Speed -->
        <div>速度: <span id="hud-speed">0</span>m/s</div>
        <!-- Boost -->
        <div style="width:80px;">
          <div style="margin-bottom:2px;">加力</div>
          <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;">
            <div id="hud-boost-bar" style="height:100%;background:#ffcc00;border-radius:2px;width:100%;transition:width 0.3s;"></div>
          </div>
        </div>
      </div>

      <!-- Damage flash overlay -->
      <div id="hud-damage" style="position:fixed;inset:0;background:radial-gradient(transparent 50%,rgba(200,0,0,0.4));opacity:0;transition:opacity 0.1s;pointer-events:none;"></div>

      <!-- Hit marker -->
      <div id="hud-hitmarker" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;color:#fff;opacity:0;transition:opacity 0.15s;">+</div>

      <!-- Kill text -->
      <div id="hud-kill" style="position:absolute;top:40%;left:50%;transform:translateX(-50%);font-size:18px;color:#ff6666;opacity:0;transition:opacity 0.3s;"></div>

      <!-- Boss phase text -->
      <div id="hud-boss-phase" style="position:absolute;top:30%;left:50%;transform:translateX(-50%);font-size:24px;color:#daa520;font-weight:bold;opacity:0;transition:opacity 0.5s;"></div>
    `;

    this.levelInfo = this.get('hud-level');
    this.waveInfo = this.get('hud-wave');
    this.enemyCount = this.get('hud-enemies');
    this.crosshair = this.get('hud-crosshair');
    this.weaponName = this.get('hud-weapon-name');
    this.weaponAmmo = this.get('hud-weapon-ammo');
    this.hpBar = this.get('hud-hp-bar');
    this.hpText = this.get('hud-hp-text');
    this.spiritBar = this.get('hud-spirit-bar');
    this.spiritText = this.get('hud-spirit-text');
    this.altitudeText = this.get('hud-altitude');
    this.speedText = this.get('hud-speed');
    this.boostBar = this.get('hud-boost-bar');
    this.damageFlash = this.get('hud-damage');
    this.hitMarker = this.get('hud-hitmarker');
    this.killText = this.get('hud-kill');
    this.bossPhaseText = this.get('hud-boss-phase');
    this.radarCanvas = this.get('hud-radar') as HTMLCanvasElement;
    this.radarCtx = this.radarCanvas.getContext('2d')!;
  }

  private get(id: string): HTMLElement {
    return document.getElementById(id)!;
  }

  setLevel(level: number): void {
    this.levelInfo.textContent = `第 ${level} 关`;
  }

  setWave(wave: number, total: number): void {
    this.waveInfo.textContent = `波次 ${wave}/${total}`;
  }

  setEnemyCount(count: number): void {
    this.enemyCount.textContent = `敌人: ${count}`;
  }

  setHp(hp: number, max: number): void {
    this.hpText.textContent = String(Math.floor(hp));
    this.hpBar.style.width = `${(hp / max) * 100}%`;
  }

  setSpirit(spirit: number, max: number): void {
    this.spiritText.textContent = String(Math.floor(spirit));
    this.spiritBar.style.width = `${(spirit / max) * 100}%`;
  }

  setAltitude(alt: number): void {
    this.altitudeText.textContent = String(Math.floor(alt));
  }

  setSpeed(speed: number): void {
    this.speedText.textContent = String(Math.floor(speed));
  }

  setBoost(pct: number): void {
    this.boostBar.style.width = `${pct * 100}%`;
  }

  setWeapon(name: string, ammoText: string): void {
    this.weaponName.textContent = name;
    this.weaponAmmo.textContent = ammoText;
  }

  setCrosshairLocked(locked: boolean): void {
    const divs = this.crosshair.querySelectorAll('div');
    const color = locked ? '#ff3333' : '#ffffff';
    divs.forEach(d => (d as HTMLElement).style.background = color);
  }

  flashDamage(): void {
    this.damageFlash.style.opacity = '1';
    setTimeout(() => { this.damageFlash.style.opacity = '0'; }, 150);
  }

  flashHitMarker(): void {
    this.hitMarker.style.opacity = '1';
    setTimeout(() => { this.hitMarker.style.opacity = '0'; }, 200);
  }

  showKill(text: string): void {
    this.killText.textContent = text;
    this.killText.style.opacity = '1';
    setTimeout(() => { this.killText.style.opacity = '0'; }, 1500);
  }

  showBossPhase(phase: number): void {
    const texts = ['', '', '第二阶段 — 狂暴化', '最终阶段 — 暴走'];
    this.bossPhaseText.textContent = texts[phase] ?? '';
    this.bossPhaseText.style.opacity = '1';
    setTimeout(() => { this.bossPhaseText.style.opacity = '0'; }, 2500);
  }

  /**
   * Update radar with enemy/pickup positions relative to player.
   */
  updateRadar(
    playerX: number, playerZ: number, playerYaw: number,
    enemies: Array<{ x: number; z: number; alive: boolean }>,
    pickups: Array<{ x: number; z: number }>,
  ): void {
    const ctx = this.radarCtx;
    const size = 150;
    const half = size / 2;
    const range = 200; // radar range in world units

    ctx.clearRect(0, 0, size, size);

    // Player dot (center)
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(half, half, 3, 0, Math.PI * 2);
    ctx.fill();

    // Forward indicator
    ctx.strokeStyle = 'rgba(0,255,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.lineTo(half + Math.sin(playerYaw) * 15, half - Math.cos(playerYaw) * 15);
    ctx.stroke();

    // Enemies
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x - playerX;
      const dz = e.z - playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const rx = half + (dx / range) * half;
      const ry = half + (dz / range) * half;
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(rx, ry, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pickups
    for (const p of pickups) {
      const dx = p.x - playerX;
      const dz = p.z - playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const rx = half + (dx / range) * half;
      const ry = half + (dz / range) * half;
      ctx.fillStyle = '#4488ff';
      ctx.beginPath();
      ctx.arc(rx, ry, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  showGameOver(stats: { level: number; kills: number; time: number }): void {
    const el = document.createElement('div');
    el.id = 'gameover-screen';
    el.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);z-index:200;color:#fff;pointer-events:auto;';
    const minutes = Math.floor(stats.time / 60);
    const seconds = Math.floor(stats.time % 60);
    el.innerHTML = `
      <h1 style="color:#cc3333;font-size:36px;">陨落</h1>
      <div style="margin:20px 0;font-size:16px;">
        <div>到达关卡: ${stats.level}</div>
        <div>击杀数: ${stats.kills}</div>
        <div>生存时间: ${minutes}:${String(seconds).padStart(2, '0')}</div>
      </div>
      <button id="hud-restart" style="padding:12px 32px;font-size:16px;cursor:pointer;background:#333;color:#fff;border:1px solid #666;border-radius:4px;pointer-events:auto;">重新开始</button>
    `;
    document.body.appendChild(el);
  }

  showLevelComplete(level: number, grade: string): void {
    const el = document.createElement('div');
    el.id = 'level-complete-screen';
    el.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);z-index:200;color:#fff;pointer-events:auto;';
    el.innerHTML = `
      <h1 style="color:#daa520;font-size:36px;">关卡完成</h1>
      <div style="font-size:48px;color:#daa520;margin:16px 0;">${grade}</div>
      <div style="font-size:16px;">第 ${level} 关 通过</div>
      <button id="hud-next-level" style="margin-top:24px;padding:12px 32px;font-size:16px;cursor:pointer;background:#333;color:#fff;border:1px solid #666;border-radius:4px;pointer-events:auto;">继续</button>
    `;
    document.body.appendChild(el);
  }

  hideEndScreens(): void {
    document.getElementById('gameover-screen')?.remove();
    document.getElementById('level-complete-screen')?.remove();
  }
}
```

- [ ] **Step 2: Delete old src/Hud.ts**

```bash
rm -f src/Hud.ts
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/Hud.ts
git rm src/Hud.ts 2>/dev/null; true
git commit -m "feat: implement flight HUD with HP/spirit bars, radar, crosshair, weapon info, damage flash"
```

---

### Task 12: Update Sfx for Xianxia Sounds

**Files:**
- Modify: `src/Sfx.ts`

- [ ] **Step 1: Add xianxia weapon and enemy sounds**

Add these methods to `src/Sfx.ts` after the existing `cardSelect()` method (keep all existing methods, add new ones):

```typescript
  spiritBeam(): void {
    if (!this.ready()) return;
    this.sweep(2000, 800, 0.08, 'sawtooth', 0.5);
    this.beep(1500, 0.04, 'sine', 0.3);
  }

  missileLaunch(): void {
    if (!this.ready()) return;
    this.sweep(100, 400, 0.3, 'square', 0.6);
    this.beep(200, 0.1, 'sine', 0.4);
  }

  missileExplode(): void {
    if (!this.ready()) return;
    this.noise(0.3, 600, 1.0);
    this.sweep(200, 40, 0.4, 'sawtooth', 0.8);
  }

  swordDash(): void {
    if (!this.ready()) return;
    this.sweep(300, 2000, 0.15, 'sawtooth', 0.7);
    this.beep(1000, 0.05, 'sine', 0.4);
  }

  bossPhaseChange(): void {
    if (!this.ready()) return;
    this.sweep(80, 40, 1.0, 'sawtooth', 0.9);
    this.noise(0.5, 200, 0.6);
    this.beep(220, 0.5, 'triangle', 0.4);
  }

  boost(): void {
    if (!this.ready()) return;
    this.sweep(60, 120, 0.3, 'sawtooth', 0.5);
    this.beep(80, 0.2, 'square', 0.3);
  }

  levelComplete(): void {
    if (!this.ready()) return;
    this.beep(440, 0.15, 'sine', 0.5);
    this.beep(660, 0.15, 'sine', 0.5);
    this.beep(880, 0.2, 'sine', 0.5);
    this.sweep(440, 880, 0.5, 'triangle', 0.4);
  }
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/Sfx.ts
git commit -m "feat: add xianxia audio — spirit beam, missile, sword dash, boss phase change, boost"
```

---

## Phase 6: Full Game Integration

### Task 13: Game.ts — Complete Game Loop with Waves, Levels, Boss

**Files:**
- Rewrite: `src/Game.ts`

- [ ] **Step 1: Implement full Game orchestrator**

This is the largest single file. Replace `src/Game.ts` with the complete game loop:

```typescript
import * as THREE from 'three';
import { CONFIG } from './config';
import { Engine } from './Engine';
import { Input } from './Input';
import { Sfx } from './Sfx';
import { FlightController } from './player/FlightController';
import { CameraSystem } from './core/CameraSystem';
import { WeaponSystem } from './player/WeaponSystem';
import { Arena } from './world/Arena';
import { Enemy } from './enemy/Enemy';
import { Boss } from './enemy/Boss';
import { Hud } from './ui/Hud';
import type { EnemyTypeName } from './enemy/enemy-types';

export type GameState = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'level_complete' | 'game_over';

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly sfx: Sfx;
  readonly hud: Hud;

  private flight!: FlightController;
  private cameraSystem!: CameraSystem;
  private weaponSystem!: WeaponSystem;
  private arena!: Arena;

  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private nextEnemyId = 0;

  private state: GameState = 'menu';
  private level = 1;
  private wave = 1;
  private totalKills = 0;
  private elapsedTime = 0;
  private waveRestTimer = 0;
  private briefingTimer = 0;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.renderer.domElement);
    this.sfx = new Sfx();
    this.hud = new Hud();

    this.initLevel(1);
    this.bindActions();
    this.engine.addUpdater((dt) => this.update(dt));
  }

  private initLevel(level: number): void {
    this.level = level;
    this.wave = 0;

    // Dispose old arena
    if (this.arena) this.arena.dispose(this.engine.scene);

    // Create new arena
    this.arena = new Arena(this.engine.scene, level);

    // Create or reset player
    if (!this.flight) {
      this.flight = new FlightController(this.input);
      this.cameraSystem = new CameraSystem(this.engine.camera);
      this.weaponSystem = new WeaponSystem(this.flight, this.input, this.engine.scene, this.sfx);
    }

    // Reset player position
    this.flight.teleportTo(0, CONFIG.player.startHeight, 0);
    this.flight.hp = CONFIG.player.maxHealth;
    this.flight.spirit = CONFIG.spirit.maxSpirit;
    this.flight.alive = true;

    // Dispose old enemies
    for (const e of this.enemies) e.dispose(this.engine.scene);
    this.enemies = [];
    if (this.boss) { this.boss.dispose(this.engine.scene); this.boss = null; }

    // Update HUD
    this.hud.setLevel(level);
    this.hud.setWave(0, CONFIG.progression.wavesPerLevel);
  }

  start(): void {
    this.state = 'briefing';
    this.briefingTimer = 1.5;
    this.sfx.unlock();
    this.input.requestPointerLock();
    this.engine.start();
  }

  private bindActions(): void {
    // Left click: fire beam
    this.input.onMouseDown.push(() => {
      if (this.state !== 'playing') return;
      const hit = this.weaponSystem.fireBeam();
      if (hit) {
        this.onWeaponHit(hit.targetId, hit.damage);
        this.hud.flashHitMarker();
      }
    });

    // V: toggle camera
    this.input.registerKey('v', () => {
      if (this.state === 'playing') this.cameraSystem.toggleMode();
    });

    // F: sword dash
    this.input.registerKey('f', () => {
      if (this.state !== 'playing') return;
      // Sword dash will be implemented in a future enhancement
    });

    // Tab: boost
    this.input.registerKey('tab', () => {
      if (this.state !== 'playing') return;
      if (this.flight.tryBoost()) {
        this.sfx.boost();
      }
    });
  }

  private onWeaponHit(targetId: number, damage: number): void {
    // Check regular enemies
    const enemy = this.enemies.find(e => e.id === targetId);
    if (enemy) {
      const killed = enemy.takeDamage(damage);
      this.sfx.hit();
      if (killed) {
        this.sfx.enemyDie();
        this.totalKills++;
        this.hud.showKill(`击杀 ${enemy.typeName}`);
      }
      return;
    }

    // Check boss
    if (this.boss && this.boss.id === targetId) {
      const killed = this.boss.takeDamage(damage);
      this.sfx.hit();
      if (killed) {
        this.sfx.enemyDie();
        this.totalKills++;
        this.hud.showKill('Boss 击杀!');
      }
    }
  }

  private update(dt: number): void {
    if (this.state === 'dead' || this.state === 'menu') return;

    if (this.state === 'briefing') {
      this.briefingTimer -= dt;
      if (this.briefingTimer <= 0) {
        this.state = 'playing';
        this.nextWave();
      }
      return;
    }

    if (this.state === 'level_complete') return;

    this.elapsedTime += dt;

    // Update systems
    this.flight.update(dt);

    // Building collision
    const resolved = this.arena.resolveSphereVsBuildings(
      this.flight.position.x,
      this.flight.position.y,
      this.flight.position.z,
      CONFIG.flight.playerRadius,
    );
    this.flight.position.set(resolved.x, resolved.y, resolved.z);

    this.cameraSystem.update(dt, this.flight);
    this.weaponSystem.update(dt);

    // Update enemies
    let aliveCount = 0;
    for (const enemy of this.enemies) {
      const result = enemy.update(dt, this.flight.position);
      if (enemy.alive) aliveCount++;
      if (result.attacked) {
        const died = this.flight.takeDamage(result.damage);
        this.sfx.damage();
        this.hud.flashDamage();
        if (died) this.onDeath();
      }
    }

    // Update boss
    if (this.boss && this.boss.alive) {
      aliveCount++;
      const result = this.boss.update(dt, this.flight.position);
      if (result.attacked) {
        const died = this.flight.takeDamage(result.damage);
        this.sfx.damage();
        this.hud.flashDamage();
        if (died) this.onDeath();
      }
    }

    // Check missile hits
    for (const missile of this.weaponSystem.missiles) {
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (missile.checkHit(enemy.position, 2)) {
          enemy.takeDamage(CONFIG.weapons.missile.damage);
          missile.expired = true;
          this.sfx.missileExplode();
          if (!enemy.alive) {
            this.totalKills++;
            this.hud.showKill(`击杀 ${enemy.typeName}`);
          }
        }
      }
      if (this.boss && this.boss.alive && missile.checkHit(this.boss.position, 3)) {
        this.boss.takeDamage(CONFIG.weapons.missile.damage);
        missile.expired = true;
        this.sfx.missileExplode();
        if (!this.boss.alive) {
          this.totalKills++;
          this.hud.showKill('Boss 击杀!');
        }
      }
    }

    // Wave progression
    if (aliveCount === 0 && this.waveRestTimer <= 0) {
      if (this.wave >= CONFIG.progression.wavesPerLevel) {
        this.onLevelComplete();
      } else {
        this.waveRestTimer = CONFIG.progression.waveRestTime;
      }
    }
    if (this.waveRestTimer > 0) {
      this.waveRestTimer -= dt;
      if (this.waveRestTimer <= 0) {
        this.nextWave();
      }
    }

    // Update weapon targets
    const allTargets = this.enemies.filter(e => e.alive).map(e => ({ id: e.id, mesh: e.hitbox }));
    if (this.boss && this.boss.alive) {
      allTargets.push({ id: this.boss.id, mesh: this.boss.hitbox });
    }
    this.weaponSystem.setEnemyTargets(allTargets);

    // Update HUD
    this.hud.setHp(this.flight.hp, CONFIG.player.maxHealth);
    this.hud.setSpirit(this.flight.spirit, CONFIG.spirit.maxSpirit);
    this.hud.setAltitude(this.flight.getAltitude());
    this.hud.setSpeed(this.flight.getSpeed());
    this.hud.setEnemyCount(aliveCount);
    this.hud.setWeapon(
      CONFIG.weapons.beam.name,
      `灵力 ${Math.floor(this.flight.spirit)}`,
    );

    // Radar
    this.hud.updateRadar(
      this.flight.position.x,
      this.flight.position.z,
      0, // yaw — simplified for now
      this.enemies.map(e => ({ x: e.position.x, z: e.position.z, alive: e.alive })),
      this.arena.pickupSpots.map(p => ({ x: p.x, z: p.z })),
    );
  }

  private nextWave(): void {
    this.wave++;
    this.hud.setWave(this.wave, CONFIG.progression.wavesPerLevel);

    const isBossLevel = CONFIG.progression.bossLevels.includes(this.level);
    const isBossWave = isBossLevel && this.wave === CONFIG.progression.wavesPerLevel;

    if (isBossWave) {
      // Spawn boss
      const spawnPos = new THREE.Vector3(0, 80, -100);
      this.boss = new Boss(this.nextEnemyId++, spawnPos, this.level, this.engine.scene);
      this.boss.onPhaseChange = (phase) => {
        this.hud.showBossPhase(phase);
        this.sfx.bossPhaseChange();
      };
      this.boss.onSummon = (count, pos) => {
        for (let i = 0; i < count; i++) {
          const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 30,
          );
          const spawn = pos.clone().add(offset);
          const e = new Enemy(this.nextEnemyId++, spawn, 'crow', this.level, this.engine.scene);
          this.enemies.push(e);
        }
      };
    } else {
      this.spawnWaveEnemies();
    }
  }

  private spawnWaveEnemies(): void {
    const scaling = CONFIG.progression.scaling;
    const count = Math.floor(scaling.enemyCountBase + scaling.enemyCountPerLevel * this.level);
    const types: EnemyTypeName[] = ['crow', 'crow', 'serpent'];
    if (this.level >= 4) types.push('dragon');

    for (let i = 0; i < count; i++) {
      const type = types[i % types.length]!;
      const angle = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 120;
      const spawn = new THREE.Vector3(
        Math.cos(angle) * r,
        40 + Math.random() * 60,
        Math.sin(angle) * r,
      );
      this.enemies.push(
        new Enemy(this.nextEnemyId++, spawn, type, this.level, this.engine.scene),
      );
    }
  }

  private onLevelComplete(): void {
    this.state = 'level_complete';
    this.sfx.levelComplete();
    this.input.exitPointerLock();

    const grade = this.flight.hp > 80 ? 'S' : this.flight.hp > 50 ? 'A' : this.flight.hp > 25 ? 'B' : 'C';
    this.hud.showLevelComplete(this.level, grade);

    // Bind next level button
    setTimeout(() => {
      const btn = document.getElementById('hud-next-level');
      if (btn) {
        btn.addEventListener('click', () => {
          this.hud.hideEndScreens();
          if (this.level >= CONFIG.progression.totalLevels) {
            // Game won — could show final screen
            this.state = 'game_over';
          } else {
            this.initLevel(this.level + 1);
            this.state = 'briefing';
            this.briefingTimer = 1.5;
            this.input.requestPointerLock();
          }
        }, { once: true });
      }
    }, 100);
  }

  private onDeath(): void {
    this.state = 'dead';
    this.sfx.death();
    this.input.exitPointerLock();
    this.hud.showGameOver({
      level: this.level,
      kills: this.totalKills,
      time: this.elapsedTime,
    });

    // Bind restart
    setTimeout(() => {
      const btn = document.getElementById('hud-restart');
      if (btn) {
        btn.addEventListener('click', () => {
          this.restart();
        }, { once: true });
      }
    }, 100);
  }

  private restart(): void {
    this.totalKills = 0;
    this.elapsedTime = 0;
    this.nextEnemyId = 0;
    this.hud.hideEndScreens();

    this.initLevel(1);
    this.state = 'briefing';
    this.briefingTimer = 1.5;
    this.input.requestPointerLock();
  }

  dispose(): void {
    for (const e of this.enemies) e.dispose(this.engine.scene);
    if (this.boss) this.boss.dispose(this.engine.scene);
    this.arena?.dispose(this.engine.scene);
    this.weaponSystem?.dispose();
    this.flight?.dispose();
    this.cameraSystem?.dispose();
    this.input.dispose();
    this.engine.dispose();
  }
}
```

- [ ] **Step 2: Update main.ts to match new Game API**

The `main.ts` from Task 1 Step 7 should still work since Game.start() is the entry point. No changes needed.

- [ ] **Step 3: Verify full build and test**

```bash
pnpm typecheck && pnpm dev
```

Full game loop: click Start → briefing → wave 1 spawns enemies → kill all → rest → wave 2 → wave 3 (boss on level 3) → level complete → next level. Death → game over → restart.

- [ ] **Step 4: Commit**

```bash
git add src/Game.ts
git commit -m "feat: implement full game loop with wave system, boss spawning, level progression, death/restart"
```

---

### Task 14: Update index.html for XianxiaAirCombat

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace index.html with clean xianxia-themed page**

Strip all old HUD elements. The new HUD is built dynamically by `src/ui/Hud.ts`. Keep only the game container, overlay, and basic CSS.

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>仙侠空战</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #000; font-family: 'Courier New', monospace; }
    #game { width: 100vw; height: 100vh; }
    #overlay {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(0,0,0,0.85); z-index: 500; color: #fff;
    }
    #overlay h1 { font-size: 48px; color: #daa520; margin-bottom: 8px; }
    #overlay .subtitle { font-size: 16px; color: #888; margin-bottom: 32px; }
    #overlay .controls {
      font-size: 13px; color: #aaa; margin-bottom: 24px;
      display: grid; grid-template-columns: auto auto; gap: 4px 16px;
    }
    #overlay .controls span:nth-child(odd) { color: #daa520; text-align: right; }
    #start {
      padding: 14px 48px; font-size: 18px; cursor: pointer;
      background: transparent; color: #daa520; border: 1px solid #daa520;
      border-radius: 4px; transition: background 0.2s;
    }
    #start:hover { background: rgba(218,165,32,0.15); }
  </style>
</head>
<body>
  <div id="game"></div>

  <div id="overlay">
    <h1>仙侠空战</h1>
    <div class="subtitle">御剑飞行 · 斩妖除魔</div>
    <div class="controls">
      <span>W/A/S/D</span><span>前后左右推力</span>
      <span>Space / Shift</span><span>上升 / 下降</span>
      <span>Q / E</span><span>翻滚</span>
      <span>鼠标</span><span>偏航 / 俯仰</span>
      <span>左键</span><span>灵力射线</span>
      <span>V</span><span>切换视角</span>
      <span>Tab</span><span>加力</span>
      <span>F</span><span>飞剑冲刺</span>
    </div>
    <button id="start">点击开始</button>
  </div>

  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Update style.css if needed**

Ensure `src/style.css` exists and is minimal (remove old HUD styles).

- [ ] **Step 3: Verify full build**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add index.html src/style.css
git commit -m "feat: replace index.html with xianxia-themed overlay and clean HUD container"
```

---

### Task 15: PlayerModel — Third-Person Character

**Files:**
- Create: `src/player/PlayerModel.ts`

- [ ] **Step 1: Implement PlayerModel**

Create `src/player/PlayerModel.ts`:

```typescript
import * as THREE from 'three';
import type { FlightController } from './FlightController';
import type { CameraSystem } from '../core/CameraSystem';

/**
 * PlayerModel — third-person character visible when in third-person camera.
 * Procedural humanoid on flying sword with tilt animations.
 * Hidden in first-person mode.
 */
export class PlayerModel {
  readonly group = new THREE.Group();
  private swordTrail: THREE.Mesh;

  constructor(private readonly scene: THREE.Scene) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x2244aa, emissiveIntensity: 0.5 });
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x222222 });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.6, 1.0, 0.4);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.5;
    this.group.add(torso);
    this.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(torsoGeo), outlineMat));

    // Head
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.2;
    this.group.add(head);

    // Flying sword platform beneath feet
    const swordGeo = new THREE.BoxGeometry(0.3, 0.05, 1.2);
    const sword = new THREE.Mesh(swordGeo, accentMat);
    sword.position.y = -0.2;
    this.group.add(sword);

    // Sword glow trail
    const trailGeo = new THREE.PlaneGeometry(0.2, 2);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this.swordTrail = new THREE.Mesh(trailGeo, trailMat);
    this.swordTrail.position.set(0, -0.2, 1.2);
    this.swordTrail.rotation.x = Math.PI / 2;
    this.group.add(this.swordTrail);

    scene.add(this.group);
  }

  update(flight: FlightController, camera: CameraSystem): void {
    // Position at player
    this.group.position.copy(flight.position);
    this.group.quaternion.copy(flight.quaternion);

    // Visibility: hide in first person
    this.group.visible = camera.getMode() === 'third_person';

    // Trail opacity based on speed
    const speed = flight.getSpeed();
    const trailMat = this.swordTrail.material as THREE.MeshBasicMaterial;
    trailMat.opacity = Math.min(0.6, speed / 100);
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
```

- [ ] **Step 2: Wire PlayerModel into Game.ts**

Import:
```typescript
import { PlayerModel } from './player/PlayerModel';
```

Add field:
```typescript
private playerModel!: PlayerModel;
```

In `initLevel`, after flight/camera creation:
```typescript
if (!this.playerModel) {
  this.playerModel = new PlayerModel(this.engine.scene);
}
```

In `update()`, after cameraSystem update:
```typescript
this.playerModel.update(this.flight, this.cameraSystem);
```

In `dispose()`:
```typescript
this.playerModel?.dispose();
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm dev
```

In third-person mode (default), you should see a small character on a flying sword. In first-person (press V), the model hides.

- [ ] **Step 4: Commit**

```bash
git add src/player/PlayerModel.ts src/Game.ts
git commit -m "feat: add PlayerModel with procedural humanoid on flying sword, visibility toggle"
```

---

### Task 16: Pickup System

**Files:**
- Create: `src/world/Pickup.ts`

- [ ] **Step 1: Implement Pickup**

Create `src/world/Pickup.ts`:

```typescript
import * as THREE from 'three';
import { CONFIG } from '../config';

export type PickupType = 'spirit' | 'health' | 'missile';

/**
 * Pickup — collectible item floating in the arena.
 * Bobs up/down, rotates, collected when player sphere overlaps.
 */
export class Pickup {
  readonly mesh: THREE.Mesh;
  readonly type: PickupType;
  readonly position: THREE.Vector3;
  collected = false;

  constructor(type: PickupType, position: THREE.Vector3, scene: THREE.Scene) {
    this.type = type;
    this.position = position.clone();

    const cfgMap = {
      spirit: { color: CONFIG.pickups.spiritOrb.color, size: 0.6 },
      health: { color: CONFIG.pickups.healthPill.color, size: 0.5 },
      missile: { color: CONFIG.pickups.missileBox.color, size: 0.7 },
    };
    const cfg = cfgMap[type];

    const geo = type === 'missile'
      ? new THREE.BoxGeometry(cfg.size, cfg.size, cfg.size)
      : new THREE.SphereGeometry(cfg.size / 2, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.5,
      roughness: 0.3,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }

  update(dt: number): void {
    if (this.collected) return;
    // Bob and rotate
    this.mesh.position.y = this.position.y + Math.sin(performance.now() * 0.003 + this.position.x) * 0.5;
    this.mesh.rotation.y += dt * 2;
  }

  /** Check if player sphere overlaps pickup. */
  checkCollect(playerPos: THREE.Vector3, playerRadius: number): boolean {
    if (this.collected) return false;
    const dist = this.mesh.position.distanceTo(playerPos);
    return dist < playerRadius + 1.0;
  }

  collect(): { spirit: number; health: number; missiles: number } {
    this.collected = true;
    this.mesh.visible = false;

    switch (this.type) {
      case 'spirit': return { spirit: CONFIG.pickups.spiritOrb.value, health: 0, missiles: 0 };
      case 'health': return { spirit: 0, health: CONFIG.pickups.healthPill.value, missiles: 0 };
      case 'missile': return { spirit: 0, health: 0, missiles: CONFIG.pickups.missileBox.value };
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
```

- [ ] **Step 2: Wire pickups into Game.ts**

Import:
```typescript
import { Pickup, type PickupType } from './world/Pickup';
```

Add field:
```typescript
private pickups: Pickup[] = [];
```

Add spawn method:
```typescript
private spawnPickups(): void {
  for (const p of this.pickups) p.dispose(this.engine.scene);
  this.pickups = [];

  const spots = this.arena.pickupSpots.slice(0, 10);
  const types: PickupType[] = ['spirit', 'health', 'missile'];
  for (let i = 0; i < spots.length; i++) {
    const type = types[i % types.length]!;
    this.pickups.push(new Pickup(type, spots[i]!, this.engine.scene));
  }
}
```

Call `this.spawnPickups()` at the end of `initLevel`.

In `update()`, add pickup collection:
```typescript
// Update pickups
for (const pickup of this.pickups) {
  pickup.update(dt);
  if (pickup.checkCollect(this.flight.position, CONFIG.flight.playerRadius)) {
    const loot = pickup.collect();
    if (loot.health > 0) this.flight.hp = Math.min(CONFIG.player.maxHealth, this.flight.hp + loot.health);
    if (loot.spirit > 0) this.flight.spirit = Math.min(CONFIG.spirit.maxSpirit, this.flight.spirit + loot.spirit);
    if (loot.missiles > 0) this.weaponSystem.addMissileAmmo(loot.missiles);
    this.sfx.chestOpen();
  }
}
```

In dispose:
```typescript
for (const p of this.pickups) p.dispose(this.engine.scene);
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm dev
```

Colored pickups should float on islands/building tops, bob and rotate, and be collected on fly-through.

- [ ] **Step 4: Commit**

```bash
git add src/world/Pickup.ts src/Game.ts
git commit -m "feat: implement Pickup system with spirit/health/missile collectibles"
```

---

### Task 17: Final Polish — Typecheck, Build Verification, Cleanup

**Files:**
- Various cleanup

- [ ] **Step 1: Run full typecheck and fix any errors**

```bash
pnpm typecheck
```

Fix any remaining type errors. Common issues:
- Missing imports
- Unused variables (strict mode)
- Type mismatches between interfaces

- [ ] **Step 2: Run production build**

```bash
pnpm build
```

Verify it completes without errors and the `dist/` output is generated.

- [ ] **Step 3: Test production build**

```bash
pnpm preview
```

Open in browser, play through at least 1 full level to verify:
- Flight controls work (WASD, mouse, Q/E roll, Space/Shift)
- Camera toggle (V key)
- Beam weapon fires and damages enemies
- Enemies spawn, chase, attack
- Wave progression (3 waves per level)
- Boss spawns on level 3
- Pickups can be collected
- HUD displays correctly (HP, spirit, altitude, speed, radar)
- Death → game over → restart works
- Level complete → next level works

- [ ] **Step 4: Clean up any remaining old files**

```bash
# Verify no old files remain
ls src/Maze.ts src/Room.ts src/Door.ts src/Chest.ts src/CardPicker.ts src/Hazard.ts 2>/dev/null
# Should show "No such file"
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final typecheck, build verification, cleanup for xianxia air combat v1"
```

---

## Summary

| Phase | Tasks | What it builds |
|-------|-------|----------------|
| 1: Cleanup & Config | Tasks 1-2 | Clean slate + new config |
| 2: Flight & Camera | Tasks 3-5 | Flyable character with dual camera |
| 3: Floating World | Tasks 6-7 | Procedural arena with buildings, skybox |
| 4: Weapons & Enemies | Tasks 8-10 | Spirit beam, enemy AI, boss |
| 5: HUD & Audio | Tasks 11-12 | Flight instruments, xianxia sounds |
| 6: Integration | Tasks 13-17 | Game loop, waves, pickups, polish |

**Total: 17 tasks, ~85 steps**

Each phase produces a working, testable build. Phase 2 is the first "flyable" milestone. Phase 3 adds the world. Phase 4 adds combat. Phase 6 ties everything together into a playable game.
