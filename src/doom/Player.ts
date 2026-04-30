import * as THREE from 'three';
import { CONFIG } from './config';
import type { Input } from '../shared/Input';
import type { CollisionProvider } from './Level';

/**
 * First-person player controller with pointer-lock look, WASD movement,
 * jump + gravity, and AABB wall collision via Level.resolveCircleVsWalls.
 *
 * Uses yaw/pitch Euler decomposed so that movement is always world-horizontal
 * regardless of look direction (Doom style — no flying by looking up).
 */
export class Player {
  readonly camera: THREE.PerspectiveCamera;
  readonly position = new THREE.Vector3(0, CONFIG.player.height, 8);
  readonly velocityY = { v: 0 };
  private yaw = 0;
  private pitch = 0;
  private readonly mouseSens = 0.0022;
  private onGround = true;
  private recoilPitch = 0;

  hp: number = CONFIG.player.maxHealth;
  ammo: number = CONFIG.player.maxAmmo;
  alive = true;

  // Buff bonuses (applied by Game from card picks)
  speedBonus = 0;
  sprintBonus = 0;
  maxHealthBonus = 0;
  shieldHits = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private level: CollisionProvider,
  ) {
    this.camera = camera;
    this.attachFlashlight();
    this.syncCamera();
  }

  /**
   * Flashlight — a SpotLight parented to the camera, always pointing forward.
   * Gives the player a moving pool of bright light in the direction they look.
   */
  private attachFlashlight(): void {
    const light = new THREE.SpotLight(
      0xffffff,     // pure white
      4.0,          // softer intensity
      50,           // distance
      Math.PI / 4,  // wider angle ~45°
      0.6,          // penumbra
      1.0,          // decay
    );
    light.position.set(0, 0, 0);
    // Target must be in the scene for SpotLight to aim; we parent it to
    // the camera at z=-1 so it always tracks look direction.
    const target = new THREE.Object3D();
    target.position.set(0, 0, -1);
    this.camera.add(light);
    this.camera.add(target);
    light.target = target;
  }

  respawn(): void {
    this.position.set(0, CONFIG.player.height, 8);
    this.velocityY.v = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.hp = CONFIG.player.maxHealth;
    this.ammo = CONFIG.player.maxAmmo;
    this.alive = true;
    this.syncCamera();
  }

  private savedPosition = new THREE.Vector3();
  private savedYaw = 0;
  private savedPitch = 0;

  /** Save current position for returning from a room */
  savePosition(): void {
    this.savedPosition.copy(this.position);
    this.savedYaw = this.yaw;
    this.savedPitch = this.pitch;
  }

  /** Restore saved position (returning from a room) */
  restorePosition(): void {
    this.position.copy(this.savedPosition);
    this.yaw = this.savedYaw;
    this.pitch = this.savedPitch;
    this.velocityY.v = 0;
    this.syncCamera();
  }

  /** Teleport to a specific position */
  teleportTo(x: number, z: number): void {
    this.position.set(x, CONFIG.player.height, z);
    this.velocityY.v = 0;
    this.syncCamera();
  }

  setLevel(level: CollisionProvider): void {
    this.level = level;
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    let dmg = amount;
    if (this.shieldHits > 0) {
      dmg = Math.round(dmg / 2);
      this.shieldHits--;
    }
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  addRecoil(kick: number): void {
    this.recoilPitch += kick;
  }

  update(dt: number): void {
    if (!this.alive) return;

    // 1. Look — apply accumulated mouse delta
    const { dx, dy } = this.input.consumeMouseDelta();
    this.yaw -= dx * this.mouseSens;
    this.pitch -= dy * this.mouseSens;
    // clamp pitch
    const maxPitch = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    // Recoil recovers toward 0
    const recover = CONFIG.weapon.recoilRecover * dt;
    this.recoilPitch = Math.max(0, this.recoilPitch - recover);

    // 2. Movement — horizontal only, in local yaw frame
    const forward = this.input.isDown('w') ? 1 : this.input.isDown('s') ? -1 : 0;
    const strafe = this.input.isDown('d') ? 1 : this.input.isDown('a') ? -1 : 0;
    const sprint = this.input.isDown('shift');
    const speed = sprint
      ? CONFIG.player.sprintSpeed + this.sprintBonus
      : CONFIG.player.moveSpeed + this.speedBonus;

    // Yaw-based forward vector (X-Z plane)
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    // forward along -Z when yaw=0
    const fx = -sin, fz = -cos;
    const rx = cos, rz = -sin;

    let vx = (fx * forward + rx * strafe) * speed;
    let vz = (fz * forward + rz * strafe) * speed;

    // Normalize diagonal
    const mag = Math.hypot(vx, vz);
    if (mag > speed && mag > 0) {
      vx = (vx / mag) * speed;
      vz = (vz / mag) * speed;
    }

    // 3. Integrate XZ, then resolve against walls
    let nx = this.position.x + vx * dt;
    let nz = this.position.z + vz * dt;
    const resolved = this.level.resolveCircleVsWalls(nx, nz, CONFIG.player.radius);
    nx = resolved.x;
    nz = resolved.z;
    this.position.x = nx;
    this.position.z = nz;

    // 4. Gravity + jump
    if (this.input.isDown(' ') && this.onGround) {
      this.velocityY.v = CONFIG.player.jumpVelocity;
      this.onGround = false;
    }
    this.velocityY.v -= CONFIG.player.gravity * dt;
    this.position.y += this.velocityY.v * dt;

    // Floor clamp at eye height
    const floorEye = CONFIG.player.height;
    if (this.position.y <= floorEye) {
      this.position.y = floorEye;
      this.velocityY.v = 0;
      this.onGround = true;
    }

    this.syncCamera();
  }

  getYaw(): number {
    return this.yaw;
  }

  getPitch(): number {
    return this.pitch;
  }

  /** Get the forward direction the camera is looking (for shooting raycasts). */
  getLookDir(): THREE.Vector3 {
    const v = new THREE.Vector3(0, 0, -1);
    v.applyEuler(new THREE.Euler(this.pitch + this.recoilPitch, this.yaw, 0, 'YXZ'));
    return v.normalize();
  }

  private syncCamera(): void {
    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch;
  }
}
