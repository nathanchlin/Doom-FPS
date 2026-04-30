import * as THREE from 'three';
import { CONFIG } from './config';
import type { MazeData } from './Maze';
import { DIR, cellToWorld } from './Maze';
import { resolveCircleVsAABBs, hasLineOfSight as sharedLOS } from './shared/collision';
import type { AABB2D } from './shared/collision';
export type { AABB2D };

export interface CollisionProvider {
  resolveCircleVsWalls(x: number, z: number, radius: number): { x: number; z: number };
  /** Check if a straight line from (ax,az) to (bx,bz) is blocked by any wall */
  hasLineOfSight(ax: number, az: number, bx: number, bz: number): boolean;
}

/**
 * Level — builds Three.js geometry from MazeData grid.
 * Renders floor, ceiling, walls with black wireframe outlines.
 * Provides wall collision via AABB list.
 */
export class Level {
  readonly group = new THREE.Group();
  readonly walls: AABB2D[] = [];
  private playerSpawn = new THREE.Vector3(0, CONFIG.player.height, 0);

  constructor(scene: THREE.Scene, mazeData: MazeData) {
    this.buildFromMaze(mazeData);
    this.buildLights(mazeData);
    scene.add(this.group);
  }

  getPlayerSpawn(): THREE.Vector3 {
    return this.playerSpawn.clone();
  }

  private buildFromMaze(maze: MazeData): void {
    const cs = CONFIG.maze.cellSize;
    const wt = CONFIG.maze.wallThickness;
    const wh = CONFIG.world.wallHeight;
    const totalW = maze.cols * cs;
    const totalD = maze.rows * cs;
    const halfW = totalW / 2;
    const halfD = totalD / 2;

    // Build a door lookup: normalize each door to the canonical wall key
    // Level builds: North wall as "N:r:c", West wall as "W:r:c"
    // Door on cell (r,c) facing S → that's the North wall of cell (r+1,c) → "N:{r+1}:c"
    // Door on cell (r,c) facing E → that's the West wall of cell (r,c+1) → "W:r:{c+1}"
    const doorWalls = new Set<string>();
    for (const door of maze.doors) {
      const { cellRow: r, cellCol: c, wallDir } = door;
      if (wallDir === DIR.N) doorWalls.add(`N:${r}:${c}`);
      else if (wallDir === DIR.S) doorWalls.add(`N:${r + 1}:${c}`);
      else if (wallDir === DIR.W) doorWalls.add(`W:${r}:${c}`);
      else if (wallDir === DIR.E) doorWalls.add(`W:${r}:${c + 1}`);
    }

    const doorW = CONFIG.door.width;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(totalW + wt * 2, totalD + wt * 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.floor,
      roughness: 0.6,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Grid lines on floor
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const gridDiv = maze.cols;
    const cellW = totalW / gridDiv;
    for (let i = 0; i <= gridDiv; i++) {
      const z = -halfD + i * cellW;
      const line = new THREE.Mesh(new THREE.PlaneGeometry(totalW, 0.04), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.002, z);
      this.group.add(line);
    }
    for (let i = 0; i <= maze.cols; i++) {
      const x = -halfW + i * cellW;
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.04, totalD), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.002, 0);
      this.group.add(line);
    }

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(totalW + wt * 2, totalD + wt * 2);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.ceiling,
      roughness: 0.5,
      metalness: 0.0,
    });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = wh;
    this.group.add(ceil);

    // Build walls from maze grid
    // For each cell, check each direction; if wall is NOT carved, add a wall segment
    // If a door is on that wall, split into two pieces with a gap
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        const open = maze.grid[r]![c]!;
        const cx = -halfW + c * cs;
        const cz = -halfD + r * cs;

        // North wall (horizontal, along X axis, at z = cz)
        if (!(open & DIR.N)) {
          if (doorWalls.has(`N:${r}:${c}`)) {
            // Split: two pieces flanking the door opening
            const sideLen = (cs - doorW) / 2;
            if (sideLen > 0.01) {
              this.addWallBox(cx, 0, cz - wt / 2, sideLen, wh, wt);
              this.addWallBox(cx + cs - sideLen, 0, cz - wt / 2, sideLen, wh, wt);
            }
          } else {
            this.addWallBox(cx, 0, cz - wt / 2, cs, wh, wt);
          }
        }
        // West wall (vertical, along Z axis, at x = cx)
        if (!(open & DIR.W)) {
          if (doorWalls.has(`W:${r}:${c}`)) {
            const sideLen = (cs - doorW) / 2;
            if (sideLen > 0.01) {
              this.addWallBox(cx - wt / 2, 0, cz, wt, wh, sideLen);
              this.addWallBox(cx - wt / 2, 0, cz + cs - sideLen, wt, wh, sideLen);
            }
          } else {
            this.addWallBox(cx - wt / 2, 0, cz, wt, wh, cs);
          }
        }
      }
    }

    // Eastern boundary (rightmost column, east walls)
    for (let r = 0; r < maze.rows; r++) {
      const cx = -halfW + maze.cols * cs;
      const cz = -halfD + r * cs;
      this.addWallBox(cx - wt / 2, 0, cz, wt, wh, cs);
    }

    // Southern boundary (bottom row, south walls)
    for (let c = 0; c < maze.cols; c++) {
      const cx = -halfW + c * cs;
      const cz = -halfD + maze.rows * cs;
      this.addWallBox(cx, 0, cz - wt / 2, cs, wh, wt);
    }

    // Player spawn: center of cell (0,0) — top-left of maze
    const spawn = cellToWorld(0, 0, maze.rows, maze.cols);
    this.playerSpawn.set(spawn.x, CONFIG.player.height, spawn.z);
  }

  private addWallBox(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.wall,
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
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    const wireframe = new THREE.LineSegments(edges, edgeMat);
    wireframe.position.copy(mesh.position);
    this.group.add(wireframe);

    this.walls.push({
      minX: x, maxX: x + w,
      minZ: z, maxZ: z + d,
    });
  }

  private buildLights(maze: MazeData): void {
    const cs = CONFIG.maze.cellSize;
    const totalW = maze.cols * cs;
    const totalD = maze.rows * cs;

    // Ambient
    this.group.add(new THREE.AmbientLight(0xffffff, 2.0));

    // Hemisphere
    this.group.add(new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 1.2));

    // Directional sun
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(totalW / 4, 25, totalD / 4);
    sun.castShadow = true;
    const halfExtent = Math.max(totalW, totalD) / 2;
    sun.shadow.camera.left = -halfExtent;
    sun.shadow.camera.right = halfExtent;
    sun.shadow.camera.top = halfExtent;
    sun.shadow.camera.bottom = -halfExtent;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.mapSize.set(1024, 1024);
    this.group.add(sun);
    this.group.add(sun.target);

    // Point lights distributed through the maze
    const spacing = 3; // every 3 cells
    for (let r = 0; r < maze.rows; r += spacing) {
      for (let c = 0; c < maze.cols; c += spacing) {
        const pos = cellToWorld(r, c, maze.rows, maze.cols);
        const p = new THREE.PointLight(0xffffff, 2.0, cs * spacing * 1.5, 1.0);
        p.position.set(pos.x, CONFIG.world.wallHeight - 0.5, pos.z);
        this.group.add(p);
      }
    }
  }

  resolveCircleVsWalls(x: number, z: number, radius: number): { x: number; z: number } {
    return resolveCircleVsAABBs(x, z, radius, this.walls);
  }

  /** Ray-vs-AABB line-of-sight check in XZ plane */
  hasLineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    return sharedLOS(ax, az, bx, bz, this.walls);
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
