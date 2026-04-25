import type { WebSocket } from 'ws';
import {
  DEFAULT_MATCH_CONFIG,
  type MatchConfig,
  type ClientMessage,
  type ServerMessage,
  type PlayerState,
  type EnemyState,
  type PickupState,
  type GameStartMessage,
  type SnapshotMessage,
  type HitMessage,
  type KillMessage,
  type RespawnMessage,
  type PlayerLeftMessage,
  type PickupTakenMessage,
  type PickupSpawnedMessage,
  type GameOverMessage,
} from '../shared/protocol';
import {
  generateMaze,
  findCorridorCells,
  cellToWorld,
  createRNG,
  DIR,
  type RNG,
  type MazeData,
} from '../shared/maze';
import type { AABB2D } from '../shared/collision';
import { Lobby, type LobbyPlayer } from './Lobby';
import { ServerPlayer, MAX_HP, MAX_AMMO } from './ServerPlayer';
import { ServerEnemy, type EnemyType } from './ServerEnemy';
import { WeaponCooldown, processShot } from './ServerWeapon';
import {
  createPickups,
  updatePickups,
  tryClaimPickup,
  HEALTH_AMOUNT,
  AMMO_AMOUNT,
  type ServerPickup,
} from './Pickup';

// ─── Constants ───

const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;
const TICK_DT = 1 / TICK_RATE; // 0.05s

const CELL_SIZE = 6;
const WALL_THICKNESS = 0.5;

const GAME_OVER_DELAY = 5000; // 5s before returning to lobby

type GameState = 'lobby' | 'playing' | 'result';

export class GameServer {
  private state: GameState = 'lobby';
  private lobby = new Lobby();

  // WebSocket tracking
  private wsToId = new Map<WebSocket, number>();

  // Game state (populated on startGame)
  private players = new Map<number, ServerPlayer>();
  private enemies: ServerEnemy[] = [];
  private pickups: ServerPickup[] = [];
  private walls: AABB2D[] = [];
  private weaponCooldowns = new WeaponCooldown();
  private rng: RNG = Math.random;
  private maze: MazeData | null = null;
  private corridorCells: Array<{ row: number; col: number }> = [];
  private corridorWorldPos: Array<{ x: number; z: number }> = [];
  private config: MatchConfig = { ...DEFAULT_MATCH_CONFIG };

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private timeRemaining = 0;
  private mazeSeed = 0;
  private floor = 1;

  constructor() {
    this.lobby.onStart((lobbyPlayers, settings) => {
      this.startGame(lobbyPlayers, settings);
    });
  }

