import * as THREE from 'three';

export class FlightController {
  readonly position = new THREE.Vector3(0, 60, 0);
  readonly velocity = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  hp = 100;
  alive = true;
  update(_dt: number): void {}
  dispose(): void {}
}
