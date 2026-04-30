/** Cardinal direction bitmask for cell walls */
export const DIR = {
  N: 1,   // -Z
  S: 2,   // +Z
  E: 4,   // +X
  W: 8,   // -X
} as const;

const OPPOSITE: Record<number, number> = {
  [DIR.N]: DIR.S,
  [DIR.S]: DIR.N,
  [DIR.E]: DIR.W,
  [DIR.W]: DIR.E,
};

const DX: Record<number, number> = { [DIR.N]: 0, [DIR.S]: 0, [DIR.E]: 1, [DIR.W]: -1 };
const DZ: Record<number, number> = { [DIR.N]: -1, [DIR.S]: 1, [DIR.E]: 0, [DIR.W]: 0 };

export type RoomType = 'combat' | 'treasure' | 'exit';

export interface DoorPlacement {
  cellRow: number;
  cellCol: number;
  wallDir: number;
  roomType: RoomType;
}

export interface MazeData {
  rows: number;
  cols: number;
  grid: number[][];
  doors: DoorPlacement[];
}

// ─── Maze config constants ───

export interface MazeConfig {
  cellSize: number;
  wallThickness: number;
  baseGridSize: number;
  maxGridSize: number;
  minDeadEnds: number;
  baseDoorCount: number;
  maxDoorCount: number;
  combatChance: number;
}

export const DEFAULT_MAZE_CONFIG: MazeConfig = {
  cellSize: 6,
  wallThickness: 0.5,
  baseGridSize: 8,
  maxGridSize: 14,
  minDeadEnds: 3,
  baseDoorCount: 5,
  maxDoorCount: 8,
  combatChance: 0.765,
};

// ─── Seeded PRNG (mulberry32) ───

export type RNG = () => number;

export function createRNG(seed: number): RNG {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─── Generation ───

/**
 * Generate a maze. If seed is provided, uses deterministic RNG.
 * If seed is undefined, uses Math.random() (backwards-compatible with singleplayer).
 */
export function generateMaze(
  floor: number,
  seed?: number,
  cfg: MazeConfig = DEFAULT_MAZE_CONFIG,
): MazeData {
  const rng: RNG = seed !== undefined ? createRNG(seed + floor * 997) : Math.random;

  const gridSize = Math.min(cfg.baseGridSize + (floor - 1), cfg.maxGridSize);
  const rows = gridSize;
  const cols = gridSize;

  let grid: number[][];
  let deadEnds: Array<{ row: number; col: number }>;

  do {
    grid = Array.from({ length: rows }, () => Array(cols).fill(0) as number[]);
    carve(grid, rows, cols, rng);
    deadEnds = findDeadEnds(grid, rows, cols);
  } while (deadEnds.length < cfg.minDeadEnds);

  const doorCount = Math.min(cfg.baseDoorCount + (floor - 1), cfg.maxDoorCount, deadEnds.length);

  shuffle(deadEnds, rng);
  const chosenEnds = deadEnds.slice(0, doorCount);

  const doors: DoorPlacement[] = chosenEnds.map((de, i) => {
    const wallDir = getClosedWall(grid, de.row, de.col, rows, cols);
    let roomType: RoomType;
    if (i === 0) {
      roomType = 'exit';
    } else {
      roomType = rng() < cfg.combatChance ? 'combat' : 'treasure';
    }
    return { cellRow: de.row, cellCol: de.col, wallDir, roomType };
  });

  shuffle(doors, rng);

  return { rows, cols, grid, doors };
}

function carve(grid: number[][], rows: number, cols: number, rng: RNG): void {
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false) as boolean[]);
  const stack: Array<{ r: number; c: number }> = [];

  const startR = Math.floor(rng() * rows);
  const startC = Math.floor(rng() * cols);
  visited[startR][startC] = true;
  stack.push({ r: startR, c: startC });

  while (stack.length > 0) {
    const curr = stack[stack.length - 1]!;
    const neighbors = getUnvisitedNeighbors(curr.r, curr.c, rows, cols, visited);

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const { r: nr, c: nc, dir } = neighbors[Math.floor(rng() * neighbors.length)]!;
    grid[curr.r][curr.c] |= dir;
    grid[nr][nc] |= OPPOSITE[dir]!;
    visited[nr][nc] = true;
    stack.push({ r: nr, c: nc });
  }
}

function getUnvisitedNeighbors(
  r: number, c: number, rows: number, cols: number, visited: boolean[][],
): Array<{ r: number; c: number; dir: number }> {
  const result: Array<{ r: number; c: number; dir: number }> = [];
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    const nr = r + DZ[dir]!;
    const nc = c + DX[dir]!;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc]) {
      result.push({ r: nr, c: nc, dir });
    }
  }
  return result;
}

export function findCorridorCells(
  grid: number[][], rows: number, cols: number,
): Array<{ row: number; col: number }> {
  const result: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue;
      const openCount = bitCount(grid[r][c]!);
      if (openCount >= 2) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}

function findDeadEnds(grid: number[][], rows: number, cols: number): Array<{ row: number; col: number }> {
  const result: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const openCount = bitCount(grid[r][c]!);
      if (openCount === 1) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}

function getClosedWall(grid: number[][], r: number, c: number, rows: number, cols: number): number {
  const open = grid[r][c]!;
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    if (open & dir) continue;
    const nr = r + DZ[dir]!;
    const nc = c + DX[dir]!;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      return dir;
    }
  }
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    if (!(open & dir)) return dir;
  }
  return DIR.N;
}

function bitCount(n: number): number {
  let count = 0;
  let v = n;
  while (v) { count += v & 1; v >>= 1; }
  return count;
}

function shuffle<T>(arr: T[], rng: RNG): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/** Convert cell (row, col) to world position (center of cell) */
export function cellToWorld(
  row: number, col: number, mazeRows: number, mazeCols: number,
  cellSize: number = DEFAULT_MAZE_CONFIG.cellSize,
): { x: number; z: number } {
  const totalW = mazeCols * cellSize;
  const totalD = mazeRows * cellSize;
  return {
    x: -totalW / 2 + col * cellSize + cellSize / 2,
    z: -totalD / 2 + row * cellSize + cellSize / 2,
  };
}

/** Get door world position (on the wall of the cell) */
export function doorWorldPosition(
  door: DoorPlacement, mazeRows: number, mazeCols: number,
  cellSize: number = DEFAULT_MAZE_CONFIG.cellSize,
): { x: number; z: number } {
  const center = cellToWorld(door.cellRow, door.cellCol, mazeRows, mazeCols, cellSize);
  const half = cellSize / 2;
  switch (door.wallDir) {
    case DIR.N: return { x: center.x, z: center.z - half };
    case DIR.S: return { x: center.x, z: center.z + half };
    case DIR.E: return { x: center.x + half, z: center.z };
    case DIR.W: return { x: center.x - half, z: center.z };
    default: return center;
  }
}
