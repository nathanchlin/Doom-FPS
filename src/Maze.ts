import { CONFIG } from './config';

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
  wallDir: number;       // which wall the door is on (DIR.N/S/E/W)
  roomType: RoomType;
}

export interface MazeData {
  rows: number;
  cols: number;
  /** grid[row][col] = bitmask of OPEN walls (carved passages). If bit DIR.N is set, north wall is open. */
  grid: number[][];
  doors: DoorPlacement[];
}

/**
 * Generate a maze using recursive backtracker (depth-first with random neighbor).
 * Returns cell grid + door placements with assigned room types.
 */
export function generateMaze(floor: number): MazeData {
  const gridSize = Math.min(
    CONFIG.maze.baseGridSize + (floor - 1),
    CONFIG.maze.maxGridSize,
  );
  const rows = gridSize;
  const cols = gridSize;

  let grid: number[][];
  let deadEnds: Array<{ row: number; col: number }>;

  // Generate until we have enough dead ends
  do {
    grid = Array.from({ length: rows }, () => Array(cols).fill(0) as number[]);
    carve(grid, rows, cols);
    deadEnds = findDeadEnds(grid, rows, cols);
  } while (deadEnds.length < CONFIG.maze.minDeadEnds);

  // Determine door count for this floor
  const doorCount = Math.min(
    CONFIG.door.baseDoorCount + (floor - 1),
    CONFIG.door.maxDoorCount,
    deadEnds.length,
  );

  // Shuffle dead ends and pick doorCount
  shuffle(deadEnds);
  const chosenEnds = deadEnds.slice(0, doorCount);

  // Assign room types: first one is exit, rest are combat/treasure
  const doors: DoorPlacement[] = chosenEnds.map((de, i) => {
    const wallDir = getClosedWall(grid, de.row, de.col, rows, cols);
    let roomType: RoomType;
    if (i === 0) {
      roomType = 'exit';
    } else {
      roomType = Math.random() < CONFIG.door.combatChance ? 'combat' : 'treasure';
    }
    return {
      cellRow: de.row,
      cellCol: de.col,
      wallDir,
      roomType,
    };
  });

  // Shuffle doors so exit isn't always first in spatial order
  shuffle(doors);

  return { rows, cols, grid, doors };
}

/** Recursive backtracker maze carving */
function carve(grid: number[][], rows: number, cols: number): void {
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false) as boolean[]);
  const stack: Array<{ r: number; c: number }> = [];

  // Start from random cell
  const startR = Math.floor(Math.random() * rows);
  const startC = Math.floor(Math.random() * cols);
  visited[startR][startC] = true;
  stack.push({ r: startR, c: startC });

  while (stack.length > 0) {
    const curr = stack[stack.length - 1]!;
    const neighbors = getUnvisitedNeighbors(curr.r, curr.c, rows, cols, visited);

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const { r: nr, c: nc, dir } = neighbors[Math.floor(Math.random() * neighbors.length)]!;
    // Carve wall between current and neighbor
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

function findDeadEnds(grid: number[][], rows: number, cols: number): Array<{ row: number; col: number }> {
  const result: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Dead end = exactly 1 open passage
      const openCount = bitCount(grid[r][c]!);
      if (openCount === 1) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}

/** Get the wall direction that is still closed (for door placement) in a dead-end cell.
 *  A dead end has 3 closed walls. Pick one that faces inside the grid (not an edge). */
function getClosedWall(grid: number[][], r: number, c: number, rows: number, cols: number): number {
  const open = grid[r][c]!;
  // Prefer walls that don't face the edge of the maze
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    if (open & dir) continue; // this wall is open (passage)
    const nr = r + DZ[dir]!;
    const nc = c + DX[dir]!;
    // Must face inside grid
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
      return dir;
    }
  }
  // Fallback: any closed wall (edge wall)
  for (const dir of [DIR.N, DIR.S, DIR.E, DIR.W]) {
    if (!(open & dir)) return dir;
  }
  return DIR.N; // shouldn't reach here
}

function bitCount(n: number): number {
  let count = 0;
  let v = n;
  while (v) { count += v & 1; v >>= 1; }
  return count;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/** Convert cell (row, col) to world position (center of cell) */
export function cellToWorld(row: number, col: number, mazeRows: number, mazeCols: number): { x: number; z: number } {
  const cs = CONFIG.maze.cellSize;
  const totalW = mazeCols * cs;
  const totalD = mazeRows * cs;
  return {
    x: -totalW / 2 + col * cs + cs / 2,
    z: -totalD / 2 + row * cs + cs / 2,
  };
}

/** Get door world position (on the wall of the cell) */
export function doorWorldPosition(door: DoorPlacement, mazeRows: number, mazeCols: number): { x: number; z: number } {
  const center = cellToWorld(door.cellRow, door.cellCol, mazeRows, mazeCols);
  const cs = CONFIG.maze.cellSize;
  const half = cs / 2;
  switch (door.wallDir) {
    case DIR.N: return { x: center.x, z: center.z - half };
    case DIR.S: return { x: center.x, z: center.z + half };
    case DIR.E: return { x: center.x + half, z: center.z };
    case DIR.W: return { x: center.x - half, z: center.z };
    default: return center;
  }
}
