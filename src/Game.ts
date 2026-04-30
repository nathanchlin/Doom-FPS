import { CONFIG } from './config';
import { Engine } from './Engine';
import { Input } from './Input';
import { Level } from './Level';
import { Player } from './Player';
import { Weapon } from './Weapon';
import { WeaponModel } from './WeaponModel';
import { Hud } from './Hud';
import { Sfx } from './Sfx';
import { generateMaze, cellToWorld, findCorridorCells, type MazeData } from './Maze';
import { Door } from './Door';
import { Room } from './Room';
import { drawCards, showCardPicker, type Card, type WeaponCard, type StatCard, type SpecialCard } from './CardPicker';
import type { WeaponType } from './weapons';
import { Enemy } from './Enemy';
import { Hazard } from './Hazard';
import * as THREE from 'three';
import { NetClient } from './client/NetClient';
import { RemotePlayer } from './client/RemotePlayer';
import { MultiplayerHud } from './client/MultiplayerHud';
import { LobbyUI } from './client/LobbyUI';
import { generateMaze as generateMazeSeeded } from './shared/maze';
import { KEY, type SnapshotMessage, type PlayerState, type Team, type TeamScores } from './shared/protocol';

type GameState = 'exploring' | 'in_room' | 'dead';

/**
 * Game — top-level orchestrator for maze gameplay.
 * State machine: exploring (maze) → in_room (combat/treasure/exit) → dead
 * Manages floor progression, door interactions, room teleportation.
 */
