import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import { GameServer } from './GameServer';

const HTTP_PORT = 3000;
const WS_PORT = 3001;

// ─── Resolve dist directory ───
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distCandidates = [
  join(__dirname, '../../dist'),
  join(__dirname, '../dist'),
];
const distDir = distCandidates.find(d => existsSync(d)) ?? distCandidates[0]!;

// ─── MIME types ───
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.map': 'application/json',
};

// ─── HTTP static file server ───
const httpServer = createServer((req, res) => {
  let url = req.url ?? '/';
  if (url === '/') url = '/index.html';

  const filePath = join(distDir, url);
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const mime = MIME[ext] ?? 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  const nets = getLocalIPs();
  console.log(`\n  🎮 Doom FPS Server`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  HTTP: http://localhost:${HTTP_PORT}`);
  for (const ip of nets) {
    console.log(`  LAN:  http://${ip}:${HTTP_PORT}`);
  }
  console.log(`  WS:   ws://0.0.0.0:${WS_PORT}`);
  console.log(`  ─────────────────────────────────\n`);
});

// ─── WebSocket game server ───
const wss = new WebSocketServer({ port: WS_PORT });
const gameServer = new GameServer();

wss.on('connection', (ws) => {
  gameServer.onConnection(ws);
});

// ─── Utility: get local network IPs ───
function getLocalIPs(): string[] {
  const nets = networkInterfaces();
  const results: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}
