import { CONFIG } from './config';
import { Engine } from './Engine';
import { Input } from './Input';
import { Sfx } from './Sfx';
import { FlightController } from './player/FlightController';
import { CameraSystem } from './core/CameraSystem';
import { Arena } from './world/Arena';
import { WeaponSystem } from './player/WeaponSystem';

export type GameState = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'level_complete' | 'game_over';

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly sfx: Sfx;
  readonly flight: FlightController;
  readonly cameraSystem: CameraSystem;
  readonly weaponSystem: WeaponSystem;

  private state: GameState = 'menu';
  private arena!: Arena;
  private level = 1;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.renderer.domElement);
    this.sfx = new Sfx();

    this.flight = new FlightController(this.input);
    this.cameraSystem = new CameraSystem(this.engine.camera);
    this.weaponSystem = new WeaponSystem(this.flight, this.engine.scene, this.sfx);

    this.arena = new Arena(this.engine.scene, this.level);

    // V to toggle camera
    this.input.registerKey('v', () => {
      this.cameraSystem.toggleMode();
    });

    // Mouse click fires Spirit Beam
    this.input.onMouseDown.push(() => {
      if (this.state !== 'playing') return;
      const hit = this.weaponSystem.fireBeam();
      if (hit) {
        // Enemy damage handled when enemy system added
      }
    });

    this.engine.addUpdater((dt) => this.update(dt));
  }

  start(): void {
    this.state = 'playing';
    this.sfx.unlock();
    this.input.requestPointerLock();
    this.engine.start();
  }

  private update(dt: number): void {
    if (this.state !== 'playing') return;

    this.flight.update(dt);

    // Building collision
    const resolved = this.arena.resolveSphereVsBuildings(
      this.flight.position.x,
      this.flight.position.y,
      this.flight.position.z,
      CONFIG.flight.playerRadius,
    );
    this.flight.position.set(resolved.x, resolved.y, resolved.z);

    this.cameraSystem.update(dt, this.flight);
    this.weaponSystem.update(dt);
  }

  dispose(): void {
    this.arena.dispose(this.engine.scene);
    this.flight.dispose();
    this.cameraSystem.dispose();
    this.weaponSystem.dispose();
    this.input.dispose();
    this.engine.dispose();
  }
}
