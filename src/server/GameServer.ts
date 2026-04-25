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
  type Team,
  type TeamScores,
  type TeamsShuffledMessage,
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
  updatePickups,
  tryClaimPickup,
  HEALTH_AMOUNT,
  AMMO_AMOUNT,
  type ServerPickup,
} from './Pickup';
import { TeamManager } from './TeamManager';
import { BotPlayer, getBotName } from './BotPlayer';

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
  private nextPickupId = 0;
  private walls: AABB2D[] = [];
  private weaponCooldowns = new WeaponCooldown();
  private rng: RNG = Math.random;
  private maze: MazeData | null = null;
  private corridorCells: Array<{ row: number; col: number }> = [];
  private corridorWorldPos: Array<{ x: number; z: number }> = [];
  private config: MatchConfig = { ...DEFAULT_MATCH_CONFIG };
  private teamManager = new TeamManager();
  private teamScores: TeamScores = { red: 0, blue: 0 };
  private shuffleTimer = 0;
  private readonly SHUFFLE_INTERVAL = 180; // 3 minutes

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
    this.teamManager.remove(playerId);

    const leftMsg: PlayerLeftMessage = { type: 'player_left', id: playerId, name: playerName };
    this.broadcast(leftMsg);

    // Also remove from lobby so they don't linger
    this.lobby.removePlayer(playerId);

    // If no human players left, stop the game
    const humanPlayers = Array.from(this.players.values()).filter(p => !p.isBot);
    if (humanPlayers.length === 0 && this.state === 'playing') {
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
    this.teamManager.clear();
    this.teamScores = { red: 0, blue: 0 };
    this.shuffleTimer = this.SHUFFLE_INTERVAL;

    // Assign human players to teams
    for (let i = 0; i < lobbyPlayers.length; i++) {
      const lp = lobbyPlayers[i]!;
      const sp = new ServerPlayer(lp.id, lp.name);
      const team = this.teamManager.assign(lp.id);
      sp.team = team;
      this.players.set(lp.id, sp);
    }

    // Create bots to fill to 8 total
    const botsNeeded = Math.max(0, 8 - lobbyPlayers.length);
    for (let i = 0; i < botsNeeded; i++) {
      const botId = 1000 + i;
      const botName = getBotName(i);
      const bot = new BotPlayer(botId, botName);
      const team = this.teamManager.assign(botId);
      bot.team = team;
      this.players.set(botId, bot);
    }

    // Spawn players by team (red in first half, blue in second half)
    const halfIdx = Math.floor(this.corridorWorldPos.length / 2);
    const redSpawns = this.corridorWorldPos.slice(0, halfIdx);
    const blueSpawns = this.corridorWorldPos.slice(halfIdx);

    for (const [, player] of this.players) {
      const spawns = player.team === 'red' ? redSpawns : blueSpawns;
      if (spawns.length > 0) {
        const idx = Math.floor(this.rng() * spawns.length);
        const pos = spawns[idx]!;
        player.teleportTo(pos.x, pos.z);
      }
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

    // Reset pickups (drops spawn on enemy kill, not pre-placed)
    this.pickups = [];
    this.nextPickupId = 0;

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

    // 1. Generate bot inputs
    const allPlayersArr = Array.from(this.players.values());
    for (const player of this.players.values()) {
      if (player instanceof BotPlayer) {
        player.generateInput(dt, allPlayersArr, this.walls, this.teamManager, this.rng, this.enemies);
      }
    }

    // 2. Process all player inputs
    for (const player of this.players.values()) {
      player.processInputs(dt, this.walls);
    }

    // 3. Update timers (invincibility)
    for (const player of this.players.values()) {
      player.updateTimers(dt);
    }

    // 4. Process shots
    const alivePlayers = this.getAlivePlayers();
    for (const player of this.players.values()) {
      if (!player.alive || !player.pendingFire) continue;
      player.pendingFire = false;

      if (!this.weaponCooldowns.canFire(player.id)) continue;
      if (player.ammo <= 0) continue;

      player.ammo--;
      this.weaponCooldowns.fire(player.id);

      const result = processShot(player, alivePlayers, this.enemies);
      console.log(`[SHOT] player=${player.name} pos=(${player.x.toFixed(1)},${player.y.toFixed(1)},${player.z.toFixed(1)}) yaw=${player.yaw.toFixed(2)} pitch=${player.pitch.toFixed(2)} → ${result ? `hit ${result.targetType} #${result.targetId}` : 'miss'} enemies=${this.enemies.filter(e => e.state !== 'dead').length}`);
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
              // Score: steal all victim's score
              const stolen = target.score;
              player.score += stolen;
              target.score = 0;
              this.teamScores[player.team] += stolen;
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

            // Drop a pickup on enemy death
            if (killed) {
              // Score: +5 for enemy kill
              player.score += 5;
              this.teamScores[player.team] += 5;

              const dropKind: 'health' | 'ammo' = this.rng() < 0.5 ? 'health' : 'ammo';
              const drop: ServerPickup = {
                id: this.nextPickupId++,
                x: enemy.x,
                z: enemy.z,
                kind: dropKind,
                active: true,
                respawnTimer: 0,
              };
              this.pickups.push(drop);
              const spawnMsg: PickupSpawnedMessage = {
                type: 'pickup_spawned',
                pickupId: drop.id,
                x: drop.x,
                z: drop.z,
                kind: drop.kind,
              };
              this.broadcast(spawnMsg);
            }
          }
        }
      }
    }

    // 5. Update weapon cooldowns
    this.weaponCooldowns.update(dt);

    // 6. Update enemy AI
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

    // 7. Process pickup interactions
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

    // 8. Update pickup respawns
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

    // 9. Check respawn timers for dead players
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

    // 10. Check shuffle timer
    this.shuffleTimer -= dt;
    if (this.shuffleTimer <= 0) {
      this.performShuffle();
      this.shuffleTimer = this.SHUFFLE_INTERVAL;
    }

    // 11. Update time and check win condition
    this.timeRemaining -= dt;
    const winner = this.checkWinCondition();
    if (winner) {
      this.endGame(winner.reason, winner.winnerId);
      return;
    }

    // 12. Broadcast per-client snapshot
    this.broadcastSnapshots();
  }

  private checkWinCondition(): { reason: 'kill_target' | 'time_up'; winnerId: number } | null {
    // Check team kill target
    if (this.teamScores.red >= this.config.killTarget) {
      // Winner is top scorer on red team
      const redPlayers = this.teamManager.getPlayersByTeam('red');
      const winnerId = this.getTopScorer(redPlayers);
      return { reason: 'kill_target', winnerId };
    }
    if (this.teamScores.blue >= this.config.killTarget) {
      const bluePlayers = this.teamManager.getPlayersByTeam('blue');
      const winnerId = this.getTopScorer(bluePlayers);
      return { reason: 'kill_target', winnerId };
    }

    // Check time
    if (this.timeRemaining <= 0) {
      // Winner is team with higher score
      const winningTeam: Team = this.teamScores.red >= this.teamScores.blue ? 'red' : 'blue';
      const teamPlayers = this.teamManager.getPlayersByTeam(winningTeam);
      const winnerId = this.getTopScorer(teamPlayers);
      return { reason: 'time_up', winnerId };
    }

    return null;
  }

  private getTopScorer(playerIds: number[]): number {
    let bestId = -1;
    let bestKills = -1;
    for (const id of playerIds) {
      const player = this.players.get(id);
      if (player && player.kills > bestKills) {
        bestKills = player.kills;
        bestId = id;
      }
    }
    return bestId;
  }

  private endGame(reason: 'kill_target' | 'time_up', winnerId: number): void {
    this.state = 'result';
    this.stopTickLoop();

    const winner = this.players.get(winnerId);
    const winnerTeam: Team | null = winner ? winner.team : null;
    const duration = this.config.timeLimit - this.timeRemaining;

    const scoreboard = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score || b.kills - a.kills)
      .map(p => ({
        id: p.id,
        name: p.name,
        kills: p.kills,
        deaths: p.deaths,
        score: p.score,
      }));

    const gameOver: GameOverMessage = {
      type: 'game_over',
      reason,
      winnerId,
      winnerName: winner?.name ?? 'Unknown',
      winnerTeam,
      teamScores: { ...this.teamScores },
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
    this.teamManager.clear();
    this.teamScores = { red: 0, blue: 0 };
    this.lobby.reset();
  }

  private performShuffle(): void {
    const playerIds = [...this.players.keys()];
    this.teamManager.shuffle(playerIds, this.rng);

    // Apply new teams and teleport
    const halfIdx = Math.floor(this.corridorWorldPos.length / 2);
    const redSpawns = this.corridorWorldPos.slice(0, halfIdx);
    const blueSpawns = this.corridorWorldPos.slice(halfIdx);

    for (const [id, player] of this.players) {
      player.team = this.teamManager.getTeam(id);
      const spawns = player.team === 'red' ? redSpawns : blueSpawns;
      if (spawns.length > 0) {
        const spawn = spawns[Math.floor(this.rng() * spawns.length)]!;
        player.teleportTo(spawn.x, spawn.z);
      }
      player.hp = 100;
      player.alive = true;
      player.invincible = true;
      player.invincibleTimer = 2.0;
      player.respawnTimer = 0;
    }

    const shuffleMsg: TeamsShuffledMessage = {
      type: 'teams_shuffled',
      players: playerIds.map(id => ({ id, team: this.teamManager.getTeam(id) })),
    };
    this.broadcast(shuffleMsg);
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
        teamScores: { ...this.teamScores },
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
        score: p.score,
        name: p.name,
        invincible: p.invincible,
        team: p.team,
        isBot: p.isBot,
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
   * Matches client Level.ts buildFromMaze() exactly, including door splits.
   */
  private buildWalls(maze: MazeData): AABB2D[] {
    const cs = CELL_SIZE;
    const wt = WALL_THICKNESS;
    const doorW = 1.4; // CONFIG.door.width
    const totalW = maze.cols * cs;
    const totalD = maze.rows * cs;
    const halfW = totalW / 2;
    const halfD = totalD / 2;
    const wallList: AABB2D[] = [];

    // Build door lookup — same canonicalization as Level.ts
    const doorWalls = new Set<string>();
    for (const door of maze.doors) {
      const { cellRow: r, cellCol: c, wallDir } = door;
      if (wallDir === DIR.N) doorWalls.add(`N:${r}:${c}`);
      else if (wallDir === DIR.S) doorWalls.add(`N:${r + 1}:${c}`);
      else if (wallDir === DIR.W) doorWalls.add(`W:${r}:${c}`);
      else if (wallDir === DIR.E) doorWalls.add(`W:${r}:${c + 1}`);
    }

    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        const open = maze.grid[r]![c]!;
        const cx = -halfW + c * cs;
        const cz = -halfD + r * cs;

        // North wall (horizontal, along X axis, at z = cz)
        if (!(open & DIR.N)) {
          if (doorWalls.has(`N:${r}:${c}`)) {
            const sideLen = (cs - doorW) / 2;
            if (sideLen > 0.01) {
              wallList.push({ minX: cx, maxX: cx + sideLen, minZ: cz - wt / 2, maxZ: cz + wt / 2 });
              wallList.push({ minX: cx + cs - sideLen, maxX: cx + cs, minZ: cz - wt / 2, maxZ: cz + wt / 2 });
            }
          } else {
            wallList.push({ minX: cx, maxX: cx + cs, minZ: cz - wt / 2, maxZ: cz + wt / 2 });
          }
        }

        // West wall (vertical, along Z axis, at x = cx)
        if (!(open & DIR.W)) {
          if (doorWalls.has(`W:${r}:${c}`)) {
            const sideLen = (cs - doorW) / 2;
            if (sideLen > 0.01) {
              wallList.push({ minX: cx - wt / 2, maxX: cx + wt / 2, minZ: cz, maxZ: cz + sideLen });
              wallList.push({ minX: cx - wt / 2, maxX: cx + wt / 2, minZ: cz + cs - sideLen, maxZ: cz + cs });
            }
          } else {
            wallList.push({ minX: cx - wt / 2, maxX: cx + wt / 2, minZ: cz, maxZ: cz + cs });
          }
        }
      }
    }

    // Eastern boundary (rightmost column east walls)
    for (let r = 0; r < maze.rows; r++) {
      const cx = -halfW + maze.cols * cs;
      const cz = -halfD + r * cs;
      wallList.push({ minX: cx - wt / 2, maxX: cx + wt / 2, minZ: cz, maxZ: cz + cs });
    }

    // Southern boundary (bottom row south walls)
    for (let c = 0; c < maze.cols; c++) {
      const cx = -halfW + c * cs;
      const cz = -halfD + maze.rows * cs;
      wallList.push({ minX: cx, maxX: cx + cs, minZ: cz - wt / 2, maxZ: cz + wt / 2 });
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
