import * as THREE from 'three';
import { CONFIG } from './config';

/**
 * View-model weapon: a geometric "rifle" attached to the camera, visible in
 * the bottom-right corner. White body with black outlines matching the scene
 * art style. Plays animations (muzzle flash, recoil sway).
 */
export class WeaponModel {
  readonly group = new THREE.Group();
  private readonly muzzleFlash: THREE.Mesh;
  private flashTimer = 0;
  private recoilOffset = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    const outlineColor = 0x000000;
    const outlineMat = new THREE.LineBasicMaterial({ color: outlineColor });

    // Gun body: white with black outline
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      metalness: 0.1,
      roughness: 0.4,
    });
    const bodyGeo = new THREE.BoxGeometry(0.12, 0.14, 0.6);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0, -0.3);
    this.group.add(body);
    const bodyWire = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), outlineMat);
    bodyWire.position.copy(body.position);
    this.group.add(bodyWire);

    // Barrel — white cylinder with outline
    const barrelGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.5, 12);
    const barrel = new THREE.Mesh(barrelGeo, bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.62);
    this.group.add(barrel);
    const barrelWire = new THREE.LineSegments(new THREE.EdgesGeometry(barrelGeo), outlineMat);
    barrelWire.rotation.copy(barrel.rotation);
    barrelWire.position.copy(barrel.position);
    this.group.add(barrelWire);

    // Grip — white with outline
    const gripGeo = new THREE.BoxGeometry(0.08, 0.18, 0.1);
    const grip = new THREE.Mesh(gripGeo, bodyMat);
    grip.position.set(0, -0.14, -0.15);
    grip.rotation.x = 0.2;
    this.group.add(grip);
    const gripWire = new THREE.LineSegments(new THREE.EdgesGeometry(gripGeo), outlineMat);
    gripWire.position.copy(grip.position);
    gripWire.rotation.copy(grip.rotation);
    this.group.add(gripWire);

    // Dark accent strip for contrast
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.1,
    });
    const accentGeo = new THREE.BoxGeometry(0.02, 0.03, 0.4);
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.set(0.06, 0.04, -0.25);
    this.group.add(accent);

    // Muzzle flash (hidden by default)
    const flashMat = new THREE.MeshBasicMaterial({
      color: CONFIG.colors.muzzleFlash,
      transparent: true,
      opacity: 0,
    });
    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      flashMat,
    );
    this.muzzleFlash.position.set(0, 0.02, -0.92);
    this.group.add(this.muzzleFlash);

    // Attach to camera, offset to bottom-right
    this.group.position.set(0.22, -0.18, -0.35);
    camera.add(this.group);
  }

  fire(): void {
    this.flashTimer = CONFIG.weapon.muzzleFlashDuration;
    this.recoilOffset = 0.08;
  }

  update(dt: number): void {
    // Muzzle flash fade
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const mat = this.muzzleFlash.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, this.flashTimer / CONFIG.weapon.muzzleFlashDuration);
      this.muzzleFlash.scale.setScalar(1 + Math.random() * 0.3);
    } else {
      (this.muzzleFlash.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // Recoil recovery (gun jerks back, returns)
    this.recoilOffset = Math.max(0, this.recoilOffset - dt * 0.6);
    this.group.position.z = -0.35 + this.recoilOffset;
  }
}
