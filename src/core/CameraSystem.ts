import * as THREE from 'three';

export class CameraSystem {
  readonly camera: THREE.PerspectiveCamera;
  constructor(camera: THREE.PerspectiveCamera) { this.camera = camera; }
  update(_dt: number): void {}
  dispose(): void {}
}
