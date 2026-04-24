import * as THREE from 'three';
import { CONFIG } from './config';

/**
 * Axis-aligned bounding box in XZ plane (Y ignored for wall collisions).
 * Used for cheap player/enemy vs wall collision.
 */
export interface AABB2D {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

/**
 * Level — procedurally builds a Doom-ish arena with corridors, rooms and
 * tinted colored lights. Produces a list of axis-aligned wall boxes that the
 * player/enemy can test against for collision.
 */
export class Level {
  readonly group = new THREE.Group();
  readonly walls: AABB2D[] = [];
  readonly spawnPoints: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene) {
    this.buildFloor();
    this.buildCeiling();
    this.buildOuterWalls();
    this.buildInnerStructures();
    this.buildLights();
    this.buildDecorations();
    scene.add(this.group);
  }

  private buildFloor(): void {
    const size = CONFIG.world.size;
    const gridDiv = 30; // number of grid cells per side
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.floor,
      roughness: 0.6,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Black grid lines on white floor
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const cellSize = size / gridDiv;
    const lineWidth = 0.04;
    // Horizontal lines (along X)
    for (let i = 0; i <= gridDiv; i++) {
      const z = -size / 2 + i * cellSize;
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(size, lineWidth),
        lineMat,
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.002, z);
      this.group.add(line);
    }
    // Vertical lines (along Z)
    for (let i = 0; i <= gridDiv; i++) {
      const x = -size / 2 + i * cellSize;
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(lineWidth, size),
        lineMat,
      );
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.002, 0);
      this.group.add(line);
    }
  }

  private buildCeiling(): void {
    const size = CONFIG.world.size;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.ceiling,
      roughness: 0.5,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = CONFIG.world.wallHeight;
    this.group.add(mesh);
  }

  private buildOuterWalls(): void {
    const s = CONFIG.world.size / 2;
    const h = CONFIG.world.wallHeight;
    const t = 0.5; // thickness

    // Four outer walls as thin boxes
    this.addWallBox(-s - t / 2, 0, -s, s, h, t, CONFIG.colors.wall);   // north
    this.addWallBox(-s - t / 2, 0, s, s, h, t, CONFIG.colors.wall);    // south
    this.addWallBox(-s - t / 2, 0, -s, t, h, s * 2, CONFIG.colors.wall); // west (oops width order)
    this.addWallBox(s - t / 2, 0, -s, t, h, s * 2, CONFIG.colors.wall);  // east
  }

  private buildInnerStructures(): void {
    // A few pillars and low walls to make it feel like a level instead of a box.
    const color = CONFIG.colors.wallAccent;
    const h = CONFIG.world.wallHeight;

    // Four corner pillars (2x2x h)
    for (const [x, z] of [[-18, -18], [18, -18], [-18, 18], [18, 18]] as const) {
      this.addWallBox(x - 1, 0, z - 1, 2, h, 2, color, 0.4);
    }

    // Two inner walls forming a partial corridor
    this.addWallBox(-4, 0, -10, 8, h * 0.75, 0.6, color);
    this.addWallBox(-4, 0, 10 - 0.6, 8, h * 0.75, 0.6, color);

    // A chest-high barrier
    this.addWallBox(-15, 0, -2, 0.6, 1.5, 6, color);
    this.addWallBox(14.4, 0, -4, 0.6, 1.5, 8, color);

    // Spawn points scattered around edges
    this.spawnPoints.push(
      new THREE.Vector3(-22, 0, -22),
      new THREE.Vector3(22, 0, -22),
      new THREE.Vector3(-22, 0, 22),
      new THREE.Vector3(22, 0, 22),
      new THREE.Vector3(0, 0, -22),
      new THREE.Vector3(0, 0, 22),
    );
  }

  /**
   * Add a single box-shaped wall segment at (x, y, z) sized (w, h, d).
   * Registers its XZ footprint in `this.walls`.
   */
  private addWallBox(
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    color: number,
    _emissiveStrength = 0,
  ): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Black wireframe outline
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.position.copy(mesh.position);
    this.group.add(wireframe);

    this.walls.push({
      minX: x, maxX: x + w,
      minZ: z, maxZ: z + d,
    });
  }

  private buildLights(): void {
    // Strong ambient — bright, clean scene
    this.group.add(new THREE.AmbientLight(0xffffff, 2.5));

    // Hemisphere for uniform fill
    this.group.add(new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 1.5));

    // Top-down directional "sunlight" — main fill
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(10, 25, 10);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.mapSize.set(1024, 1024);
    this.group.add(sun);
    this.group.add(sun.target);

    // Second directional from opposite side for fill
    const fill = new THREE.DirectionalLight(0xffffff, 1.0);
    fill.position.set(-10, 20, -10);
    this.group.add(fill);

    // Soft point lights at corners for even coverage
    const cornerIntensity = 3.0;
    const cornerDist = 60;
    for (const [x, z] of [[-22, -22], [22, -22], [-22, 22], [22, 22]] as const) {
      const p = new THREE.PointLight(0xffffff, cornerIntensity, cornerDist, 1.0);
      p.position.set(x, 4.0, z);
      this.group.add(p);
    }
  }

  private buildDecorations(): void {
    // Tall accent pillars with black outline
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      roughness: 0.4,
      metalness: 0.0,
    });
    for (const x of [-20, 20]) {
      const tubeGeo = new THREE.BoxGeometry(0.3, CONFIG.world.wallHeight * 0.7, 0.3);
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.position.set(x, CONFIG.world.wallHeight / 2, 0);
      tube.castShadow = true;
      this.group.add(tube);
      // Outline
      const edges = new THREE.EdgesGeometry(tubeGeo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      wireframe.position.copy(tube.position);
      this.group.add(wireframe);
    }

    // Center ring on the floor
    const ringGeo = new THREE.RingGeometry(1.8, 2.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x333333,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.group.add(ring);
  }

  /**
   * Check if a point (in XZ) penetrates any wall, returning the resolved
   * position (nudged out along the shortest axis). Radius is the circle
   * radius around the point to keep clear of walls.
   */
  resolveCircleVsWalls(x: number, z: number, radius: number): { x: number; z: number } {
    let rx = x, rz = z;
    for (const w of this.walls) {
      // closest point on box to the circle center
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
        // inside the box — push toward nearest edge
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
}
