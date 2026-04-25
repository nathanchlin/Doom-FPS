# LAN Multiplayer Design Spec

## Overview

Add CS 1.5-style LAN multiplayer to the existing Doom FPS. One player hosts a game server on their machine; others join via the host's LAN IP. The game mode is **PvPvE Deathmatch**: players fight each other while AI enemies roam the shared maze.

## Requirements

| Item | Value |
|------|-------|
| Mode | PvPvE Deathmatch |
| Players | 2-8 |
| Network | LAN only, WebSocket over TCP |
| Architecture | Node.js Listen Server (host runs server + plays as client) |
| Map | Shared maze, same as singleplayer, seed-synced |
| Win condition | First to kill target (default 20) or highest kills at time limit |
| Respawn | 3-second delay, random safe spawn, 2-second invincibility |

## Architecture

### Network Topology

```
Host Machine
├── Terminal: pnpm host
│   └── Node.js process
│       ├── HTTP static server (:3000) — serves built client files
│       └── WebSocket game server (:3001) — authoritative game logic
│
└── Browser: http://localhost:3000
    └── Client (identical to other players, connects ws://localhost:3001)

Other Machines (LAN)
└── Browser: http://<host-ip>:3000
    └── Client (connects ws://<host-ip>:3001)
```

The host's browser client has no special privileges. All clients use identical code paths. The server is the single authority for game state.

### Responsibility Split

| Component | Responsibilities |
|-----------|-----------------|
| Server | Maze generation (seeded), enemy AI ticks, collision validation, hitscan damage resolution, scoring, respawn management, 20Hz state broadcast |
| Client | Input capture, local movement prediction, server state interpolation, rendering, sound effects, UI |

## Protocol

### Transport

- WebSocket over TCP (JSON messages)
- Server tick rate: 20Hz (50ms intervals)
- Client input rate: 60Hz (every frame)
- Bandwidth estimate: ~50-80KB/s for 8 players (negligible on LAN)

### Client-to-Server Messages

#### `join`
Sent once on connection.
```typescript
{ type: 'join'; name: string }
```

#### `input`
Sent every frame.
```typescript
{
  type: 'input';
  seq: number;        // Incrementing sequence for prediction reconciliation
  keys: number;       // Bitmask: W=1 A=2 S=4 D=8 SPACE=16 SHIFT=32
  yaw: number;
  pitch: number;
  fire: boolean;
  interact: boolean;
}
```

#### `ready`
Toggle ready state in lobby.
```typescript
{ type: 'ready' }
```

#### `game_settings`
Host-only. Change match settings in lobby.
```typescript
{ type: 'game_settings'; killTarget: number; timeLimit: number }
```

#### `start_game`
Host-only. Start the match.
```typescript
{ type: 'start_game' }
```

### Server-to-Client Messages

#### `welcome`
Sent once on connection.
```typescript
{
  type: 'welcome';
  playerId: number;
  mazeSeed: number;
  floor: number;
  config: MatchConfig;
}
```

#### `lobby_state`
Broadcast whenever lobby state changes.
```typescript
{
  type: 'lobby_state';
  players: Array<{ id: number; name: string; ready: boolean; isHost: boolean }>;
  settings: { killTarget: number; timeLimit: number };
}
```

#### `game_start`
Broadcast to start the match.
```typescript
{
  type: 'game_start';
  mazeSeed: number;
  floor: number;
  enemySpawns: Array<{ id: number; x: number; z: number; enemyType: string }>;
}
```

#### `snapshot`
Broadcast at 20Hz during gameplay.
```typescript
{
  type: 'snapshot';
  tick: number;
  timeRemaining: number;
  lastInputSeq: number;  // Per-client: latest processed input seq
  players: PlayerState[];
  enemies: EnemyState[];
}

interface PlayerState {
  id: number;
  x: number; z: number; y: number;
  yaw: number; pitch: number;
  hp: number; ammo: number;
  alive: boolean;
  kills: number;
  deaths: number;
  name: string;
  invincible: boolean;  // Post-respawn invincibility
}

interface EnemyState {
  id: number;
  x: number; z: number;
  hp: number;
  state: 'idle' | 'chase' | 'attack' | 'dead';
  yaw: number;
  targetPlayerId: number;
}
```

