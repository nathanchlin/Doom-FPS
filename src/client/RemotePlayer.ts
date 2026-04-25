import * as THREE from 'three';
import type { PlayerState, Team } from '../shared/protocol';
import { InterpolationBuffer, lerp, lerpAngle } from './Interpolation';

const TEAM_COLORS: Record<Team, { body: number; head: number }> = {
  red:  { body: 0xcc3333, head: 0xdd5555 },
  blue: { body: 0x3366cc, head: 0x4488dd },
};

/**
 * Third-person model for other players visible in the scene.
 * Procedural box geometry matching the game's art style.
 */
export class RemotePlayer {
  readonly group = new THREE.Group();
  private body: THREE.Mesh;
  private head: THREE.Mesh;
  private gun: THREE.Mesh;
  private bodyMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;
  private nameSprite: THREE.Sprite;

  readonly interp = new InterpolationBuffer<PlayerState>();
  alive = true;
  id: number;
  team: Team = 'red';

  constructor(id: number, name: string, scene: THREE.Scene) {
    this.id = id;

    // Body — default red team color, updated by pushState
    this.bodyMat = new THREE.MeshStandardMaterial({ color: TEAM_COLORS.red.body, roughness: 0.4 });
    const bodyGeo = new THREE.BoxGeometry(0.6, 1.5, 0.4);
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.body.position.y = 0.75;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Wireframe
    const edges = new THREE.EdgesGeometry(bodyGeo);
    const wireMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    const wire = new THREE.LineSegments(edges, wireMat);
    wire.position.copy(this.body.position);
    this.group.add(wire);

    // Head
    this.headMat = new THREE.MeshStandardMaterial({ color: TEAM_COLORS.red.head, roughness: 0.3 });
    const headGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    this.head = new THREE.Mesh(headGeo, this.headMat);
    this.head.position.y = 1.675;
    this.head.castShadow = true;
    this.group.add(this.head);

    // Gun
    const gunGeo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    this.gun = new THREE.Mesh(gunGeo, gunMat);
    this.gun.position.set(0.25, 1.2, -0.3);
    this.group.add(this.gun);

    // Name tag (sprite)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.scale.set(2, 0.5, 1);
    this.nameSprite.position.y = 2.2;
    this.group.add(this.nameSprite);

    scene.add(this.group);
  }

  pushState(state: PlayerState): void {
    this.interp.push(state);
    this.alive = state.alive;

    // Team color — always update on team change
    this.team = state.team;
    const tc = TEAM_COLORS[state.team];
    this.bodyMat.color.setHex(tc.body);
    this.headMat.color.setHex(tc.head);

    // Invincibility glow
    if (state.invincible) {
      this.bodyMat.emissive.setHex(0x44aaff);
      this.bodyMat.emissiveIntensity = 0.5;
    } else {
      this.bodyMat.emissive.setHex(0x000000);
      this.bodyMat.emissiveIntensity = 0;
    }

    this.group.visible = state.alive;
  }

  update(dt: number): void {
    this.interp.advance(dt);
    const frame = this.interp.get();
    if (!frame) return;

    const { prev, next, t } = frame;

    this.group.position.x = lerp(prev.x, next.x, t);
    this.group.position.z = lerp(prev.z, next.z, t);
    // Y: feet on ground, interpolate jump
    this.group.position.y = lerp(prev.y - 1.75, next.y - 1.75, t);

    this.group.rotation.y = lerpAngle(prev.yaw, next.yaw, t);
    this.head.rotation.x = lerp(prev.pitch, next.pitch, t);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.body.geometry.dispose();
    this.bodyMat.dispose();
    this.head.geometry.dispose();
    this.headMat.dispose();
    this.gun.geometry.dispose();
    (this.gun.material as THREE.Material).dispose();
    (this.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
    (this.nameSprite.material as THREE.Material).dispose();
  }
}
