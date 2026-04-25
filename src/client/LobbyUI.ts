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

  constructor(private net: NetClient) {
    this.lobbyEl = document.getElementById('lobby')!;
    this.playersEl = document.getElementById('lobby-players')!;
    this.readyBtn = document.getElementById('lobby-ready') as HTMLButtonElement;
    this.startBtn = document.getElementById('lobby-start') as HTMLButtonElement;
    this.killTargetEl = document.getElementById('lobby-kill-target') as HTMLSelectElement;
    this.timeLimitEl = document.getElementById('lobby-time-limit') as HTMLSelectElement;
    this.titleEl = document.getElementById('lobby-title')!;

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

    this.playersEl.innerHTML = state.players.map(p => {
      const hostBadge = p.isHost ? ' (主机)' : '';
      const readyBadge = p.ready ? ' ✓ 就绪' : ' ○ 未就绪';
      return `<div class="lobby-player">${p.name}${hostBadge}${readyBadge}</div>`;
    }).join('');

    this.titleEl.textContent = `房间 (${state.players.length}/8)`;
  }
}
