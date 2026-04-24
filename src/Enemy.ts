import * as THREE from 'three';
import { CONFIG } from './config';
import type { Player } from './Player';
import type { Level } from './Level';

export type EnemyType = 'standard' | 'rusher' | 'tank';
export type EnemyState = 'idle' | 'chase' | 'attack' | 'dead';

/**
 * Enemy — type-based (standard/rusher/tank). White-scene art style with
 * black wireframe outlines. Each type has unique mesh size, color, stats,
 * and behavior.
 */
export class Enemy {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  readonly type: EnemyType;

  private body: THREE.Mesh;
  private eyes: THREE.Mesh;
  private eyeMat: THREE.MeshStandardMaterial;
  private bodyMat: THREE.MeshStandardMaterial;
  private eyes2: THREE.Mesh | null = null; // Tank has double eyes

  position = new THREE.Vector3();
  hp: number;
  alive = true;
  state: EnemyState = 'idle';
  private attackTimer = 0;
  private contactTimer = 0; // Rusher contact cooldown
  private deathTimer = 0;

  // Effective stats (after floor scaling)
  private readonly moveSpeed: number;
  private readonly engageDistance: number;
  private readonly stopDistance: number;
  private readonly attackCooldown: number;
  private readonly attackChance: number;
  private readonly attackDamage: number;
  private readonly contactDamage: number;
  private readonly contactCooldown: number;

