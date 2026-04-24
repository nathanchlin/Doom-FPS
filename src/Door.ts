import * as THREE from 'three';
import { CONFIG } from './config';
import { DIR, doorWorldPosition, type DoorPlacement, type RoomType } from './Maze';

export type DoorState = 'closed' | 'open' | 'used';

/**
 * Door — dark rectangular frame embedded in a maze wall.
 * Glows when player is within interact distance.
 * Tracks open/used state.
 */
export class Door {
  readonly group = new THREE.Group();
  readonly roomType: RoomType;
  readonly placement: DoorPlacement;
  readonly worldX: number;
  readonly worldZ: number;

  private state: DoorState = 'closed';
  private frameMat: THREE.MeshStandardMaterial;
  private glowMat: THREE.MeshStandardMaterial;
  private glowMesh: THREE.Mesh;

  constructor(placement: DoorPlacement, mazeRows: number, mazeCols: number, scene: THREE.Scene) {
    this.placement = placement;
    this.roomType = placement.roomType;

    const pos = doorWorldPosition(placement, mazeRows, mazeCols);
    this.worldX = pos.x;
    this.worldZ = pos.z;

    const w = CONFIG.door.width;
    const h = CONFIG.door.height;
    const d = 0.15;

    // Determine rotation based on wall direction
    const isNS = placement.wallDir === DIR.N || placement.wallDir === DIR.S;

    // Frame (dark rectangle)
    this.frameMat = new THREE.MeshStandardMaterial({
      color: CONFIG.door.frameColor,
      roughness: 0.3,
      metalness: 0.1,
    });
    const frameGeo = new THREE.BoxGeometry(
      isNS ? w : d,
      h,
      isNS ? d : w,
    );
    const frame = new THREE.Mesh(frameGeo, this.frameMat);
    frame.position.y = h / 2;
    frame.castShadow = true;
    this.group.add(frame);

    // Wireframe
    const edges = new THREE.EdgesGeometry(frameGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    const wireframe = new THREE.LineSegments(edges, edgeMat);
    wireframe.position.copy(frame.position);
    this.group.add(wireframe);

    // Glow indicator (slightly larger, emissive, initially hidden)
    const glowColor = placement.roomType === 'exit' ? CONFIG.door.exitGlowColor : CONFIG.door.glowColor;
    this.glowMat = new THREE.MeshStandardMaterial({
      color: glowColor,
      emissive: glowColor,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
    });
    const glowGeo = new THREE.BoxGeometry(
      isNS ? w + 0.1 : d + 0.1,
      h + 0.1,
      isNS ? d + 0.1 : w + 0.1,
    );
    this.glowMesh = new THREE.Mesh(glowGeo, this.glowMat);
    this.glowMesh.position.y = h / 2;
    this.group.add(this.glowMesh);

    this.group.position.set(this.worldX, 0, this.worldZ);
    scene.add(this.group);
  }

  getState(): DoorState {
    return this.state;
  }

  /** Check if player is within interact distance */
  isPlayerNear(px: number, pz: number): boolean {
    if (this.state === 'used') return false;
    const dx = px - this.worldX;
    const dz = pz - this.worldZ;
    return Math.sqrt(dx * dx + dz * dz) < CONFIG.door.interactDistance;
  }

  /** Update glow based on player proximity */
  setHighlight(near: boolean): void {
    if (this.state === 'used') return;
    this.glowMat.emissiveIntensity = near ? 1.5 : 0;
    this.glowMat.opacity = near ? 0.4 : 0;
  }

  /** Mark as opened (player entered) */
  markUsed(): void {
    this.state = 'used';
    this.frameMat.color.setHex(CONFIG.door.usedColor);
    this.glowMat.emissiveIntensity = 0;
    this.glowMat.opacity = 0;
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
