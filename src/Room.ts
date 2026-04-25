import * as THREE from 'three';
import { CONFIG } from './config';
import { Enemy, type EnemyType } from './Enemy';
import { Chest } from './Chest';
import type { Player } from './Player';
import type { RoomType } from './Maze';

export interface RoomUpdateResult {
  /** A ranged enemy shot the player this frame */
  shot: boolean;
  /** Damage amount from ranged shot */
  shotDamage: number;
  /** A rusher contacted the player this frame */
  contactHit: boolean;
  /** Damage amount from contact */
  contactDamage: number;
  /** All enemies cleared */
  cleared: boolean;
}

/**
 * Room — a sealed 12×12m room the player is teleported into.
 * Three variants: combat (enemies + cover), treasure (chest), exit (green portal).
 */
export class Room {
  readonly group = new THREE.Group();
  readonly type: RoomType;
  readonly walls: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];

  enemies: Enemy[] = [];
  chest: Chest | null = null;
  private exitPortal: THREE.Mesh | null = null;
  private exitGlowMat: THREE.MeshStandardMaterial | null = null;
  private cleared = false;

  // Return door
  private returnDoorMesh: THREE.Mesh;
  private returnDoorMat: THREE.MeshStandardMaterial;
  private returnDoorUnlocked = false;
  readonly returnDoorX = 0;
  readonly returnDoorZ: number;

  constructor(type: RoomType, private readonly scene: THREE.Scene, floor: number) {
    this.type = type;
    const s = CONFIG.room.size;
    const half = s / 2;
    const wh = CONFIG.room.wallHeight;
    const wt = 0.5;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(s, s);
    const floorMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.floor,
      roughness: 0.6,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.group.add(floorMesh);

    // Ceiling
    const ceilMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshStandardMaterial({ color: CONFIG.colors.ceiling, roughness: 0.5 }),
    );
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.y = wh;
    this.group.add(ceilMesh);

    // Four walls
    this.addRoomWall(-half, 0, -half - wt / 2, s, wh, wt);  // North
    this.addRoomWall(-half, 0, half - wt / 2, s, wh, wt);    // South
    this.addRoomWall(-half - wt / 2, 0, -half, wt, wh, s);   // West
    this.addRoomWall(half - wt / 2, 0, -half, wt, wh, s);    // East

    // Lighting
    this.group.add(new THREE.AmbientLight(0xffffff, 2.0));
    const pointLight = new THREE.PointLight(0xffffff, 3.0, s * 2, 1.0);
    pointLight.position.set(0, wh - 0.5, 0);
    this.group.add(pointLight);

    // Return door (south wall center)
    this.returnDoorZ = half - wt / 2;
    this.returnDoorMat = new THREE.MeshStandardMaterial({
      color: CONFIG.door.frameColor,
      emissive: 0x000000,
      roughness: 0.3,
      metalness: 0.1,
    });
    const doorGeo = new THREE.BoxGeometry(CONFIG.door.width, CONFIG.door.height, 0.15);
    this.returnDoorMesh = new THREE.Mesh(doorGeo, this.returnDoorMat);
    this.returnDoorMesh.position.set(0, CONFIG.door.height / 2, this.returnDoorZ);
    this.group.add(this.returnDoorMesh);
    const doorWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(doorGeo),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    doorWire.position.copy(this.returnDoorMesh.position);
    this.group.add(doorWire);

    // Type-specific content
    if (type === 'combat') {
      this.setupCombat(scene, floor);
      // Door locked until cleared
      this.returnDoorUnlocked = false;
    } else if (type === 'treasure') {
      this.setupTreasure(scene);
      this.returnDoorUnlocked = true;
      this.cleared = true;
    } else {
      // exit
      this.setupExit();
      this.returnDoorUnlocked = false; // no return from exit
      this.cleared = true;
    }

    // Offset room far away from maze (y=0, but x/z at 500 to avoid overlap)
    this.group.position.set(500, 0, 500);
    scene.add(this.group);
  }

  private addRoomWall(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.wall,
      roughness: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const edges = new THREE.EdgesGeometry(geo);
    const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x222222 }));
    wire.position.copy(mesh.position);
    this.group.add(wire);

    // Store AABB in room-local coords (room group is at 500,0,500)
    this.walls.push({
      minX: x + 500,
      maxX: x + w + 500,
      minZ: z + 500,
      maxZ: z + d + 500,
    });
  }

  private setupCombat(scene: THREE.Scene, floor: number): void {
    const half = CONFIG.room.size / 2;

    // Cover walls
    const coverCount = CONFIG.room.coverCount.min +
      Math.floor(Math.random() * (CONFIG.room.coverCount.max - CONFIG.room.coverCount.min + 1));
    const coverPositions = [
      { x: -half / 2, z: 0 },
      { x: half / 2, z: 0 },
    ];
    for (let i = 0; i < coverCount; i++) {
      const cp = coverPositions[i]!;
      this.addRoomWall(
        cp.x - 0.3 + 500, 0, cp.z - 1.5 + 500,
        0.6, CONFIG.room.coverHeight, 3,
      );
    }

    // Spawn enemies
    const tier = floor <= 2 ? 'tier1' : floor <= 4 ? 'tier2' : 'tier3';
    const countCfg = CONFIG.room.enemyCount[tier];
    const enemyCount = countCfg.min + Math.floor(Math.random() * (countCfg.max - countCfg.min + 1));

    const maxTanks = floor < CONFIG.room.tankUnlockFloor ? 0 :
      tier === 'tier2' ? CONFIG.room.maxTanksTier2 : CONFIG.room.maxTanksTier3;

    let tankCount = 0;
    const spawnPositions = [
      new THREE.Vector3(500 - 3, 0, 500 - 3),
      new THREE.Vector3(500 + 3, 0, 500 - 3),
      new THREE.Vector3(500 - 3, 0, 500 + 2),
      new THREE.Vector3(500 + 3, 0, 500 + 2),
      new THREE.Vector3(500, 0, 500 - 4),
    ];

    for (let i = 0; i < enemyCount; i++) {
      let type: EnemyType;
      if (maxTanks > 0 && tankCount < maxTanks && Math.random() < 0.3) {
        type = 'tank';
        tankCount++;
      } else if (Math.random() < 0.4) {
        type = 'rusher';
      } else {
        type = 'standard';
      }
      const sp = spawnPositions[i % spawnPositions.length]!;
      const jitter = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0,
        (Math.random() - 0.5) * 2,
      );
      this.enemies.push(new Enemy(sp.clone().add(jitter), scene, type, floor));
    }
  }

  private setupTreasure(scene: THREE.Scene): void {
    this.chest = new Chest(500, 500, scene);
  }

  private setupExit(): void {
    // Green glowing portal
    this.exitGlowMat = new THREE.MeshStandardMaterial({
      color: CONFIG.door.exitGlowColor,
      emissive: CONFIG.door.exitGlowColor,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.8,
    });
    const portalGeo = new THREE.BoxGeometry(1.4, 3.0, 0.15);
    this.exitPortal = new THREE.Mesh(portalGeo, this.exitGlowMat);
    this.exitPortal.position.set(0, 1.5, -CONFIG.room.size / 2 + 0.5);
    this.group.add(this.exitPortal);

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(portalGeo),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    );
    wire.position.copy(this.exitPortal.position);
    this.group.add(wire);
  }

  /** Check if player is near the return door */
  isNearReturnDoor(px: number, pz: number): boolean {
    if (!this.returnDoorUnlocked) return false;
    const dx = px - 500; // return door is at room center x = 500
    const dz = pz - (500 + this.returnDoorZ);
    return Math.sqrt(dx * dx + dz * dz) < CONFIG.door.interactDistance;
  }

  /** Check if player is near exit portal (exit room only) */
  isNearExitPortal(px: number, pz: number): boolean {
    if (this.type !== 'exit' || !this.exitPortal) return false;
    const dx = px - (500 + this.exitPortal.position.x);
    const dz = pz - (500 + this.exitPortal.position.z);
    return Math.sqrt(dx * dx + dz * dz) < CONFIG.door.interactDistance;
  }

  /** Update room state, returns combat results */
  update(dt: number, player: Player): RoomUpdateResult {
    let shot = false;
    let shotDamage = 0;
    let contactHit = false;
    let contactDamage = 0;

    // Update enemies in combat rooms
    let aliveCount = 0;
    for (const e of this.enemies) {
      const result = e.update(dt, player, this);
      if (e.alive) aliveCount++;
      if (result.shot) {
        shot = true;
        shotDamage = e.getDamage();
      }
      if (result.contactHit) {
        contactHit = true;
        contactDamage = e.getDamage();
      }
    }

    // Check if combat cleared — spawn reward chest
    if (this.type === 'combat' && !this.cleared && aliveCount === 0) {
      this.cleared = true;
      this.returnDoorUnlocked = true;
      // Visual: return door turns green
      this.returnDoorMat.emissive.setHex(0x44ff88);
      this.returnDoorMat.emissiveIntensity = 1.0;
      // Spawn reward chest at room center
      this.chest = new Chest(500, 500, this.scene);
    }

    // Update chest
    if (this.chest) {
      this.chest.update(dt);
    }

    // Pulse exit portal
    if (this.exitGlowMat) {
      this.exitGlowMat.emissiveIntensity = 1.5 + Math.sin(performance.now() * 0.003) * 0.5;
    }

    return { shot, shotDamage, contactHit, contactDamage, cleared: this.cleared };
  }

  getAliveEnemyCount(): number {
    return this.enemies.filter((e) => e.alive).length;
  }

  getTotalEnemyCount(): number {
    return this.enemies.length;
  }

  isCleared(): boolean {
    return this.cleared;
  }

  /** Room needs its own collision resolution for enemies */
  resolveCircleVsWalls(x: number, z: number, radius: number): { x: number; z: number } {
    let rx = x, rz = z;
    for (const w of this.walls) {
      const cx = Math.max(w.minX, Math.min(rx, w.maxX));
      const cz = Math.max(w.minZ, Math.min(rz, w.maxZ));
      const dx = rx - cx;
      const dz = rz - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else if (distSq === 0) {
        const edges = [
          { axis: 'x' as const, sign: -1, dist: rx - w.minX },
          { axis: 'x' as const, sign: 1, dist: w.maxX - rx },
          { axis: 'z' as const, sign: -1, dist: rz - w.minZ },
          { axis: 'z' as const, sign: 1, dist: w.maxZ - rz },
        ];
        edges.sort((a, b) => a.dist - b.dist);
        const e = edges[0]!;
        if (e.axis === 'x') rx += e.sign * (e.dist + radius);
        else rz += e.sign * (e.dist + radius);
      }
    }
    return { x: rx, z: rz };
  }

  dispose(scene: THREE.Scene): void {
    for (const e of this.enemies) e.dispose(scene);
    this.enemies = [];
    if (this.chest) this.chest.dispose(scene);
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