#### `hit`
Event: damage dealt.
```typescript
{
  type: 'hit';
  attackerId: number;   // Player ID
  targetId: number;     // Player or enemy ID
  targetType: 'player' | 'enemy';
  damage: number;
  killed: boolean;
}
```

#### `kill`
Event: player killed another player.
```typescript
{
  type: 'kill';
  killerId: number;
  killerName: string;
  victimId: number;
  victimName: string;
  weapon: string;
}
```

#### `respawn`
Event: player respawns.
```typescript
{
  type: 'respawn';
  playerId: number;
  x: number; z: number;
}
```

#### `player_joined` / `player_left`
```typescript
{ type: 'player_joined'; id: number; name: string }
{ type: 'player_left'; id: number; name: string }
```

#### `door_opened`
Not used in multiplayer deathmatch (doors disabled). Reserved for future room-based modes.

#### `room_cleared`
Not used in multiplayer deathmatch (rooms disabled). Reserved for future room-based modes.

#### `pickup_spawned`
```typescript
{ type: 'pickup_spawned'; pickupId: number; x: number; z: number; kind: 'health' | 'ammo' }
```

#### `pickup_taken`
```typescript
{ type: 'pickup_taken'; pickupId: number; playerId: number }
```

#### `game_over`
```typescript
{
  type: 'game_over';
  reason: 'kill_target' | 'time_up';
  winnerId: number;
  winnerName: string;
  scoreboard: Array<{ id: number; name: string; kills: number; deaths: number }>;
  duration: number;
}
```

## Game Flow

### State Machine

```
Menu → Lobby → Playing → Result → Lobby
               ↑                    │
               └────────────────────┘  (host clicks "play again")
```

### Menu

Existing singleplayer entry preserved. Two new buttons added:

- **Create Room**: Enter nickname → connects to `ws://localhost:3001` (requires `pnpm host` already running in terminal) → first player auto-assigned as host → enters lobby
- **Join Room**: Enter nickname + host IP → connects to `ws://<ip>:3001` → enters lobby

Note: The server is always started via `pnpm host` in the terminal. The browser cannot start the Node.js process. "Create Room" is simply a convenience for the host player that defaults to `localhost`.

### Lobby

- All players can toggle "ready"
- Host-only: "Start Game" button (requires >= 2 players ready)
- Host configurable: kill target (10/20/30), time limit (5/10/15 min)
- Real-time player list sync via `lobby_state` messages

### Deathmatch Rules

- **Scoring**: +1 per player kill. AI kills grant +0 (enemies are environmental hazards).
- **Win**: First to kill target, or highest kills when time expires. Ties share victory.
- **Respawn**: 3-second delay. During death cam, player can rotate camera freely. Respawn at random corridor cell chosen to maximize minimum distance from all living players. 2-second invincibility post-respawn (visual glow indicator).
- **Weapons**: Players start with rifle. No card system in multiplayer — all players use rifle with base stats.
- **Pickups**: Health packs (+25 HP) and ammo packs (+15 ammo) spawn at fixed corridor locations, 3 of each. Respawn 30 seconds after being picked up. Server-authoritative (first `interact` input at pickup location claims it).

### AI Enemies

- Count: `4 + playerCount`, distributed across maze corridors
- Behavior: chase nearest living player regardless of who they are
- Attacks hit any player (no faction system)
- Any player's shots can kill enemies
- Dead enemies respawn after 10 seconds at a random corridor position
- Enemy stats use floor 1 base values (no floor scaling in deathmatch)

