import * as THREE from 'three';
import { CONFIG } from './config';
import type { Player } from './Player';
import type { Enemy } from './Enemy';
import type { WeaponModel } from './WeaponModel';
import type { Sfx } from './Sfx';

export interface HitResult {
  enemy: Enemy;
  distance: number;
  point: THREE.Vector3;
}

/**
 * Weapon — manages fire rate, ammo, hitscan logic, and integrates with
 * the view-model + sound.
 *
 * Hitscan: a single ray from the camera origin along the look direction;
 * tested against enemy bounding spheres. First hit wins. Range-limited.
 */
export class Weapon {
  private cooldown = 0;
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly player: Player,
    private readonly model: WeaponModel,
    private readonly sfx: Sfx,
  ) {}

  reset(): void {
    this.cooldown = 0;
  }

  canFire(): boolean {
    return this.cooldown <= 0 && this.player.ammo > 0 && this.player.alive;
  }

  /**
   * Attempt to fire; returns the hit enemy (if any) or null.
   */
  tryFire(enemies: Enemy[]): HitResult | null {
    if (!this.canFire()) {
      if (this.player.ammo <= 0) this.sfx.empty();
      return null;
    }

    this.cooldown = CONFIG.weapon.fireRate;
    this.player.ammo -= 1;
    this.player.addRecoil(CONFIG.weapon.recoilKick);
    this.model.fire();
    this.sfx.shoot();

    // Hitscan
    const origin = this.player.camera.position.clone();
    const dir = this.player.getLookDir();
    this.raycaster.set(origin, dir);
    this.raycaster.far = CONFIG.weapon.maxRange;

    // Build a flat list of alive enemy meshes and pair with Enemy refs
    const meshes: THREE.Object3D[] = [];
    const meshToEnemy = new Map<number, Enemy>();
    for (const e of enemies) {
      if (!e.alive) continue;
      meshes.push(e.hitbox);
      meshToEnemy.set(e.hitbox.id, e);
    }

    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const first = hits[0]!;
      const enemy = meshToEnemy.get(first.object.id);
      if (enemy) {
        enemy.takeDamage(CONFIG.weapon.damage);
        return {
          enemy,
          distance: first.distance,
          point: first.point.clone(),
        };
      }
    }
    return null;
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
  }
}
