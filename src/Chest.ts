import * as THREE from 'three';
import { CONFIG } from './config';

export interface LootResult {
  ammo: number;
  health: number;
}

/**
 * Chest — gold emissive box with lid. Opens on interact, rolls loot.
 */
export class Chest {
  readonly group = new THREE.Group();
  private opened = false;
  private lid: THREE.Mesh;
  private openTimer = 0;

  constructor(x: number, z: number, scene: THREE.Scene) {
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x000000 });

    // Base box
    const baseMat = new THREE.MeshStandardMaterial({
      color: CONFIG.chest.color,
      emissive: CONFIG.chest.emissiveColor,
      emissiveIntensity: CONFIG.chest.emissiveIntensity,
      roughness: 0.3,
      metalness: 0.2,
    });
    const baseGeo = new THREE.BoxGeometry(0.8, 0.5, 0.6);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.25;
    base.castShadow = true;
    this.group.add(base);

    // Outline
    const baseWire = new THREE.LineSegments(new THREE.EdgesGeometry(baseGeo), outlineMat);
    baseWire.position.copy(base.position);
    this.group.add(baseWire);

    // Lid
    const lidGeo = new THREE.BoxGeometry(0.8, 0.12, 0.6);
    this.lid = new THREE.Mesh(lidGeo, baseMat.clone());
    this.lid.position.set(0, 0.56, 0);
    this.lid.castShadow = true;
    this.group.add(this.lid);

    const lidWire = new THREE.LineSegments(new THREE.EdgesGeometry(lidGeo), outlineMat);
    lidWire.position.copy(this.lid.position);
    this.group.add(lidWire);

    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  isOpened(): boolean {
    return this.opened;
  }

  isPlayerNear(px: number, pz: number): boolean {
    if (this.opened) return false;
    const dx = px - this.group.position.x;
    const dz = pz - this.group.position.z;
    return Math.sqrt(dx * dx + dz * dz) < 2.0;
  }

  /** Open the chest and return loot */
  open(): LootResult {
    this.opened = true;
    this.openTimer = 0.4;

    let ammo = 0;
    let health = 0;

    if (Math.random() < CONFIG.chest.ammoChance) {
      ammo = CONFIG.chest.ammoMin + Math.floor(Math.random() * (CONFIG.chest.ammoMax - CONFIG.chest.ammoMin + 1));
    }
    if (Math.random() < CONFIG.chest.healthChance) {
      health = CONFIG.chest.healthMin + Math.floor(Math.random() * (CONFIG.chest.healthMax - CONFIG.chest.healthMin + 1));
    }

    // If both missed, guarantee at least some ammo
    if (ammo === 0 && health === 0) {
      ammo = CONFIG.chest.ammoMin;
    }

    return { ammo, health };
  }

  update(dt: number): void {
    if (this.openTimer > 0) {
      this.openTimer -= dt;
      // Animate lid opening (rotate backward on pivot)
      const t = Math.min(1, 1 - this.openTimer / 0.4);
      this.lid.rotation.x = -t * Math.PI / 3;
      this.lid.position.y = 0.56 + t * 0.15;
      this.lid.position.z = -t * 0.1;
    }
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
