import type { WebSocket } from 'ws';

export class GameServer {
  onConnection(ws: WebSocket): void {
    ws.on('message', (_data: Buffer) => {
      // Stub — full implementation in Task 7
    });
    ws.on('close', () => {
      // Stub — full implementation in Task 7
    });
  }
}
