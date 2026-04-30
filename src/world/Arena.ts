import * as THREE from 'three';

export interface ArenaCollider {
  resolveSphereVsBuildings(x: number, y: number, z: number, radius: number): { x: number; y: number; z: number };
}

export class Arena implements ArenaCollider {
  readonly group = new THREE.Group();
  resolveSphereVsBuildings(x: number, y: number, z: number, _radius: number): { x: number; y: number; z: number } {
    return { x, y, z };
  }
  dispose(scene: THREE.Scene): void { scene.remove(this.group); }
}