### Doors and Rooms

In multiplayer deathmatch, rooms and doors are **disabled**. The maze is open corridors only — no doors, no sealed rooms, no chests. This avoids complex room-teleportation synchronization and keeps gameplay focused on corridor-based PvPvE combat.

AI enemies and players share the full maze corridor space. Health and ammo pickups spawn at fixed corridor locations instead of chests:
- Health pack (+25 HP): 3 spawn points across maze, respawn 30s after pickup
- Ammo pack (+15 ammo): 3 spawn points across maze, respawn 30s after pickup
- Server tracks pickup state and broadcasts `pickup_spawned` / `pickup_taken` events

This is a significant simplification from single-player. Room-based gameplay can be added in a future iteration.

## Server Architecture

### No Three.js Dependency

The server runs in Node.js without WebGL. All Three.js-dependent logic is replaced with pure math equivalents:

| Client (Three.js) | Server (pure math) |
|---|---|
| `THREE.Vector3` | `{ x: number, y: number, z: number }` |
| `THREE.Raycaster` | `rayVsAABB()` slab method |
| `Level.resolveCircleVsWalls()` | `resolveCircleVsAABBs()` pure function |
| `Level.hasLineOfSight()` | `lineSegmentVsAABBs()` pure function |
| `Maze.generateMaze()` | Same algorithm with seeded RNG |
| `Enemy` FSM state transitions | Same logic without mesh/material code |

### Server Main Loop (20Hz)

Each tick:
1. Dequeue and apply all pending inputs per player
2. Simulate player movement with collision
3. Process pending shots (ray-vs-AABB against all player and enemy hitboxes)
4. Update enemy AI (FSM transitions, movement, attack rolls)
5. Check respawn timers
6. Check win condition
7. Broadcast snapshot to all clients

### Server Hitscan Resolution

```
Player fires →
  Server builds ray from player position + yaw/pitch →
  Test ray against all other player hitboxes (AABB3D) →
  Test ray against all enemy hitboxes (AABB3D) →
  Closest hit wins →
  Apply damage, check death, broadcast hit/kill events
```

Hitbox per player: axis-aligned box centered at position, width 0.8m, height 1.75m, depth 0.8m.

### Respawn Point Selection

```
1. Collect all corridor cells from maze
2. Randomly sample 5 candidates
3. For each candidate, compute minimum distance to all living players
4. Select the candidate with the largest minimum distance
5. Teleport player there with full HP and ammo
```

## Client Changes

### New Files

| File | Purpose |
|------|---------|
| `client/NetClient.ts` | WebSocket connection, message serialization, send/receive |
| `client/RemotePlayer.ts` | Third-person player model (body + head + gun + nametag), snapshot interpolation |
| `client/Interpolation.ts` | Generic two-frame lerp buffer for smooth rendering |
| `client/Prediction.ts` | Client-side prediction: apply inputs locally, reconcile with server snapshots using `lastInputSeq` |
| `client/MultiplayerHud.ts` | Kill feed, scoreboard (Tab), respawn countdown, match timer |
| `client/LobbyUI.ts` | Lobby screen (player list, settings, ready/start buttons) |

### Modified Files

| File | Change Scope | Details |
|------|-------------|---------|
| `main.ts` | Medium | Add mode selection UI (singleplayer / create / join) |
| `Game.ts` | Large | Core branching: singleplayer path unchanged, multiplayer path uses NetClient, RemotePlayer, server snapshots |
| `Player.ts` | Medium | Multiplayer mode: send inputs to server, apply local prediction, accept server corrections |
| `Enemy.ts` | Small | Multiplayer mode: disable local AI, accept position/state from snapshots, interpolate |
| `Weapon.ts` | Small | Multiplayer mode: fire sends message to server instead of local raycast |
| `Level.ts` | Small | Extract collision functions to `shared/collision.ts` |
| `Maze.ts` | Small | Extract to `shared/maze.ts`, replace `Math.random()` with seeded RNG |
| `Room.ts` | Not used | Rooms disabled in multiplayer; file untouched |
| `Door.ts` | Not used | Doors disabled in multiplayer; file untouched |
| `Hud.ts` | Small | Add mount point for multiplayer HUD overlay |
| `config.ts` | Small | Move to `shared/config.ts` |

