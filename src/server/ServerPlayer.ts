import { KEY, type InputMessage, type Team } from '../shared/protocol';
import { resolveCircleVsAABBs, type AABB2D } from '../shared/collision';

// ─── Constants (must match config.ts) ───

export const PLAYER_HEIGHT = 1.75;
export const PLAYER_RADIUS = 0.4;
const MOVE_SPEED = 6.0;
const SPRINT_SPEED = 10.0;
const JUMP_VELOCITY = 6.2;
const GRAVITY = 22.0;
export const MAX_HP = 100;
export const MAX_AMMO = 30;

const INVINCIBLE_DURATION = 2.0;

export class ServerPlayer {
  id: number;
  name: string;
  team: Team = 'red';
  isBot = false;

  // Position — y is eye-level (PLAYER_HEIGHT when on floor)
  x = 0;
  z = 0;
  y = PLAYER_HEIGHT;
  vy = 0;

  yaw = 0;
  pitch = 0;

  hp = MAX_HP;
  ammo = MAX_AMMO;
  alive = true;
  kills = 0;
  deaths = 0;
  score = 0;

  invincible = false;
  invincibleTimer = 0;

  respawnTimer = 0;

  lastInputSeq = 0;
  inputQueue: InputMessage[] = [];

  pendingFire = false;
  pendingInteract = false;

  private onGround = true;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }

  /** Consume all queued inputs for this tick and apply movement. */
  processInputs(dt: number, walls: AABB2D[]): void {
    if (!this.alive) return;

    for (const inp of this.inputQueue) {
      this.yaw = inp.yaw;
      this.pitch = inp.pitch;
      if (inp.fire) this.pendingFire = true;
      if (inp.interact) this.pendingInteract = true;
      this.lastInputSeq = inp.seq;
    }

    // Build aggregated movement from last input keys (use latest input for keys)
    const lastInput = this.inputQueue[this.inputQueue.length - 1];
    this.inputQueue.length = 0;

    if (!lastInput) return;

    const keys = lastInput.keys;
    const forward = (keys & KEY.W ? 1 : 0) + (keys & KEY.S ? -1 : 0);
    const strafe = (keys & KEY.D ? 1 : 0) + (keys & KEY.A ? -1 : 0);
    const sprint = !!(keys & KEY.SHIFT);
    const speed = sprint ? SPRINT_SPEED : MOVE_SPEED;

    // Yaw-based forward vector (X-Z plane) — matches Player.ts exactly
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
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

    // Integrate XZ, resolve against walls
    let nx = this.x + vx * dt;
    let nz = this.z + vz * dt;
    const resolved = resolveCircleVsAABBs(nx, nz, PLAYER_RADIUS, walls);
    nx = resolved.x;
    nz = resolved.z;
    this.x = nx;
    this.z = nz;

    // Gravity + jump
    if ((keys & KEY.SPACE) && this.onGround) {
      this.vy = JUMP_VELOCITY;
      this.onGround = false;
    }
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;

    // Floor clamp at eye height
    if (this.y <= PLAYER_HEIGHT) {
      this.y = PLAYER_HEIGHT;
      this.vy = 0;
      this.onGround = true;
    }
  }

  /** Countdown invincibility timer. */
  updateTimers(dt: number): void {
    if (this.invincible) {
      this.invincibleTimer -= dt;
      if (this.invincibleTimer <= 0) {
        this.invincible = false;
        this.invincibleTimer = 0;
      }
    }
  }

  /** Apply damage. Returns true if player died. Respects invincibility. */
  takeDamage(amount: number): boolean {
    if (!this.alive || this.invincible) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.alive = false;
      this.deaths++;
      return true;
    }
    return false;
  }

  /** Respawn with full HP/ammo and invincibility. */
  respawnAt(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.y = PLAYER_HEIGHT;
    this.vy = 0;
    this.onGround = true;
    this.hp = MAX_HP;
    this.ammo = MAX_AMMO;
    this.alive = true;
    this.invincible = true;
    this.invincibleTimer = INVINCIBLE_DURATION;
    this.respawnTimer = 0;
    this.pendingFire = false;
    this.pendingInteract = false;
    this.inputQueue.length = 0;
  }

  /** Teleport to a position (no reset of HP/ammo). */
  teleportTo(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.y = PLAYER_HEIGHT;
    this.vy = 0;
    this.onGround = true;
  }
}
