import { Engine } from './Engine';
import { Input } from './Input';
import { Sfx } from './Sfx';

export type GameState = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'level_complete' | 'game_over';

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly sfx: Sfx;

  private state: GameState = 'menu';

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.renderer.domElement);
    this.sfx = new Sfx();
    this.engine.addUpdater((dt) => this.update(dt));
  }

  start(): void {
    this.state = 'playing';
    this.sfx.unlock();
    this.input.requestPointerLock();
    this.engine.start();
  }

  private update(_dt: number): void {
    if (this.state !== 'playing') return;
  }

  dispose(): void {
    this.input.dispose();
    this.engine.dispose();
  }
}
