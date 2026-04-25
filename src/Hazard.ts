import * as THREE from 'three';
import { CONFIG } from './config';

export interface HazardAABB {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

/**
 * Hazard — a red glowing floor patch that deals damage-over-time.
 */
export class Hazard {
  readonly group = new THREE.Group();
  readonly aabb: HazardAABB;
  readonly damagePerSecond: number;

  constructor(x: number, z: number, scene: THREE.Scene) {
    const size = CONFIG.hazard.size;
    const halfSize = size / 2;
    this.damagePerSecond = CONFIG.hazard.damage;

    this.aabb = {
      minX: x - halfSize,
      maxX: x + halfSize,
      minZ: z - halfSize,
      maxZ: z + halfSize,
    };

    // Red glowing floor plane
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.hazard.color,
      emissive: CONFIG.hazard.emissiveColor,
      emissiveIntensity: CONFIG.hazard.emissiveIntensity,
      transparent: true,
      opacity: 0.6,
      roughness: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    this.group.add(mesh);

    // Subtle red point light for visibility
    const light = new THREE.PointLight(CONFIG.hazard.color, 1.5, 6, 1.0);
    light.position.set(x, 0.5, z);
    this.group.add(light);

    scene.add(this.group);
  }

  /** Check if player position is inside hazard zone */
  isInside(px: number, pz: number): boolean {
    return px > this.aabb.minX && px < this.aabb.maxX &&
           pz > this.aabb.minZ && pz < this.aabb.maxZ;
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
