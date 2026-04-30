import { CONFIG } from './config';
import { Engine, type EngineConfig } from '../shared/Engine';
import { Input } from '../shared/Input';
import { Level } from './Level';
import { Player } from './Player';
import { Weapon } from './Weapon';
import { WeaponModel } from './WeaponModel';
import { Hud } from './Hud';
import { Sfx } from '../shared/Sfx';
import { generateMaze, cellToWorld, findCorridorCells, type MazeData } from './Maze';
import { Door } from './Door';
import { Room } from './Room';
import { drawCards, showCardPicker, type Card, type WeaponCard, type StatCard, type SpecialCard } from './CardPicker';
import type { WeaponType } from './weapons';
import { Enemy } from './Enemy';
import { Hazard } from './Hazard';
import * as THREE from 'three';

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

  constructor(container: HTMLElement) {
    const engineCfg: EngineConfig = {
      fogColor: CONFIG.colors.fog,
      fogDensity: CONFIG.render.fogDensity,
      fov: CONFIG.render.fov,
      near: CONFIG.render.near,
      far: CONFIG.render.far,
      cameraY: CONFIG.player.height,
      cameraZ: 8,
    };
    this.engine = new Engine(container, engineCfg);
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
      const spawnPos = new THREE.Vector3(pos.x, 0, pos.z);
      this.corridorEnemies.push(new Enemy(spawnPos, this.engine.scene, 'patrol', floor));
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

  private bindActions(): void {
    // Click to shoot
    this.input.onMouseDown.push(() => {
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
      if (this.state === 'exploring') {
        this.tryOpenDoor().catch((e) => void e);
      } else if (this.state === 'in_room') {
        this.tryRoomInteract().catch((e) => void e);
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
    this.updateSingleplayer(dt);
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
