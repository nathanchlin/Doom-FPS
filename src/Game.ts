import * as THREE from 'three';
import { CONFIG } from './config';
import { Engine } from './Engine';
import { Input } from './Input';
import { Level } from './Level';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { Weapon } from './Weapon';
import { WeaponModel } from './WeaponModel';
import { Hud } from './Hud';
import { Sfx } from './Sfx';

/**
 * Game — top-level orchestrator. Owns every system and wires them:
 *   - per-frame update order: player → weapon → enemies → hit tests → hud
 *   - handles game state: playing | dead | won
 *   - restart() respawns the player and enemies without touching the engine
 */
export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly level: Level;
  readonly player: Player;
  readonly weapon: Weapon;
  readonly weaponModel: WeaponModel;
  readonly hud: Hud;
  readonly sfx: Sfx;
  enemies: Enemy[] = [];

  private state: 'playing' | 'dead' | 'won' = 'playing';

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    // Camera must be in the scene so weapon model attached to camera renders
    this.engine.scene.add(this.engine.camera);

    this.input = new Input(this.engine.renderer.domElement);
    this.level = new Level(this.engine.scene);
    this.player = new Player(this.engine.camera, this.input, this.level);
    this.weaponModel = new WeaponModel(this.engine.camera);
    this.sfx = new Sfx();
    this.weapon = new Weapon(this.player, this.weaponModel, this.sfx);
    this.hud = new Hud();

    this.spawnEnemies();
    this.bindActions();
    this.registerUpdaters();

    this.refreshHud();
  }

  start(): void {
    this.input.requestPointerLock();
    this.engine.start();
  }

  private spawnEnemies(): void {
    // Clear any existing
    for (const e of this.enemies) e.dispose(this.engine.scene);
    this.enemies = [];

    const spawns = this.level.spawnPoints.slice();
    for (let i = 0; i < CONFIG.enemy.count; i++) {
      const sp = spawns[i % spawns.length]!;
      // Jitter slightly so co-located enemies don't overlap
      const jitter = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        0,
        (Math.random() - 0.5) * 4,
      );
      this.enemies.push(new Enemy(sp.clone().add(jitter), this.engine.scene));
    }
  }

  private bindActions(): void {
    // Click to shoot
    this.input.onMouseDown.push(() => {
      if (this.state !== 'playing') return;
      const hit = this.weapon.tryFire(this.enemies);
      if (hit) {
        this.hud.flashHitMarker();
        this.sfx.hit();
        if (!hit.enemy.alive) {
          this.sfx.enemyDie();
        }
      }
    });

    // R to reload (fills ammo) or restart after game end
    this.input.registerKey('r', () => {
      if (this.state !== 'playing') {
        this.restart();
      } else {
        this.player.ammo = CONFIG.player.maxAmmo;
        this.refreshHud();
      }
    });
  }

  private registerUpdaters(): void {
    this.engine.addUpdater((dt) => this.update(dt));
  }

  private update(dt: number): void {
    if (this.state === 'playing') {
      this.player.update(dt);
      this.weapon.update(dt);
      this.weaponModel.update(dt);

      // Enemies + their shots
      let aliveCount = 0;
      for (const e of this.enemies) {
        const { shot } = e.update(dt, this.player, this.level);
        if (e.alive) aliveCount += 1;
        if (shot) this.onPlayerHit();
      }

      this.hud.setEnemies(aliveCount, this.enemies.length);
      this.hud.setAmmo(this.player.ammo);
      this.hud.setHp(this.player.hp);

      if (aliveCount === 0) {
        this.onVictory();
      }
    } else {
      // Even when dead, let enemies finish their death animations
      for (const e of this.enemies) e.update(dt, this.player, this.level);
      this.weaponModel.update(dt);
    }
  }

  private onPlayerHit(): void {
    if (this.state !== 'playing') return;
    const died = this.player.takeDamage(CONFIG.player.damageTakenPerHit);
    this.sfx.damage();
    this.hud.flashDamage();
    this.refreshHud();
    if (died) {
      this.onDeath();
    }
  }

  private onDeath(): void {
    this.state = 'dead';
    this.sfx.death();
    this.input.exitPointerLock();
    this.hud.showGameOver(
      `You killed ${this.enemies.filter((e) => !e.alive).length} / ${this.enemies.length}. Press R or click RESTART.`,
      () => this.restart(),
    );
  }

  private onVictory(): void {
    this.state = 'won';
    this.input.exitPointerLock();
    this.hud.showVictory(
      `All demons cleared. HP left: ${this.player.hp}. Press R or click RESTART.`,
      () => this.restart(),
    );
  }

  restart(): void {
    this.player.respawn();
    this.weapon.reset();
    this.spawnEnemies();
    this.state = 'playing';
    this.hud.hideEndScreens();
    this.refreshHud();
    this.input.requestPointerLock();
  }

  private refreshHud(): void {
    this.hud.setHp(this.player.hp);
    this.hud.setAmmo(this.player.ammo);
    this.hud.setEnemies(this.enemies.filter((e) => e.alive).length, this.enemies.length);
  }

  dispose(): void {
    this.input.dispose();
    this.engine.dispose();
  }
}