  constructor(spawn: THREE.Vector3, scene: THREE.Scene, type: EnemyType, floor: number) {
    this.type = type;
    this.position.copy(spawn);
    this.position.y = 0;

    const hpScale = 1 + CONFIG.enemy.scaling.hpPerFloor * floor;
    const dmgScale = 1 + CONFIG.enemy.scaling.damagePerFloor * floor;

    const baseH = CONFIG.enemy.height;
    const baseR = CONFIG.enemy.radius;
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000 });

    let bodyColor: number;
    let scale: number;
    let h: number;

    if (type === 'standard') {
      const cfg = CONFIG.enemy.types.standard;
      scale = cfg.scale;
      bodyColor = cfg.color;
      this.hp = Math.round(cfg.health * hpScale);
      this.moveSpeed = cfg.moveSpeed;
      this.engageDistance = cfg.engageDistance;
      this.stopDistance = cfg.stopDistance;
      this.attackCooldown = cfg.attackCooldown;
      this.attackChance = cfg.attackChance;
      this.attackDamage = Math.round(cfg.attackDamage * dmgScale);
      this.contactDamage = 0;
      this.contactCooldown = 0;
    } else if (type === 'rusher') {
      const cfg = CONFIG.enemy.types.rusher;
      scale = cfg.scale;
      bodyColor = cfg.color;
      this.hp = Math.round(cfg.health * hpScale);
      this.moveSpeed = cfg.moveSpeed;
      this.engageDistance = cfg.engageDistance;
      this.stopDistance = 0; // never stops
      this.attackCooldown = 0;
      this.attackChance = 0;
      this.attackDamage = 0;
      this.contactDamage = Math.round(cfg.contactDamage * dmgScale);
      this.contactCooldown = cfg.contactCooldown;
    } else {
      // tank
      const cfg = CONFIG.enemy.types.tank;
      scale = cfg.scale;
      bodyColor = cfg.color;
      this.hp = Math.round(cfg.health * hpScale);
      this.moveSpeed = cfg.moveSpeed;
      this.engageDistance = cfg.engageDistance;
      this.stopDistance = cfg.stopDistance;
      this.attackCooldown = cfg.attackCooldown;
      this.attackChance = cfg.attackChance;
      this.attackDamage = Math.round(cfg.attackDamage * dmgScale);
      this.contactDamage = 0;
      this.contactCooldown = 0;
    }

    h = baseH * scale;
    const r = baseR * scale;

    // Body
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.4,
      metalness: 0.0,
    });
    const bodyGeo = new THREE.BoxGeometry(r * 1.5, h, r * 1.5);
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.position.y = h / 2;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Wireframe
    const bodyWire = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), outlineMat);
    bodyWire.position.copy(this.body.position);
    this.group.add(bodyWire);

    // Eyes
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0x330000,
      emissive: 0xff2222,
      emissiveIntensity: 2.0,
    });
    const eyeGeo = new THREE.BoxGeometry(r * 1.2, 0.08, 0.05);
    this.eyes = new THREE.Mesh(eyeGeo, this.eyeMat);
    this.eyes.position.y = h - 0.3 * scale;
    this.eyes.position.z = r * 0.75;
    this.group.add(this.eyes);

    // Tank gets double eye strip
    if (type === 'tank') {
      this.eyes2 = new THREE.Mesh(eyeGeo.clone(), this.eyeMat);
      this.eyes2.position.y = h - 0.5 * scale;
      this.eyes2.position.z = r * 0.75;
      this.group.add(this.eyes2);
    }

    // Hitbox
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(r * 1.8, h * 1.05, r * 1.8),
      hitMat,
    );
    this.hitbox.position.y = h / 2;
    this.group.add(this.hitbox);

    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;

    this.bodyMat.color.setHex(0xaaaaaa);
    setTimeout(() => {
      if (this.alive) this.bodyMat.color.setHex(
        this.type === 'standard' ? CONFIG.enemy.types.standard.color :
        this.type === 'rusher' ? CONFIG.enemy.types.rusher.color :
        CONFIG.enemy.types.tank.color,
      );
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
    this.deathTimer = 1.5;
    this.bodyMat.color.setHex(CONFIG.colors.enemyDead);
    this.eyeMat.emissiveIntensity = 0;
  }

  /**
   * Returns { shot, contactHit }
   * - shot: true if ranged attack hit this frame (standard/tank)
   * - contactHit: true if rusher made contact damage this frame
   */
  update(dt: number, player: Player, level: Level): { shot: boolean; contactHit: boolean } {
    if (!this.alive) {
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        const t = 1 - this.deathTimer / 1.5;
        this.group.rotation.x = Math.min(Math.PI / 2, t * Math.PI / 2 * 1.5);
        this.group.position.y = Math.max(-0.5, -t * 0.5);
      }
      return { shot: false, contactHit: false };
    }

    const toPlayer = new THREE.Vector3(
      player.position.x - this.position.x,
      0,
      player.position.z - this.position.z,
    );
    const dist = toPlayer.length();

    // FSM transitions
    if (this.state === 'idle' && dist < this.engageDistance) {
      this.state = 'chase';
    }
    if (this.type !== 'rusher') {
      if (this.state === 'chase' && dist < this.stopDistance) {
        this.state = 'attack';
      }
      if (this.state === 'attack' && dist > this.stopDistance * 1.3) {
        this.state = 'chase';
      }
    }

    // Face player
    const yaw = Math.atan2(toPlayer.x, toPlayer.z);
    this.group.rotation.y = yaw;

    let shot = false;
    let contactHit = false;

    if (this.state === 'chase') {
      if (dist > 0.01) {
        toPlayer.normalize();
        const nx = this.position.x + toPlayer.x * this.moveSpeed * dt;
        const nz = this.position.z + toPlayer.z * this.moveSpeed * dt;
        const resolved = level.resolveCircleVsWalls(nx, nz, CONFIG.enemy.radius * (this.type === 'rusher' ? CONFIG.enemy.types.rusher.scale : this.type === 'tank' ? CONFIG.enemy.types.tank.scale : 1));
        this.position.x = resolved.x;
        this.position.z = resolved.z;
      }

      // Rusher: contact damage when close
      if (this.type === 'rusher') {
        this.contactTimer = Math.max(0, this.contactTimer - dt);
        const contactRange = CONFIG.enemy.radius * CONFIG.enemy.types.rusher.scale + CONFIG.player.radius + 0.2;
        if (dist < contactRange && this.contactTimer <= 0) {
          contactHit = true;
          this.contactTimer = this.contactCooldown;
        }
      }
    } else if (this.state === 'attack') {
      // Standard / Tank ranged attack
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackCooldown;
        if (Math.random() < this.attackChance) {
          shot = true;
        }
        this.eyeMat.emissiveIntensity = 4.5;
        setTimeout(() => {
          if (this.alive) this.eyeMat.emissiveIntensity = 2.0;
        }, 120);
      }
    }

    // Bob
    const bob = Math.sin(performance.now() * 0.004 + this.position.x) * 0.02;
    this.group.position.set(this.position.x, bob, this.position.z);

    return { shot, contactHit };
  }

  /** Get damage amount for ranged shot or contact */
  getDamage(): number {
    if (this.type === 'rusher') return this.contactDamage;
    return this.attackDamage;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.body.geometry.dispose();
    this.bodyMat.dispose();
    this.eyes.geometry.dispose();
    this.eyeMat.dispose();
  }
}