  onConnection(ws: WebSocket): void {
    ws.on('message', (data: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        return;
      }
      this.handleMessage(ws, msg);
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });
  }

  private handleMessage(ws: WebSocket, msg: ClientMessage): void {
    if (msg.type === 'join') {
      // Add to lobby
      const lobbyPlayer = this.lobby.addPlayer(ws, msg.name);
      this.wsToId.set(ws, lobbyPlayer.id);
      return;
    }

    const playerId = this.wsToId.get(ws);
    if (playerId === undefined) return;

    if (this.state === 'lobby') {
      this.lobby.handleMessage(playerId, msg);
      return;
    }

    if (this.state === 'playing' && msg.type === 'input') {
      const player = this.players.get(playerId);
      if (player) {
        player.inputQueue.push(msg);
      }
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    const playerId = this.wsToId.get(ws);
    if (playerId === undefined) return;
    this.wsToId.delete(ws);

    if (this.state === 'lobby') {
      this.lobby.removePlayer(playerId);
      return;
    }

    // During game or result
    const player = this.players.get(playerId);
    const playerName = player?.name ?? 'Unknown';
    this.players.delete(playerId);
    this.weaponCooldowns.removePlayer(playerId);

    const leftMsg: PlayerLeftMessage = { type: 'player_left', id: playerId, name: playerName };
    this.broadcast(leftMsg);

    // Also remove from lobby so they don't linger
    this.lobby.removePlayer(playerId);

    // If no players left, stop the game
    if (this.players.size === 0 && this.state === 'playing') {
      this.stopGame();
    }
  }

  private startGame(lobbyPlayers: LobbyPlayer[], settings: MatchConfig): void {
    this.state = 'playing';
    this.config = { ...settings };
    this.tick = 0;
    this.timeRemaining = this.config.timeLimit;

    // Generate maze
    this.mazeSeed = Math.floor(Math.random() * 1_000_000);
    this.floor = 1;
    this.rng = createRNG(this.mazeSeed + 777); // separate RNG for game logic
    this.maze = generateMaze(this.floor, this.mazeSeed);

    // Build wall AABBs (no door splits in multiplayer)
    this.walls = this.buildWalls(this.maze);

    // Find corridors
    this.corridorCells = findCorridorCells(this.maze.grid, this.maze.rows, this.maze.cols);
    this.corridorWorldPos = this.corridorCells.map(c =>
      cellToWorld(c.row, c.col, this.maze!.rows, this.maze!.cols, CELL_SIZE),
    );

    // Spawn players
    this.players.clear();
    for (let i = 0; i < lobbyPlayers.length; i++) {
      const lp = lobbyPlayers[i]!;
      const sp = new ServerPlayer(lp.id, lp.name);

      // Spawn at spaced corridor positions
      if (this.corridorWorldPos.length > 0) {
        const idx = Math.floor((i / lobbyPlayers.length) * this.corridorWorldPos.length);
        const pos = this.corridorWorldPos[Math.min(idx, this.corridorWorldPos.length - 1)]!;
        sp.teleportTo(pos.x, pos.z);
      }

      this.players.set(lp.id, sp);
    }

    // Spawn enemies (4 + playerCount)
    const enemyCount = 4 + lobbyPlayers.length;
    this.enemies = [];
    const enemyTypes: EnemyType[] = ['standard', 'rusher', 'tank', 'patrol'];
    const enemySpawns: Array<{ id: number; x: number; z: number; enemyType: string }> = [];

    for (let i = 0; i < enemyCount; i++) {
      const corridorIdx = Math.floor(this.rng() * this.corridorWorldPos.length);
      const pos = this.corridorWorldPos[corridorIdx] ?? { x: 0, z: 0 };
      const eType = enemyTypes[i % enemyTypes.length]!;
      const enemy = new ServerEnemy(i, pos.x, pos.z, eType);
      this.enemies.push(enemy);
      enemySpawns.push({ id: i, x: pos.x, z: pos.z, enemyType: eType });
    }

    // Create pickups
    this.pickups = createPickups(this.corridorWorldPos);

    // Reset weapon cooldowns
    this.weaponCooldowns = new WeaponCooldown();

    // Broadcast game_start to all connected players
    const pickupStates: PickupState[] = this.pickups.map(p => ({
      id: p.id, x: p.x, z: p.z, kind: p.kind, active: p.active,
    }));
    const startMsg: GameStartMessage = {
      type: 'game_start',
      mazeSeed: this.mazeSeed,
      floor: this.floor,
      enemySpawns,
      pickups: pickupStates,
    };
    this.broadcast(startMsg);

    // Start tick loop
    this.tickInterval = setInterval(() => this.gameTick(), TICK_INTERVAL);
  }

  private gameTick(): void {
    if (this.state !== 'playing') return;
    this.tick++;
    const dt = TICK_DT;

    // 1. Process all player inputs
    for (const player of this.players.values()) {
      player.processInputs(dt, this.walls);
    }

    // 2. Update timers (invincibility)
    for (const player of this.players.values()) {
      player.updateTimers(dt);
    }

    // 3. Process shots
    const alivePlayers = this.getAlivePlayers();
    for (const player of this.players.values()) {
      if (!player.alive || !player.pendingFire) continue;
      player.pendingFire = false;

      if (!this.weaponCooldowns.canFire(player.id)) continue;
      if (player.ammo <= 0) continue;

      player.ammo--;
      this.weaponCooldowns.fire(player.id);

      const result = processShot(player, alivePlayers, this.enemies);
      if (result && result.hit) {
        if (result.targetType === 'player') {
          const target = this.players.get(result.targetId);
          if (target) {
            const killed = target.takeDamage(result.damage);
            result.killed = killed;

            const hitMsg: HitMessage = {
              type: 'hit',
              attackerId: player.id,
              targetId: target.id,
              targetType: 'player',
              damage: result.damage,
              killed,
            };
            this.broadcast(hitMsg);

            if (killed) {
              player.kills++;
              target.respawnTimer = this.config.respawnDelay;

              const killMsg: KillMessage = {
                type: 'kill',
                killerId: player.id,
                killerName: player.name,
                victimId: target.id,
                victimName: target.name,
                weapon: 'rifle',
              };
              this.broadcast(killMsg);
            }
          }
        } else {
          // Hit enemy
          const enemy = this.enemies.find(e => e.id === result.targetId);
          if (enemy) {
            const killed = enemy.takeDamage(result.damage);
            result.killed = killed;

            const hitMsg: HitMessage = {
              type: 'hit',
              attackerId: player.id,
              targetId: enemy.id,
              targetType: 'enemy',
              damage: result.damage,
              killed,
            };
            this.broadcast(hitMsg);
          }
        }
      }
    }

    // 4. Update weapon cooldowns
    this.weaponCooldowns.update(dt);

    // 5. Update enemy AI
    const playersArr = Array.from(this.players.values());
    for (const enemy of this.enemies) {
      const result = enemy.update(dt, playersArr, this.walls, this.rng);

      // Enemy ranged shot hit a player
      if (result.shotPlayerId >= 0) {
        const target = this.players.get(result.shotPlayerId);
        if (target && target.alive) {
          const killed = target.takeDamage(result.shotDamage);
          const hitMsg: HitMessage = {
            type: 'hit',
            attackerId: -1, // enemy
            targetId: target.id,
            targetType: 'player',
            damage: result.shotDamage,
            killed,
          };
          this.broadcast(hitMsg);

          if (killed) {
            target.respawnTimer = this.config.respawnDelay;
          }
        }
      }

      // Enemy contact damage
      if (result.contactPlayerId >= 0) {
        const target = this.players.get(result.contactPlayerId);
        if (target && target.alive) {
          const killed = target.takeDamage(result.contactDamage);
          const hitMsg: HitMessage = {
            type: 'hit',
            attackerId: -1,
            targetId: target.id,
            targetType: 'player',
            damage: result.contactDamage,
            killed,
          };
          this.broadcast(hitMsg);

          if (killed) {
            target.respawnTimer = this.config.respawnDelay;
          }
        }
      }
    }

    // 6. Process pickup interactions
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      // Auto-claim pickups when walking near them (no interact needed)
      const claimed = tryClaimPickup(this.pickups, player.x, player.z);
      if (claimed) {
        if (claimed.kind === 'health') {
          player.hp = Math.min(MAX_HP, player.hp + HEALTH_AMOUNT);
        } else {
          player.ammo = Math.min(MAX_AMMO, player.ammo + AMMO_AMOUNT);
        }
        const takenMsg: PickupTakenMessage = {
          type: 'pickup_taken',
          pickupId: claimed.id,
          playerId: player.id,
        };
        this.broadcast(takenMsg);
      }
    }

    // 7. Update pickup respawns
    const respawned = updatePickups(this.pickups, dt);
    for (const pickupId of respawned) {
      const p = this.pickups.find(pk => pk.id === pickupId);
      if (p) {
        const spawnMsg: PickupSpawnedMessage = {
          type: 'pickup_spawned',
          pickupId: p.id,
          x: p.x,
          z: p.z,
          kind: p.kind,
        };
        this.broadcast(spawnMsg);
      }
    }

    // 8. Check respawn timers for dead players
    for (const player of this.players.values()) {
      if (player.alive) continue;
      player.respawnTimer -= dt;
      if (player.respawnTimer <= 0) {
        const spawnPos = this.pickRespawnPoint(player.id);
        player.respawnAt(spawnPos.x, spawnPos.z);

        const respawnMsg: RespawnMessage = {
          type: 'respawn',
          playerId: player.id,
          x: spawnPos.x,
          z: spawnPos.z,
        };
        this.broadcast(respawnMsg);
      }
    }

    // 9. Update time and check win condition
    this.timeRemaining -= dt;
    const winner = this.checkWinCondition();
    if (winner) {
      this.endGame(winner.reason, winner.winnerId);
      return;
    }

    // 10. Broadcast per-client snapshot
    this.broadcastSnapshots();
  }

  private checkWinCondition(): { reason: 'kill_target' | 'time_up'; winnerId: number } | null {
    // Check kill target
    for (const player of this.players.values()) {
      if (player.kills >= this.config.killTarget) {
        return { reason: 'kill_target', winnerId: player.id };
      }
    }

    // Check time
    if (this.timeRemaining <= 0) {
      // Winner is the player with most kills
      let bestId = -1;
      let bestKills = -1;
      for (const player of this.players.values()) {
        if (player.kills > bestKills) {
          bestKills = player.kills;
          bestId = player.id;
        }
      }
      return { reason: 'time_up', winnerId: bestId };
    }

    return null;
  }

  private endGame(reason: 'kill_target' | 'time_up', winnerId: number): void {
    this.state = 'result';
    this.stopTickLoop();

    const winner = this.players.get(winnerId);
    const duration = this.config.timeLimit - this.timeRemaining;

    const scoreboard = Array.from(this.players.values())
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map(p => ({
        id: p.id,
        name: p.name,
        kills: p.kills,
        deaths: p.deaths,
      }));

    const gameOver: GameOverMessage = {
      type: 'game_over',
      reason,
      winnerId,
      winnerName: winner?.name ?? 'Unknown',
      scoreboard,
      duration,
    };
    this.broadcast(gameOver);

    // After 5 seconds, reset to lobby
    setTimeout(() => {
      this.resetToLobby();
    }, GAME_OVER_DELAY);
  }

  private resetToLobby(): void {
    this.state = 'lobby';
    this.players.clear();
    this.enemies = [];
    this.pickups = [];
    this.walls = [];
    this.maze = null;
    this.lobby.reset();
  }

  private stopGame(): void {
    this.stopTickLoop();
    this.resetToLobby();
  }

  private stopTickLoop(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private broadcastSnapshots(): void {
    const playerStates = this.buildPlayerStates();
    const enemyStates = this.buildEnemyStates();
    const pickupStates = this.buildPickupStates();

    for (const [ws, id] of this.wsToId) {
      const player = this.players.get(id);
      if (!player) continue;

      const snapshot: SnapshotMessage = {
        type: 'snapshot',
        tick: this.tick,
        timeRemaining: Math.max(0, this.timeRemaining),
        lastInputSeq: player.lastInputSeq,
        players: playerStates,
        enemies: enemyStates,
        pickups: pickupStates,
      };

      this.send(ws, snapshot);
    }
  }

  private buildPlayerStates(): PlayerState[] {
    const states: PlayerState[] = [];
    for (const p of this.players.values()) {
      states.push({
        id: p.id,
        x: p.x,
        z: p.z,
        y: p.y,
        yaw: p.yaw,
        pitch: p.pitch,
        hp: p.hp,
        ammo: p.ammo,
        alive: p.alive,
        kills: p.kills,
        deaths: p.deaths,
        name: p.name,
        invincible: p.invincible,
      });
    }
    return states;
  }

  private buildEnemyStates(): EnemyState[] {
    return this.enemies.map(e => ({
      id: e.id,
      x: e.x,
      z: e.z,
      hp: e.hp,
      state: e.state,
      yaw: e.yaw,
      targetPlayerId: e.targetPlayerId,
    }));
  }

  private buildPickupStates(): PickupState[] {
    return this.pickups.map(p => ({
      id: p.id,
      x: p.x,
      z: p.z,
      kind: p.kind,
      active: p.active,
    }));
  }

  private getAlivePlayers(): ServerPlayer[] {
    const result: ServerPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.alive) result.push(p);
    }
    return result;
  }

  /**
   * Pick a respawn point: sample 5 random corridor cells,
   * pick the one with maximum minimum-distance to all alive players.
   */
  private pickRespawnPoint(excludeId: number): { x: number; z: number } {
    if (this.corridorWorldPos.length === 0) {
      return { x: 0, z: 0 };
    }

    const alivePlayers: ServerPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.alive && p.id !== excludeId) alivePlayers.push(p);
    }

    // If nobody else alive, just pick random
    if (alivePlayers.length === 0) {
      const idx = Math.floor(this.rng() * this.corridorWorldPos.length);
      return this.corridorWorldPos[idx]!;
    }

    let bestPos = this.corridorWorldPos[0]!;
    let bestMinDist = -1;

    const samples = Math.min(5, this.corridorWorldPos.length);
    for (let s = 0; s < samples; s++) {
      const idx = Math.floor(this.rng() * this.corridorWorldPos.length);
      const pos = this.corridorWorldPos[idx]!;

      let minDist = Infinity;
      for (const p of alivePlayers) {
        const dx = p.x - pos.x;
        const dz = p.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist) minDist = dist;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestPos = pos;
      }
    }

    return bestPos;
  }

  /**
   * Build wall AABBs from maze data.
   * Multiplayer: no door splits — all walls are full-length.
   */
  private buildWalls(maze: MazeData): AABB2D[] {
    const cs = CELL_SIZE;
    const wt = WALL_THICKNESS;
    const totalW = maze.cols * cs;
    const totalD = maze.rows * cs;
    const halfW = totalW / 2;
    const halfD = totalD / 2;
    const wallList: AABB2D[] = [];

    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        const open = maze.grid[r]![c]!;
        const cx = -halfW + c * cs;
        const cz = -halfD + r * cs;

        // North wall (horizontal, along X axis, at z = cz)
        if (!(open & DIR.N)) {
          wallList.push({
            minX: cx,
            maxX: cx + cs,
            minZ: cz - wt / 2,
            maxZ: cz + wt / 2,
          });
        }

        // West wall (vertical, along Z axis, at x = cx)
        if (!(open & DIR.W)) {
          wallList.push({
            minX: cx - wt / 2,
            maxX: cx + wt / 2,
            minZ: cz,
            maxZ: cz + cs,
          });
        }
      }
    }

    // Eastern boundary (rightmost column east walls)
    for (let r = 0; r < maze.rows; r++) {
      const cx = -halfW + maze.cols * cs;
      const cz = -halfD + r * cs;
      wallList.push({
        minX: cx - wt / 2,
        maxX: cx + wt / 2,
        minZ: cz,
        maxZ: cz + cs,
      });
    }

    // Southern boundary (bottom row south walls)
    for (let c = 0; c < maze.cols; c++) {
      const cx = -halfW + c * cs;
      const cz = -halfD + maze.rows * cs;
      wallList.push({
        minX: cx,
        maxX: cx + cs,
        minZ: cz - wt / 2,
        maxZ: cz + wt / 2,
      });
    }

    return wallList;
  }

  // ─── Networking helpers ───

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const [ws] of this.wsToId) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
