import { CONFIG } from './config';
import { Engine } from './Engine';
import { Input } from './Input';
import { Sfx } from './Sfx';
import { FlightController } from './player/FlightController';
import { CameraSystem } from './core/CameraSystem';
import * as THREE from 'three';

export type GameState = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'level_complete' | 'game_over';

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly sfx: Sfx;
  readonly flight: FlightController;
  readonly cameraSystem: CameraSystem;

  private state: GameState = 'menu';

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.renderer.domElement);
    this.sfx = new Sfx();

    this.flight = new FlightController(this.input);
    this.cameraSystem = new CameraSystem(this.engine.camera);

    // Temp debug scene for visual reference
    this.addDebugScene();

    // V to toggle camera
    this.input.registerKey('v', () => {
      this.cameraSystem.toggleMode();
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
    this.cameraSystem.update(dt, this.flight);
  }

  /** Temporary debug geometry — floating boxes + cloud plane. Replaced by Arena later. */
  private addDebugScene(): void {
    this.engine.scene.add(new THREE.AmbientLight(CONFIG.render.ambientColor, CONFIG.render.ambientIntensity));
    const sun = new THREE.DirectionalLight(CONFIG.render.moonColor, CONFIG.render.moonIntensity);
    sun.position.set(50, 100, 50);
    this.engine.scene.add(sun);

    // Cloud-like ground at y=0
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4466aa,
      transparent: true,
      opacity: 0.3,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.engine.scene.add(ground);

    // Floating boxes as spatial reference
    const boxGeo = new THREE.BoxGeometry(10, 30, 10);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0 });
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xdaa520 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 80;
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.set(Math.cos(angle) * r, 40 + Math.random() * 40, Math.sin(angle) * r);
      this.engine.scene.add(box);
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), outlineMat);
      wire.position.copy(box.position);
      this.engine.scene.add(wire);
    }
  }

  dispose(): void {
    this.flight.dispose();
    this.cameraSystem.dispose();
    this.input.dispose();
    this.engine.dispose();
  }
}
