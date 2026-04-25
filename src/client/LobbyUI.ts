import type { NetClient } from './NetClient';
import type { LobbyStateMessage } from '../shared/protocol';

export class LobbyUI {
  private lobbyEl: HTMLElement;
  private playersEl: HTMLElement;
  private readyBtn: HTMLButtonElement;
  private startBtn: HTMLButtonElement;
  private killTargetEl: HTMLSelectElement;
  private timeLimitEl: HTMLSelectElement;
  private titleEl: HTMLElement;

  private myId = -1;
  private lobbyIpEl: HTMLElement;

  constructor(private net: NetClient) {
    this.lobbyEl = document.getElementById('lobby')!;
    this.playersEl = document.getElementById('lobby-players')!;
    this.readyBtn = document.getElementById('lobby-ready') as HTMLButtonElement;
    this.startBtn = document.getElementById('lobby-start') as HTMLButtonElement;
    this.killTargetEl = document.getElementById('lobby-kill-target') as HTMLSelectElement;
    this.timeLimitEl = document.getElementById('lobby-time-limit') as HTMLSelectElement;
    this.titleEl = document.getElementById('lobby-title')!;
    this.lobbyIpEl = document.getElementById('lobby-ip')!;

    this.readyBtn.addEventListener('click', () => {
      this.net.send({ type: 'ready' });
    });

    this.startBtn.addEventListener('click', () => {
      this.net.send({ type: 'start_game' });
    });

    this.killTargetEl.addEventListener('change', () => {
      this.net.send({
        type: 'game_settings',
        killTarget: parseInt(this.killTargetEl.value),
        timeLimit: parseInt(this.timeLimitEl.value),
      });
    });

    this.timeLimitEl.addEventListener('change', () => {
      this.net.send({
        type: 'game_settings',
        killTarget: parseInt(this.killTargetEl.value),
        timeLimit: parseInt(this.timeLimitEl.value),
      });
    });
  }

  show(myId: number): void {
    this.myId = myId;
    this.lobbyEl.style.display = 'flex';

    // Display connection info for other players to join
    const host = window.location.hostname;
    const port = window.location.port || '3000';
    if (host === 'localhost' || host === '127.0.0.1') {
      this.lobbyIpEl.innerHTML =
        `<span>其他玩家访问终端显示的 LAN IP 加入</span>` +
        `<br><span style="color:#888;font-size:12px">如: http://192.168.x.x:${port}</span>`;
    } else {
      this.lobbyIpEl.innerHTML =
        `<span>其他玩家访问: <b>http://${host}:${port}</b></span>`;
    }
  }

  hide(): void {
    this.lobbyEl.style.display = 'none';
  }

  update(state: LobbyStateMessage): void {
    const me = state.players.find(p => p.id === this.myId);
    const isHost = me?.isHost ?? false;

    this.startBtn.style.display = isHost ? 'inline-block' : 'none';
    this.killTargetEl.disabled = !isHost;
    this.timeLimitEl.disabled = !isHost;

    this.killTargetEl.value = String(state.settings.killTarget);
    this.timeLimitEl.value = String(state.settings.timeLimit);

    // Two-column team display
    const redPlayers = state.players.filter(p => p.team === 'red');
    const bluePlayers = state.players.filter(p => p.team === 'blue');

    const renderPlayer = (p: typeof state.players[0]) => {
      const hostBadge = p.isHost ? ' <span class="lobby-badge-host">(主机)</span>' : '';
      const botBadge = p.isBot ? ' <span class="lobby-badge-bot">[BOT]</span>' : '';
      const readyBadge = p.isBot ? '' : (p.ready ? ' <span class="lobby-ready-mark">✓</span>' : ' <span class="lobby-not-ready">○</span>');
      return `<div class="lobby-player">${p.name}${hostBadge}${botBadge}${readyBadge}</div>`;
    };

    this.playersEl.innerHTML =
      `<div class="lobby-teams">` +
        `<div class="lobby-team lobby-team-red">` +
          `<div class="lobby-team-header" style="color:#cc3333">RED</div>` +
          redPlayers.map(renderPlayer).join('') +
        `</div>` +
        `<div class="lobby-team lobby-team-blue">` +
          `<div class="lobby-team-header" style="color:#3366cc">BLUE</div>` +
          bluePlayers.map(renderPlayer).join('') +
        `</div>` +
      `</div>`;

    this.titleEl.textContent = `房间 (${state.players.length}/8)`;
  }
}
