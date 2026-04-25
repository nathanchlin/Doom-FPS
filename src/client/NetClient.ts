import type {
  ClientMessage,
  ServerMessage,
  SnapshotMessage,
  GameStartMessage,
  LobbyStateMessage,
  WelcomeMessage,
  HitMessage,
  KillMessage,
  RespawnMessage,
  GameOverMessage,
  PickupTakenMessage,
  PickupSpawnedMessage,
} from '../shared/protocol';

export type NetEventMap = {
  welcome: WelcomeMessage;
  lobby_state: LobbyStateMessage;
  game_start: GameStartMessage;
  snapshot: SnapshotMessage;
  hit: HitMessage;
  kill: KillMessage;
  respawn: RespawnMessage;
  game_over: GameOverMessage;
  player_joined: { id: number; name: string };
  player_left: { id: number; name: string };
  pickup_taken: PickupTakenMessage;
  pickup_spawned: PickupSpawnedMessage;
  disconnected: undefined;
};

type Listener<T> = (data: T) => void;

export class NetClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Array<Listener<unknown>>> = new Map();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => resolve();

      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));

      this.ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data as string) as ServerMessage;
        } catch {
          return;
        }
        this.emit(msg.type, msg);
      };

      this.ws.onclose = () => {
        this.emit('disconnected', undefined);
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on<K extends keyof NetEventMap>(event: K, listener: Listener<NetEventMap[K]>): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener as Listener<unknown>);
    this.listeners.set(event, list);
  }

  off<K extends keyof NetEventMap>(event: K, listener: Listener<NetEventMap[K]>): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(listener as Listener<unknown>);
    if (idx >= 0) list.splice(idx, 1);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private emit(event: string, data: unknown): void {
    const list = this.listeners.get(event);
    if (list) {
      for (const cb of list) cb(data);
    }
  }
}