### Unchanged Files

`Engine.ts`, `WeaponModel.ts`, `Input.ts`, `Sfx.ts`, `CardPicker.ts`, `Chest.ts`, `Hazard.ts`

### Client Prediction and Reconciliation

1. Player presses key → input applied locally (instant movement) + sent to server with `seq` number
2. Server processes input → includes `lastInputSeq` in next snapshot
3. Client receives snapshot → compares own position with server's authoritative position
4. If delta < 0.1 units → ignore (prediction was accurate)
5. If delta >= 0.1 units → snap to server position, replay unacknowledged inputs

### Remote Player Interpolation

- Buffer the two most recent snapshots per remote player
- Render at `currentTime - 50ms` (one tick behind)
- Linearly interpolate position and angles between the two buffered snapshots
- Angle interpolation handles -pi/+pi wraparound

### Remote Player Model

Procedural geometry matching the game's style:
- Body: box (0.6 x 1.5 x 0.4), team-neutral color
- Head: box (0.35 x 0.35 x 0.35), follows pitch
- Gun: thin box extending forward from body
- Nametag: CSS2D text above head
- Invincibility glow: emissive pulse during 2s post-respawn

## Shared Code (`src/shared/`)

### `shared/protocol.ts`
All message type definitions and interfaces. Imported by both client and server.

### `shared/config.ts`
Game configuration constants. Moved from `src/config.ts`. Both client and server reference the same values.

### `shared/collision.ts`
Pure math collision functions extracted from `Level.ts`:
- `resolveCircleVsAABBs(x, z, radius, walls)` — circle-vs-AABB push-out
- `lineSegmentVsAABBs(ax, az, bx, bz, walls)` — line-of-sight check
- `rayVsAABB(ray, box, maxDist)` — 3D ray-vs-box intersection (slab method)

### `shared/maze.ts`
Maze generation with seeded PRNG:
- `createRNG(seed)` — mulberry32 deterministic random
- `generateMaze(floor, seed)` — existing algorithm with `Math.random()` replaced by seeded RNG
- `cellToWorld()`, `doorWorldPosition()`, `findCorridorCells()` — coordinate helpers

## Build Configuration

### New Dependencies

```json
{
  "dependencies": {
    "ws": "^8.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "@types/ws": "^8.0.0"
  }
}
```

### New npm Scripts

```json
{
  "host": "tsx src/server/main.ts",
  "build:server": "vite build --config vite.server.config.ts",
  "start": "node dist-server/main.js"
}
```

### Server Vite Config

Separate `vite.server.config.ts` for SSR-style Node.js build:
- Entry: `src/server/main.ts`
- Output: `dist-server/`
- Target: `node`
- Externals: `ws`

### Disconnect Handling

- **Player disconnects during game**: Server broadcasts `player_left`, removes player from simulation. AI enemies that were targeting this player re-target nearest remaining player. Game continues.
- **Host disconnects (server process killed)**: All clients lose WebSocket connection → show "Host disconnected" message → return to main menu. No host migration.
- **Player disconnects in lobby**: Removed from lobby list. If all non-host players leave, host stays in lobby waiting.

## Out of Scope (Not in This Spec)

- Team modes (all FFA for now)
- Chat system
- Server browser / auto-discovery
- Anti-cheat beyond server authority
- Persistent stats / leaderboards
- Card/upgrade system in multiplayer
- Multiple weapon types in multiplayer (rifle only)
- Spectator mode
- Doors and rooms in multiplayer (corridors only for now)