export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly weaponModel: WeaponModel;
  readonly hud: Hud;
  readonly sfx: Sfx;

  private level!: Level;
  private player!: Player;
  private weapon!: Weapon;
  private mazeData!: MazeData;
  private doors: Door[] = [];
  private corridorEnemies: Enemy[] = [];
  private hazards: Hazard[] = [];
  private currentRoom: Room | null = null;

  private state: GameState = 'exploring';
  private floor = 1;
  private doorsOpened = 0;
  private totalKills = 0;
  private elapsedTime = 0;
  private transitioning = false;
  private nearDoor: Door | null = null;

  private playerBuffs = {
    currentWeapon: 'rifle' as WeaponType,
    damageMultiplier: 1.0,
    maxHealthBonus: 0,
    maxAmmoBonus: 0,
    speedBonus: 0,
    sprintBonus: 0,
    shieldHits: 0,
    scoutActive: false,
  };

  // ─── Multiplayer ───
  private mode: 'singleplayer' | 'multiplayer' = 'singleplayer';
  private net: NetClient | null = null;
  private myId = -1;
  private remotePlayers: Map<number, RemotePlayer> = new Map();
  private mpHud: MultiplayerHud | null = null;
  private lobbyUI: LobbyUI | null = null;
  private inputSeq = 0;
  private lastSnapshot: SnapshotMessage | null = null;
  private mpRespawnTimer = -1;
  private pickupMeshes: Map<number, THREE.Mesh> = new Map();
  private pickupKinds: Map<number, 'health' | 'ammo'> = new Map();
  private localTeam: Team = 'red';
  private teamScores: TeamScores = { red: 0, blue: 0 };

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.engine.scene.add(this.engine.camera);

    this.input = new Input(this.engine.renderer.domElement);
    this.weaponModel = new WeaponModel(this.engine.camera);
    this.sfx = new Sfx();
    this.hud = new Hud();

    // Initial maze
    this.initFloor(1);

    this.bindActions();
    this.registerUpdaters();
    this.refreshHud();
  }

  async startMultiplayer(wsUrl: string, playerName: string): Promise<void> {
    this.mode = 'multiplayer';
    this.net = new NetClient();
    this.mpHud = new MultiplayerHud();
    this.lobbyUI = new LobbyUI(this.net);

    await this.net.connect(wsUrl);
    this.net.send({ type: 'join', name: playerName });

    this.net.on('welcome', (msg) => {
      this.myId = msg.playerId;
      this.lobbyUI!.show(this.myId, wsUrl);
    });

    this.net.on('lobby_state', (msg) => {
      this.lobbyUI!.update(msg);
    });

    this.net.on('game_start', (msg) => {
      this.lobbyUI!.hide();
      this.sfx.unlock();

      // Clean up singleplayer leftovers from initFloor(1) in constructor
      for (const d of this.doors) d.dispose(this.engine.scene);
      this.doors = [];
      for (const e of this.corridorEnemies) e.dispose(this.engine.scene);
      this.corridorEnemies = [];
      for (const h of this.hazards) h.dispose(this.engine.scene);
      this.hazards = [];
      if (this.currentRoom) {
        this.currentRoom.dispose(this.engine.scene);
        this.currentRoom = null;
      }

      // Generate maze from seed
      const mazeData = generateMazeSeeded(msg.floor, msg.mazeSeed);
      if (this.level) this.level.dispose(this.engine.scene);
      this.level = new Level(this.engine.scene, mazeData);
      this.mazeData = mazeData;

      if (!this.player) {
        this.player = new Player(this.engine.camera, this.input, this.level);
        this.weapon = new Weapon(this.player, this.weaponModel, this.sfx);
      } else {
        this.player.setLevel(this.level);
      }

      // Spawn visual-only enemies (AI runs on server)
      for (const e of this.corridorEnemies) e.dispose(this.engine.scene);
      this.corridorEnemies = [];
      for (const es of msg.enemySpawns) {
        const spawn = new THREE.Vector3(es.x, 0, es.z);
        this.corridorEnemies.push(
          new Enemy(spawn, this.engine.scene, es.enemyType as import('./Enemy').EnemyType, 1),
        );
      }

      this.state = 'exploring';
      this.mpHud!.show();
      this.engine.start();

      // Hide singleplayer-only HUD elements (doors, floor)
      document.querySelector('.hud-top-left')?.setAttribute('style', 'display:none');
      document.querySelector('.hud-top-right')?.setAttribute('style', 'display:none');

      // Show overlay — browser requires user gesture for pointer lock
      const overlay = document.getElementById('overlay')!;
      const startBtn = document.getElementById('start') as HTMLButtonElement;
      startBtn.textContent = '点击开始战斗';
      overlay.style.display = 'flex';
      // Pointer lock will happen when user clicks the start button (handled in main.ts)
    });

    this.net.on('snapshot', (msg) => {
      this.lastSnapshot = msg;
    });

    this.net.on('hit', (msg) => {
      if (msg.targetType === 'player' && msg.targetId === this.myId) {
        this.sfx.damage();
        this.hud.flashDamage();
      }
      if (msg.attackerId === this.myId) {
        this.hud.flashHitMarker();
        this.sfx.hit();
      }
      // Enemy hit flash
      if (msg.targetType === 'enemy') {
        const e = this.corridorEnemies[msg.targetId];
        if (e) e.hitFlash();
      }
    });

    this.net.on('kill', (msg) => {
      // Find killer and victim team for colored kill feed
      this.mpHud!.addKillFeedEntry(msg);
      if (msg.victimId === this.myId) {
        this.mpRespawnTimer = 3;
        this.player.alive = false;
      }
      if (msg.killerId === this.myId) {
        this.sfx.enemyDie();
      }
    });

    this.net.on('respawn', (msg) => {
      if (msg.playerId === this.myId) {
        this.player.alive = true;
        this.player.hp = 100;
        this.player.ammo = 30;
        this.player.teleportTo(msg.x, msg.z);
        this.mpRespawnTimer = -1;
        this.mpHud!.hideRespawnCountdown();
      }
    });

    this.net.on('game_over', (msg) => {
      const el = document.getElementById('mp-gameover')!;
      const winner = document.getElementById('mp-winner')!;
      const sb = document.getElementById('mp-scoreboard-final')!;

      // Team-based game over
      if (msg.winnerTeam) {
        const teamName = msg.winnerTeam === 'red' ? 'RED' : 'BLUE';
        const teamColor = msg.winnerTeam === 'red' ? '#cc3333' : '#3366cc';
        winner.innerHTML = `<span style="color:${teamColor}">${teamName} TEAM</span> 获胜！`;
      } else {
        winner.textContent = '平局！';
      }

      // Team scores line
      const tsLine = `<div style="font-size:18px;margin-bottom:12px;">` +
        `<span style="color:#cc3333">RED ${msg.teamScores.red}</span>` +
        ` — ` +
        `<span style="color:#3366cc">${msg.teamScores.blue} BLUE</span></div>`;

      sb.innerHTML = tsLine + msg.scoreboard
        .map((p, i) => `<div>#${i + 1} ${p.name} — <b>${p.score}分</b> (${p.kills}杀/${p.deaths}死)</div>`)
        .join('');
      el.style.display = 'flex';
      this.input.exitPointerLock();
    });

    this.net.on('pickup_spawned', (msg) => {
      // Create a glowing box at the drop location
      const color = msg.kind === 'health' ? CONFIG.colors.pickupHealth : CONFIG.colors.pickupAmmo;
      const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.8,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(msg.x, 0.3, msg.z);
      mesh.castShadow = true;
      this.engine.scene.add(mesh);
      this.pickupMeshes.set(msg.pickupId, mesh);
      this.pickupKinds.set(msg.pickupId, msg.kind);
    });

    this.net.on('pickup_taken', (msg) => {
      const mesh = this.pickupMeshes.get(msg.pickupId);
      if (mesh) {
        this.engine.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.pickupMeshes.delete(msg.pickupId);
      }
      if (msg.playerId === this.myId) {
        this.sfx.chestOpen();
        const kind = this.pickupKinds.get(msg.pickupId);
        if (kind === 'health') {
          this.hud.showLoot(0, 25);
        } else if (kind === 'ammo') {
          this.hud.showLoot(15, 0);
        }
      }
      this.pickupKinds.delete(msg.pickupId);
    });

    this.net.on('disconnected', () => {
      alert('与主机断开连接');
      window.location.reload();
    });

    this.net.on('teams_shuffled', (msg) => {
      // Update local team
      const myEntry = msg.players.find((p: { id: number; team: Team }) => p.id === this.myId);
      if (myEntry) {
        this.localTeam = myEntry.team;
      }
      // Show shuffle notification
      this.mpHud?.showShuffleNotification();
    });
  }

  private initFloor(floor: number): void {
    // Clean up old level and doors
    if (this.level) {
      this.level.dispose(this.engine.scene);
    }
    for (const d of this.doors) d.dispose(this.engine.scene);
    this.doors = [];

    // Generate maze
    this.floor = floor;
    this.mazeData = generateMaze(floor);

    // Build level geometry
    this.level = new Level(this.engine.scene, this.mazeData);

    // Create or update player
    if (!this.player) {
      this.player = new Player(this.engine.camera, this.input, this.level);
      this.weapon = new Weapon(this.player, this.weaponModel, this.sfx);
    } else {
      this.player.setLevel(this.level);
    }

    // Place player at spawn
    const spawn = this.level.getPlayerSpawn();
    this.player.teleportTo(spawn.x, spawn.z);

    // Create doors and register their collision
    for (const dp of this.mazeData.doors) {
      const door = new Door(dp, this.mazeData.rows, this.mazeData.cols, this.engine.scene);
      this.doors.push(door);
      this.level.walls.push(door.collisionAABB);
    }

    this.doorsOpened = 0;

    // Spawn corridor patrol enemies
    for (const e of this.corridorEnemies) e.dispose(this.engine.scene);
    this.corridorEnemies = [];

    const corridorCells = findCorridorCells(this.mazeData.grid, this.mazeData.rows, this.mazeData.cols);
    const shuffledCorridors = corridorCells.sort(() => Math.random() - 0.5);

    const enemyCount = Math.min(2 + floor, 8, shuffledCorridors.length);
    for (let i = 0; i < enemyCount; i++) {
      const cell = shuffledCorridors[i]!;
      const pos = cellToWorld(cell.row, cell.col, this.mazeData.rows, this.mazeData.cols);
      const spawn = new THREE.Vector3(pos.x, 0, pos.z);
      this.corridorEnemies.push(new Enemy(spawn, this.engine.scene, 'patrol', floor));
    }

    // Spawn floor hazards
    for (const h of this.hazards) h.dispose(this.engine.scene);
    this.hazards = [];

    const hazardCount = Math.min(CONFIG.hazard.baseCount + floor, CONFIG.hazard.maxCount, shuffledCorridors.length - enemyCount);
    for (let i = 0; i < hazardCount; i++) {
      const cell = shuffledCorridors[enemyCount + i]!;
      const pos = cellToWorld(cell.row, cell.col, this.mazeData.rows, this.mazeData.cols);
      this.hazards.push(new Hazard(pos.x, pos.z, this.engine.scene));
    }
  }

  start(): void {
    this.input.requestPointerLock();
    this.engine.start();
  }

  isMultiplayer(): boolean {
    return this.mode === 'multiplayer';
  }

  /** Switch weapon by type name (used by touch controls). */
  switchWeapon(type: WeaponType): void {
    if (!this.weapon || !this.player) return;
    const newMax = this.weapon.switchWeapon(type, this.playerBuffs.maxAmmoBonus);
    this.player.ammo = newMax;
    this.weapon.setDamageMultiplier(this.playerBuffs.damageMultiplier);
    const weaponNames: Record<WeaponType, string> = { rifle: '步枪', shotgun: '霰弹枪', sniper: '狙击枪' };
    this.hud.setWeapon(weaponNames[type]);
    this.hud.setAmmo(this.player.ammo);
  }

  getLocalTeam(): string {
    return this.localTeam;
  }

  getTeamScores(): TeamScores {
    return this.teamScores;
  }

  private bindActions(): void {
    // Click to shoot
    this.input.onMouseDown.push(() => {
      if (this.mode === 'multiplayer') {
        // Multiplayer: just play local SFX for feedback, server handles damage
        if (this.player?.alive && this.player.ammo > 0) {
          this.weaponModel.fire();
          this.sfx.shoot();
        } else if (this.player?.ammo === 0) {
          this.sfx.empty();
        }
        return;
      }
      // Singleplayer: local raycast
      if (this.state !== 'exploring' && this.state !== 'in_room') return;
      const enemies = this.state === 'in_room' && this.currentRoom
        ? this.currentRoom.enemies
        : this.corridorEnemies;
      const hit = this.weapon.tryFire(enemies);
      if (hit) {
        this.hud.flashHitMarker();
        this.sfx.hit();
        if (!hit.enemy.alive) {
          this.sfx.enemyDie();
          this.totalKills++;
        }
      }
    });

    // E to interact
    this.input.onInteract.push(() => {
      if (this.transitioning) return;
      if (this.mode === 'multiplayer') {
        if (this.net && this.player) {
          this.inputSeq++;
          const keys =
            (this.input.isDown('w') ? KEY.W : 0) |
            (this.input.isDown('a') ? KEY.A : 0) |
            (this.input.isDown('s') ? KEY.S : 0) |
            (this.input.isDown('d') ? KEY.D : 0) |
            (this.input.isDown(' ') ? KEY.SPACE : 0) |
            (this.input.isDown('shift') ? KEY.SHIFT : 0);
          this.net.send({
            type: 'input',
            seq: this.inputSeq,
            keys,
            yaw: this.player.getYaw(),
            pitch: this.player.getPitch(),
            fire: false,
            interact: true,
          });
        }
        return;
      }
      if (this.state === 'exploring') {
        this.tryOpenDoor().catch((e) => console.error('tryOpenDoor error:', e));
      } else if (this.state === 'in_room') {
        this.tryRoomInteract().catch((e) => console.error('tryRoomInteract error:', e));
      }
    });

    // R to reload or restart
    this.input.registerKey('r', () => {
      if (this.state === 'dead') {
        this.restart();
      } else {
        const maxAmmo = this.weapon.getConfig().magazine + this.playerBuffs.maxAmmoBonus;
        this.player.ammo = maxAmmo;
        this.hud.setAmmo(this.player.ammo);
      }
    });
  }

  private async tryOpenDoor(): Promise<void> {
    if (!this.nearDoor || this.nearDoor.getState() === 'used') return;

    const door = this.nearDoor;
    this.transitioning = true;
    this.sfx.doorOpen();
    door.markUsed();
    this.doorsOpened++;
    this.hud.setDoors(this.doorsOpened, this.doors.length);
    this.hud.hideInteract();

    // Remove door collision so player can walk through after returning
    const idx = this.level.walls.indexOf(door.collisionAABB);
    if (idx >= 0) this.level.walls.splice(idx, 1);

    // Save position for return
    this.player.savePosition();

    // Fade to black
    await this.hud.fadeIn();

    // Create room
    const roomType = door.roomType;
    this.currentRoom = new Room(roomType, this.engine.scene, this.floor);

    // Swap player collision to room walls
    this.player.setLevel(this.currentRoom);

    // Teleport player into room center
    this.player.teleportTo(500, 500 + CONFIG.room.size / 2 - 2);

    this.state = 'in_room';

    if (roomType === 'combat') {
      this.hud.showRoomStatus(this.currentRoom.getAliveEnemyCount());
    }

    // Fade from black
    await this.hud.fadeOut();
    this.transitioning = false;
  }

  private async tryRoomInteract(): Promise<void> {
    if (!this.currentRoom) return;

    const px = this.player.position.x;
    const pz = this.player.position.z;

    // Check chest interaction
    if (this.currentRoom.chest && this.currentRoom.chest.isPlayerNear(px, pz) && !this.currentRoom.chest.isOpened()) {
      const loot = this.currentRoom.chest.open();
      this.sfx.chestOpen();
      this.player.ammo = Math.min(this.player.ammo + loot.ammo, CONFIG.player.maxAmmo);
      this.player.hp = Math.min(this.player.hp + loot.health, CONFIG.player.maxHealth);
      this.hud.setAmmo(this.player.ammo);
      this.hud.setHp(this.player.hp);
      this.hud.showLoot(loot.ammo, loot.health);
      return;
    }

    // Check exit portal
    if (this.currentRoom.type === 'exit' && this.currentRoom.isNearExitPortal(px, pz)) {
      await this.advanceFloor();
      return;
    }

    // Check return door
    if (this.currentRoom.isNearReturnDoor(px, pz)) {
      await this.exitRoom();
      return;
    }
  }

  private async exitRoom(): Promise<void> {
    this.transitioning = true;
    await this.hud.fadeIn();

    // Dispose room
    if (this.currentRoom) {
      this.currentRoom.dispose(this.engine.scene);
      this.currentRoom = null;
    }

    // Restore player to maze position and collision
    this.player.setLevel(this.level);
    this.player.restorePosition();
    this.state = 'exploring';
    this.hud.hideRoomStatus();

    await this.hud.fadeOut();
    this.transitioning = false;
  }

  private async advanceFloor(): Promise<void> {
    this.transitioning = true;
    this.sfx.floorTransition();
    await this.hud.fadeIn();

    // Dispose room
    if (this.currentRoom) {
      this.currentRoom.dispose(this.engine.scene);
      this.currentRoom = null;
    }

    // Stop game loop updates during card pick
    this.state = 'exploring'; // prevent in_room updates
    this.hud.hideRoomStatus();

    // Show card picker (unlock mouse for clicking)
    this.input.exitPointerLock();
    await this.hud.fadeOut();

    const cards = drawCards();
    const picked = await showCardPicker(cards);
    this.sfx.cardSelect();

    // Apply card effect
    this.applyCard(picked);

    // Fade and generate new floor
    await this.hud.fadeIn();

    // Reset scout for previous floor
    this.playerBuffs.scoutActive = false;

    this.initFloor(this.floor + 1);

    // Apply scout if it was just picked
    if (picked.category === 'special' && (picked as SpecialCard).effect === 'scout') {
      this.playerBuffs.scoutActive = true;
      for (const door of this.doors) {
        door.enableScout();
      }
    }

    this.refreshHud();

    await this.hud.fadeOut();
    this.hud.showFloorTransition(this.floor);
    this.input.requestPointerLock();
    this.transitioning = false;
  }

  private applyCard(card: Card): void {
    if (card.category === 'weapon') {
      const wc = card as WeaponCard;
      this.playerBuffs.currentWeapon = wc.weaponType;
      const newMax = this.weapon.switchWeapon(wc.weaponType, this.playerBuffs.maxAmmoBonus);
      this.player.ammo = newMax;
      this.weapon.setDamageMultiplier(this.playerBuffs.damageMultiplier);
      this.hud.setWeapon(wc.title);
    } else if (card.category === 'stat') {
      const sc = card as StatCard;
      switch (sc.stat) {
        case 'health':
          this.playerBuffs.maxHealthBonus += CONFIG.cards.stat.healthBoost;
          this.player.maxHealthBonus = this.playerBuffs.maxHealthBonus;
          this.player.hp = Math.min(
            this.player.hp + CONFIG.cards.stat.healthBoost,
            CONFIG.player.maxHealth + this.playerBuffs.maxHealthBonus,
          );
          break;
        case 'ammo':
          this.playerBuffs.maxAmmoBonus += CONFIG.cards.stat.ammoExpand;
          this.player.ammo = Math.min(
            this.player.ammo + CONFIG.cards.stat.ammoExpand,
            this.weapon.getConfig().magazine + this.playerBuffs.maxAmmoBonus,
          );
          break;
        case 'speed':
          this.playerBuffs.speedBonus += CONFIG.cards.stat.speedUp;
          this.playerBuffs.sprintBonus += CONFIG.cards.stat.sprintUp;
          this.player.speedBonus = this.playerBuffs.speedBonus;
          this.player.sprintBonus = this.playerBuffs.sprintBonus;
          break;
        case 'damage':
          this.playerBuffs.damageMultiplier *= CONFIG.cards.stat.damageMultiplier;
          this.weapon.setDamageMultiplier(this.playerBuffs.damageMultiplier);
          break;
      }
    } else {
      const sp = card as SpecialCard;
      switch (sp.effect) {
        case 'heal': {
          const maxHp = CONFIG.player.maxHealth + this.playerBuffs.maxHealthBonus;
          this.player.hp = maxHp;
          break;
        }
        case 'resupply': {
          const maxAmmo = this.weapon.getConfig().magazine + this.playerBuffs.maxAmmoBonus;
          this.player.ammo = maxAmmo;
          break;
        }
        case 'shield':
          this.playerBuffs.shieldHits += CONFIG.cards.special.shieldHits;
          this.player.shieldHits = this.playerBuffs.shieldHits;
          this.hud.setShield(this.playerBuffs.shieldHits);
          break;
        case 'scout':
          // Applied after floor generation in advanceFloor
          break;
      }
    }
  }

  private registerUpdaters(): void {
    this.engine.addUpdater((dt) => this.update(dt));
  }

  private update(dt: number): void {
    if (this.mode === 'singleplayer') {
      this.updateSingleplayer(dt);
    } else {
      this.updateMultiplayer(dt);
    }
  }

  private updateSingleplayer(dt: number): void {
    if (this.state === 'dead') {
      this.weaponModel.update(dt);
      return;
    }

    this.elapsedTime += dt;
    this.player.update(dt);
    this.weapon.update(dt);
    this.weaponModel.update(dt);

    if (this.state === 'exploring') {
      this.updateExploring(dt);
    } else if (this.state === 'in_room') {
      this.updateInRoom(dt);
    }

    this.hud.setAmmo(this.player.ammo);
    this.hud.setHp(this.player.hp);
  }

  private updateMultiplayer(dt: number): void {
    if (!this.net || !this.player) return;

    // 1. Local player: prediction
    this.player.update(dt);
    this.weaponModel.update(dt);

    // 2. Send input to server
    this.inputSeq++;
    const keys =
      (this.input.isDown('w') ? KEY.W : 0) |
      (this.input.isDown('a') ? KEY.A : 0) |
      (this.input.isDown('s') ? KEY.S : 0) |
      (this.input.isDown('d') ? KEY.D : 0) |
      (this.input.isDown(' ') ? KEY.SPACE : 0) |
      (this.input.isDown('shift') ? KEY.SHIFT : 0);

    this.net.send({
      type: 'input',
      seq: this.inputSeq,
      keys,
      yaw: this.player.getYaw(),
      pitch: this.player.getPitch(),
      fire: this.input.isMouseDown(),
      interact: false,
    });

    // 3. Process latest snapshot
    const snap = this.lastSnapshot;
    let me: PlayerState | undefined;
    if (snap) {
      this.lastSnapshot = null;

      // Update local player from server
      me = snap.players.find((p: PlayerState) => p.id === this.myId);
      if (me) {
        const dx = me.x - this.player.position.x;
        const dz = me.z - this.player.position.z;
        if (dx * dx + dz * dz > 0.25) {
          this.player.position.x = me.x;
          this.player.position.z = me.z;
        }
        this.player.hp = me.hp;
        this.player.ammo = me.ammo;
        this.player.alive = me.alive;
        this.hud.setHp(me.hp);
        this.hud.setAmmo(me.ammo);
      }

      // Update remote players
      for (const ps of snap.players) {
        if (ps.id === this.myId) continue;
        let rp = this.remotePlayers.get(ps.id);
        if (!rp) {
          rp = new RemotePlayer(ps.id, ps.name, this.engine.scene);
          this.remotePlayers.set(ps.id, rp);
        }
        rp.pushState(ps);
      }

      // Remove disconnected
      for (const [id, rp] of this.remotePlayers) {
        if (!snap.players.find((p: PlayerState) => p.id === id)) {
          rp.dispose(this.engine.scene);
          this.remotePlayers.delete(id);
        }
      }

      // Update enemies from snapshot
      for (const es of snap.enemies) {
        if (es.id < this.corridorEnemies.length) {
          const e = this.corridorEnemies[es.id]!;
          e.position.x = es.x;
          e.position.z = es.z;
          e.hp = es.hp;
          e.group.position.set(es.x, e.group.position.y, es.z);
          e.group.rotation.y = es.yaw;
          if (es.state === 'dead' && e.alive) {
            e.killVisual();
          } else if (es.state !== 'dead' && !e.alive) {
            e.reviveVisual();
            e.group.position.set(es.x, 0, es.z);
          }
        }
      }

      // Timer + team scores + leaderboard
      this.mpHud?.setTimeRemaining(snap.timeRemaining);
      this.teamScores = snap.teamScores;
      this.mpHud?.setTeamScores(snap.teamScores);
      this.mpHud?.updateLeaderboard(snap.players);

      // Update local team from own state
      if (me) {
        this.localTeam = me.team;
      }
    }

    // 4. Interpolate remote players + enemy death animations + pickup bob
    for (const rp of this.remotePlayers.values()) {
      rp.update(dt);
    }
    for (const e of this.corridorEnemies) {
      e.updateVisual(dt);
    }
    // Bob pickup meshes
    const bobT = performance.now() * 0.003;
    for (const mesh of this.pickupMeshes.values()) {
      mesh.position.y = 0.3 + Math.sin(bobT + mesh.position.x) * 0.1;
      mesh.rotation.y += dt * 2;
    }

    // 5. Respawn countdown
    if (this.mpRespawnTimer > 0) {
      this.mpRespawnTimer -= dt;
      this.mpHud?.showRespawnCountdown(this.mpRespawnTimer);
    }

    // 6. Wall collision for local player
    if (this.level && this.player.alive) {
      const resolved = this.level.resolveCircleVsWalls(
        this.player.position.x,
        this.player.position.z,
        CONFIG.player.radius,
      );
      this.player.position.x = resolved.x;
      this.player.position.z = resolved.z;
    }
  }

  private updateExploring(dt: number): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;

    // Check door proximity
    let foundNear: Door | null = null;
    for (const door of this.doors) {
      if (door.getState() === 'used') {
        door.setHighlight(false);
        continue;
      }
      const near = door.isPlayerNear(px, pz);
      door.setHighlight(near);
      if (near) foundNear = door;
    }

    this.nearDoor = foundNear;
    if (foundNear && !this.transitioning) {
      this.hud.showInteract('[E] 开门');
    } else {
      this.hud.hideInteract();
    }

    // Update corridor enemies
    for (const e of this.corridorEnemies) {
      const result = e.update(dt, this.player, this.level);
      if (result.shot) {
        this.onPlayerHit(e.getDamage());
      }
      if (result.contactHit) {
        this.onPlayerHit(e.getDamage());
      }
    }

    // Check floor hazards
    for (const hz of this.hazards) {
      if (hz.isInside(px, pz)) {
        this.onPlayerHit(hz.damagePerSecond * dt);
      }
    }

    // Resolve player collision against maze walls
    const resolved = this.level.resolveCircleVsWalls(
      this.player.position.x,
      this.player.position.z,
      CONFIG.player.radius,
    );
    this.player.position.x = resolved.x;
    this.player.position.z = resolved.z;
  }

  private updateInRoom(dt: number): void {
    if (!this.currentRoom) return;

    const px = this.player.position.x;
    const pz = this.player.position.z;

    // Room wall collision
    const resolved = this.currentRoom.resolveCircleVsWalls(px, pz, CONFIG.player.radius);
    this.player.position.x = resolved.x;
    this.player.position.z = resolved.z;

    // Update room (enemies, chest)
    const result = this.currentRoom.update(dt, this.player);

    // Handle damage
    if (result.shot) {
      this.onPlayerHit(result.shotDamage);
    }
    if (result.contactHit) {
      this.onPlayerHit(result.contactDamage);
    }

    // Update room HUD
    if (this.currentRoom.type === 'combat') {
      this.hud.showRoomStatus(this.currentRoom.getAliveEnemyCount());
    }

    // Interact prompts in room
    if (!this.transitioning) {
      if (this.currentRoom.chest && this.currentRoom.chest.isPlayerNear(px, pz) && !this.currentRoom.chest.isOpened()) {
        this.hud.showInteract('[E] 打开宝箱');
      } else if (this.currentRoom.type === 'exit' && this.currentRoom.isNearExitPortal(px, pz)) {
        this.hud.showInteract('[E] 进入下一层');
      } else if (this.currentRoom.isNearReturnDoor(px, pz)) {
        this.hud.showInteract('[E] 返回迷宫');
      } else {
        this.hud.hideInteract();
      }
    }
  }

  private onPlayerHit(damage: number): void {
    if (this.state === 'dead') return;
    const died = this.player.takeDamage(damage);
    this.sfx.damage();
    this.hud.flashDamage();
    this.hud.setHp(this.player.hp);
    // Sync shield display
    this.playerBuffs.shieldHits = this.player.shieldHits;
    this.hud.setShield(this.playerBuffs.shieldHits);
    if (died) {
      this.onDeath();
    }
  }

  private onDeath(): void {
    this.state = 'dead';
    this.sfx.death();
    this.input.exitPointerLock();
    this.hud.showGameOver(
      {
        floor: this.floor,
        kills: this.totalKills,
        time: this.elapsedTime,
        doors: this.doorsOpened,
      },
      () => this.restart(),
    );
  }

  restart(): void {
    // Dispose current room if any
    if (this.currentRoom) {
      this.currentRoom.dispose(this.engine.scene);
      this.currentRoom = null;
    }

    // Reset stats
    this.totalKills = 0;
    this.elapsedTime = 0;

    // Reset buffs
    this.playerBuffs = {
      currentWeapon: 'rifle',
      damageMultiplier: 1.0,
      maxHealthBonus: 0,
      maxAmmoBonus: 0,
      speedBonus: 0,
      sprintBonus: 0,
      shieldHits: 0,
      scoutActive: false,
    };
    this.weapon.switchWeapon('rifle', 0);
    this.weapon.setDamageMultiplier(1.0);
    this.player.speedBonus = 0;
    this.player.sprintBonus = 0;
    this.player.maxHealthBonus = 0;
    this.player.shieldHits = 0;
    this.hud.setWeapon('步枪');
    this.hud.setShield(0);

    // Reset player
    this.player.hp = CONFIG.player.maxHealth;
    this.player.ammo = CONFIG.player.maxAmmo;
    this.player.alive = true;

    // Generate floor 1
    this.initFloor(1);
    this.state = 'exploring';

    this.hud.hideEndScreens();
    this.hud.hideRoomStatus();
    this.hud.hideInteract();
    this.refreshHud();
    this.hud.showFloorTransition(1);
    this.input.requestPointerLock();
  }

  private refreshHud(): void {
    this.hud.setHp(this.player.hp);
    this.hud.setAmmo(this.player.ammo);
    this.hud.setFloor(this.floor);
    this.hud.setDoors(this.doorsOpened, this.doors.length);
  }

  dispose(): void {
    if (this.currentRoom) {
      this.currentRoom.dispose(this.engine.scene);
    }
    for (const d of this.doors) d.dispose(this.engine.scene);
    for (const e of this.corridorEnemies) e.dispose(this.engine.scene);
    for (const h of this.hazards) h.dispose(this.engine.scene);
    this.level.dispose(this.engine.scene);
    this.input.dispose();
    this.engine.dispose();
  }
}
