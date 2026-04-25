import * as THREE from 'three';
import type { Player } from './Player';
import type { Enemy } from './Enemy';
import type { WeaponModel } from './WeaponModel';
import type { Sfx } from './Sfx';
import { getWeaponConfig, type WeaponType, type WeaponConfig } from './weapons';

export interface HitResult {
  enemy: Enemy;
  distance: number;
  point: THREE.Vector3;
}

/**
 * Weapon — manages fire rate, ammo, hitscan logic.
 * Supports multiple weapon types with different stats.
 * Shotgun fires multiple spread rays; rifle/sniper fire single rays.
 */
export class Weapon {
  private cooldown = 0;
  private readonly raycaster = new THREE.Raycaster();
  private config: WeaponConfig;
  private damageMultiplier = 1.0;

  constructor(
    private readonly player: Player,
    private readonly model: WeaponModel,
    private readonly sfx: Sfx,
  ) {
    this.config = getWeaponConfig('rifle');
  }

  reset(): void {
    this.cooldown = 0;
  }

  getConfig(): WeaponConfig {
    return this.config;
  }

  /** Switch to a new weapon type. Returns new magazine size for ammo reset. */
  switchWeapon(type: WeaponType, ammoBonus: number): number {
    this.config = getWeaponConfig(type);
    this.cooldown = 0;
    return this.config.magazine + ammoBonus;
  }

  setDamageMultiplier(mult: number): void {
    this.damageMultiplier = mult;
  }

  canFire(): boolean {
    return this.cooldown <= 0 && this.player.ammo > 0 && this.player.alive;
  }

  getEffectiveDamage(): number {
    return Math.round(this.config.damage * this.damageMultiplier);
  }

  /**
   * Attempt to fire; returns the first hit enemy (if any) or null.
   * Shotgun fires multiple pellets — each can hit independently.
   * Returns the first hit for HUD feedback.
   */
  tryFire(enemies: Enemy[]): HitResult | null {
    if (!this.canFire()) {
      if (this.player.ammo <= 0) this.sfx.empty();
      return null;
    }

    this.cooldown = this.config.fireRate;
    this.player.ammo -= 1;
    this.player.addRecoil(this.config.recoilKick);
    this.model.fire();
    this.sfx.shoot();

    const origin = this.player.camera.position.clone();
    const baseDir = this.player.getLookDir();
    const effectiveDmg = this.getEffectiveDamage();

    // Build enemy mesh list
    const meshes: THREE.Object3D[] = [];
    const meshToEnemy = new Map<number, Enemy>();
    for (const e of enemies) {
      if (!e.alive) continue;
      meshes.push(e.hitbox);
      meshToEnemy.set(e.hitbox.id, e);
    }

    let firstHit: HitResult | null = null;

    for (let p = 0; p < this.config.pellets; p++) {
      let dir: THREE.Vector3;
      if (this.config.spread > 0) {
        // Random spread within cone
        dir = baseDir.clone();
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(baseDir, up).normalize();
        const actualUp = new THREE.Vector3().crossVectors(right, baseDir).normalize();
        const angle = (Math.random() - 0.5) * 2 * this.config.spread;
        const angle2 = (Math.random() - 0.5) * 2 * this.config.spread;
        dir.add(right.multiplyScalar(Math.sin(angle)));
        dir.add(actualUp.multiplyScalar(Math.sin(angle2)));
        dir.normalize();
      } else {
        dir = baseDir;
      }

      this.raycaster.set(origin, dir);
      this.raycaster.far = this.config.maxRange;

      const hits = this.raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const first = hits[0]!;
        const enemy = meshToEnemy.get(first.object.id);
        if (enemy) {
          enemy.takeDamage(effectiveDmg);
          if (!firstHit) {
            firstHit = {
              enemy,
              distance: first.distance,
              point: first.point.clone(),
            };
          }
        }
      }
    }

    return firstHit;
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
  }
}
