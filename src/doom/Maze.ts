// Re-export from shared for backwards compatibility with existing client imports.
// Singleplayer calls generateMaze(floor) without a seed — uses Math.random().
export {
  DIR,
  generateMaze,
  findCorridorCells,
  cellToWorld,
  doorWorldPosition,
  type RoomType,
  type DoorPlacement,
  type MazeData,
} from './shared/maze';
