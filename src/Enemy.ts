import * as THREE from 'three';
import { CONFIG } from './config';
import type { Player } from './Player';
import type { Level } from './Level';

export type EnemyState = 'idle' | 'chase' | 'attack' | 'dead';

/**
 * Enemy — white body with black wireframe outline, matching the scene style.
 * Red emissive eye strip for gameplay visibility. Simple FSM:
 *   idle      → chase (player enters engageDistance)
 *   chase     → attack (within stopDistance)
 *   attack    → fires with attackCooldown, backs to chase if player flees
 *   any → dead when HP reaches 0
 *
 * Exposes `hitbox` (invisible mesh used by raycast) so Weapon can hit-test.
 */
export class Enemy {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh;

  private body: THREE.Mesh;
  private eyes: THREE.Mesh;
  private eyeMat: THREE.MeshStandardMaterial;
  private bodyMat: THREE.MeshStandardMaterial;

  position = new THREE.Vector3();
  hp: number = CONFIG.enemy.health;
  alive = true;
  state: EnemyState = 'idle';
  private attackTimer = 0;
  private deathTimer = 0;

  constructor(spawn: THREE.Vector3, scene: THREE.Scene) {
    this.position.copy(spawn);
    this.position.y = 0;

    const h = CONFIG.enemy.height;
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000 });

    // White body with black outline
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      roughness: 0.4,
      metalness: 0.0,
    });
    const bodyGeo = new THREE.BoxGeometry(CONFIG.enemy.radius * 1.5, h, CONFIG.enemy.radius * 1.5);
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.position.y = h / 2;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Black wireframe outline on body
    const bodyWireframe = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), outlineMat);
    bodyWireframe.position.copy(this.body.position);
    this.group.add(bodyWireframe);

    // Red eyes strip for visibility
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0x330000,
      emissive: 0xff2222,
      emissiveIntensity: 2.0,
    });
    const eyeGeo = new THREE.BoxGeometry(CONFIG.enemy.radius * 1.2, 0.08, 0.05);
    this.eyes = new THREE.Mesh(eyeGeo, this.eyeMat);
    this.eyes.position.y = h - 0.3;
    this.eyes.position.z = CONFIG.enemy.radius * 0.75;
    this.group.add(this.eyes);

    // Hitbox — invisible mesh slightly larger than body for easier hits
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(CONFIG.enemy.radius * 1.8, h * 1.05, CONFIG.enemy.radius * 1.8),
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

    // Briefly darken body on hit
    this.bodyMat.color.setHex(0xaaaaaa);
    setTimeout(() => {
      if (this.alive) this.bodyMat.color.setHex(0xf0f0f0);
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
    this.bodyMat.color.setHex(0xcccccc);
    this.eyeMat.emissiveIntensity = 0;
  }

  /**
   * @returns true if enemy shot this frame (used by Game to deal damage)
   */
  update(dt: number, player: Player, level: Level): { shot: boolean } {
    if (!this.alive) {
      // Death collapse animation — fall over then sink
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        const t = 1 - this.deathTimer / 1.5;
        this.group.rotation.x = Math.min(Math.PI / 2, t * Math.PI / 2 * 1.5);
        this.group.position.y = Math.max(-0.5, -t * 0.5);
      }
      return { shot: false };
    }

    const toPlayer = new THREE.Vector3(
      player.position.x - this.position.x,
      0,
      player.position.z - this.position.z,
    );
    const dist = toPlayer.length();

    // FSM
    if (this.state === 'idle' && dist < CONFIG.enemy.engageDistance) {
      this.state = 'chase';
    }
    if (this.state === 'chase' && dist < CONFIG.enemy.stopDistance) {
      this.state = 'attack';
    }
    if (this.state === 'attack' && dist > CONFIG.enemy.stopDistance * 1.3) {
      this.state = 'chase';
    }

    // Face the player (always, when alive)
    const yaw = Math.atan2(toPlayer.x, toPlayer.z);
    this.group.rotation.y = yaw;

    let shot = false;

    if (this.state === 'chase') {
      if (dist > 0.01) {
        toPlayer.normalize();
        const speed = CONFIG.enemy.moveSpeed;
        const nx = this.position.x + toPlayer.x * speed * dt;
        const nz = this.position.z + toPlayer.z * speed * dt;
        const resolved = level.resolveCircleVsWalls(nx, nz, CONFIG.enemy.radius);
        this.position.x = resolved.x;
        this.position.z = resolved.z;
      }
    } else if (this.state === 'attack') {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = CONFIG.enemy.attackCooldown;
        // Probabilistic hit
        if (Math.random() < CONFIG.enemy.attackChance) {
          shot = true;
        }
        // Visual tell: eye strip briefly flashes brighter
        this.eyeMat.emissiveIntensity = 4.5;
        setTimeout(() => {
          if (this.alive) this.eyeMat.emissiveIntensity = 2.0;
        }, 120);
      }
    }

    // Bob a tiny bit while alive for life
    const bob = Math.sin(performance.now() * 0.004 + this.position.x) * 0.02;
    this.group.position.set(this.position.x, bob, this.position.z);

    return { shot };
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.body.geometry.dispose();
    this.bodyMat.dispose();
    this.eyes.geometry.dispose();
    this.eyeMat.dispose();
  }
}
