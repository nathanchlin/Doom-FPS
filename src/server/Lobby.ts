import type { WebSocket } from 'ws';
import {
  DEFAULT_MATCH_CONFIG,
  type MatchConfig,
  type LobbyStateMessage,
  type WelcomeMessage,
  type PlayerJoinedMessage,
  type PlayerLeftMessage,
  type ClientMessage,
} from '../shared/protocol';

export interface LobbyPlayer {
  id: number;
  name: string;
  ws: WebSocket;
  ready: boolean;
  isHost: boolean;
}

export class Lobby {
  private players: Map<number, LobbyPlayer> = new Map();
  private nextId = 1;
  private hostId = -1;
  settings: MatchConfig = { ...DEFAULT_MATCH_CONFIG };

  private onStartCallback: ((players: LobbyPlayer[], settings: MatchConfig) => void) | null = null;

  onStart(cb: (players: LobbyPlayer[], settings: MatchConfig) => void): void {
    this.onStartCallback = cb;
  }

  addPlayer(ws: WebSocket, name: string): LobbyPlayer {
    const id = this.nextId++;
    const isHost = this.players.size === 0;
    const player: LobbyPlayer = { id, name, ws, ready: false, isHost };

    if (isHost) this.hostId = id;
    this.players.set(id, player);

    // Send welcome to the new player
    const welcome: WelcomeMessage = {
      type: 'welcome',
      playerId: id,
      config: this.settings,
    };
    this.send(ws, welcome);

    // Notify others
    const joined: PlayerJoinedMessage = { type: 'player_joined', id, name };
    this.broadcastExcept(id, joined);

    // Broadcast updated lobby state
    this.broadcastLobbyState();

    return player;
  }

  removePlayer(id: number): void {
    const player = this.players.get(id);
    if (!player) return;

    this.players.delete(id);

    const left: PlayerLeftMessage = { type: 'player_left', id, name: player.name };
    this.broadcast(left);

    // If host left, assign new host
    if (id === this.hostId && this.players.size > 0) {
      const first = this.players.values().next().value!;
      first.isHost = true;
      this.hostId = first.id;
    }

    this.broadcastLobbyState();
  }

  handleMessage(playerId: number, msg: ClientMessage): void {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (msg.type) {
      case 'ready':
        player.ready = !player.ready;
        this.broadcastLobbyState();
        break;

      case 'game_settings':
        if (player.id !== this.hostId) return;
        this.settings.killTarget = msg.killTarget;
        this.settings.timeLimit = msg.timeLimit;
        this.broadcastLobbyState();
        break;

      case 'start_game':
        if (player.id !== this.hostId) return;
        if (!this.canStart()) return;
        this.onStartCallback?.(
          Array.from(this.players.values()),
          { ...this.settings },
        );
        break;
    }
  }

  canStart(): boolean {
    if (this.players.size < 2) return false;
    for (const p of this.players.values()) {
      if (!p.ready && !p.isHost) return false;
    }
    return true;
  }

  getPlayer(id: number): LobbyPlayer | undefined {
    return this.players.get(id);
  }

  getPlayers(): LobbyPlayer[] {
    return Array.from(this.players.values());
  }

  reset(): void {
    for (const p of this.players.values()) {
      p.ready = false;
    }
    this.broadcastLobbyState();
  }

  private broadcastLobbyState(): void {
    const msg: LobbyStateMessage = {
      type: 'lobby_state',
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        isHost: p.isHost,
      })),
      settings: {
        killTarget: this.settings.killTarget,
        timeLimit: this.settings.timeLimit,
      },
    };
    this.broadcast(msg);
  }

  private broadcast(msg: object): void {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.ws.readyState === p.ws.OPEN) {
        p.ws.send(data);
      }
    }
  }

  private broadcastExcept(excludeId: number, msg: object): void {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.id !== excludeId && p.ws.readyState === p.ws.OPEN) {
        p.ws.send(data);
      }
    }
  }

  private send(ws: WebSocket, msg: object): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
