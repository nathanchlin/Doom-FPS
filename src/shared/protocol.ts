// ─── Common types ───

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Team = 'red' | 'blue';

export interface TeamScores {
  red: number;
  blue: number;
}

export interface MatchConfig {
  killTarget: number;
  timeLimit: number;   // seconds
  respawnDelay: number; // seconds
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  killTarget: 20,
  timeLimit: 600,
  respawnDelay: 3,
};

// ─── Snapshot sub-types ───

export interface PlayerState {
  id: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
  hp: number;
  ammo: number;
  alive: boolean;
  kills: number;
  deaths: number;
  name: string;
  invincible: boolean;
  team: Team;
  isBot: boolean;
}

export interface EnemyState {
  id: number;
  x: number;
  z: number;
  hp: number;
  state: 'idle' | 'chase' | 'attack' | 'dead';
  yaw: number;
  targetPlayerId: number;
}

export interface PickupState {
  id: number;
  x: number;
  z: number;
  kind: 'health' | 'ammo';
  active: boolean;
}

// ─── Client → Server messages ───

export interface JoinMessage {
  type: 'join';
  name: string;
}

export interface InputMessage {
  type: 'input';
  seq: number;
  keys: number;        // bitmask: W=1 A=2 S=4 D=8 SPACE=16 SHIFT=32
  yaw: number;
  pitch: number;
  fire: boolean;
  interact: boolean;
}

export interface ReadyMessage {
  type: 'ready';
}

export interface GameSettingsMessage {
  type: 'game_settings';
  killTarget: number;
  timeLimit: number;
}

export interface StartGameMessage {
  type: 'start_game';
}

export type ClientMessage =
  | JoinMessage
  | InputMessage
  | ReadyMessage
  | GameSettingsMessage
  | StartGameMessage;

// ─── Key bitmask constants ───

export const KEY = {
  W: 1,
  A: 2,
  S: 4,
  D: 8,
  SPACE: 16,
  SHIFT: 32,
} as const;

// ─── Server → Client messages ───

export interface WelcomeMessage {
  type: 'welcome';
  playerId: number;
  config: MatchConfig;
}

export interface LobbyStateMessage {
  type: 'lobby_state';
  players: Array<{ id: number; name: string; ready: boolean; isHost: boolean; team: Team; isBot: boolean }>;
  settings: { killTarget: number; timeLimit: number };
}

export interface GameStartMessage {
  type: 'game_start';
  mazeSeed: number;
  floor: number;
  enemySpawns: Array<{ id: number; x: number; z: number; enemyType: string }>;
  pickups: PickupState[];
}

export interface SnapshotMessage {
  type: 'snapshot';
  tick: number;
  timeRemaining: number;
  lastInputSeq: number;
  players: PlayerState[];
  enemies: EnemyState[];
  pickups: PickupState[];
  teamScores: TeamScores;
}

export interface HitMessage {
  type: 'hit';
  attackerId: number;
  targetId: number;
  targetType: 'player' | 'enemy';
  damage: number;
  killed: boolean;
}

export interface KillMessage {
  type: 'kill';
  killerId: number;
  killerName: string;
  victimId: number;
  victimName: string;
  weapon: string;
}

export interface RespawnMessage {
  type: 'respawn';
  playerId: number;
  x: number;
  z: number;
}

export interface PlayerJoinedMessage {
  type: 'player_joined';
  id: number;
  name: string;
}

export interface PlayerLeftMessage {
  type: 'player_left';
  id: number;
  name: string;
}

export interface PickupTakenMessage {
  type: 'pickup_taken';
  pickupId: number;
  playerId: number;
}

export interface PickupSpawnedMessage {
  type: 'pickup_spawned';
  pickupId: number;
  x: number;
  z: number;
  kind: 'health' | 'ammo';
}

export interface GameOverMessage {
  type: 'game_over';
  reason: 'kill_target' | 'time_up';
  winnerId: number;
  winnerName: string;
  winnerTeam: Team | null;
  teamScores: TeamScores;
  scoreboard: Array<{ id: number; name: string; kills: number; deaths: number }>;
  duration: number;
}

export interface TeamsShuffledMessage {
  type: 'teams_shuffled';
  players: Array<{ id: number; team: Team }>;
}

export type ServerMessage =
  | WelcomeMessage
  | LobbyStateMessage
  | GameStartMessage
  | SnapshotMessage
  | HitMessage
  | KillMessage
  | RespawnMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PickupTakenMessage
  | PickupSpawnedMessage
  | GameOverMessage
  | TeamsShuffledMessage;
