import type { KillMessage, PlayerState } from '../shared/protocol';

export class MultiplayerHud {
  private killFeed: HTMLElement;
  private matchTimer: HTMLElement;
  private scoreboard: HTMLElement;
  private respawnCountdown: HTMLElement;
  private mpHud: HTMLElement;

  constructor() {
    this.mpHud = document.getElementById('mp-hud')!;
    this.killFeed = document.getElementById('kill-feed')!;
    this.matchTimer = document.getElementById('match-timer')!;
    this.scoreboard = document.getElementById('scoreboard')!;
    this.respawnCountdown = document.getElementById('respawn-countdown')!;
  }

  show(): void {
    this.mpHud.style.display = 'block';
  }

  hide(): void {
    this.mpHud.style.display = 'none';
  }

  addKillFeedEntry(msg: KillMessage): void {
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.textContent = `${msg.killerName} 击杀了 ${msg.victimName}`;
    this.killFeed.appendChild(entry);

    setTimeout(() => entry.remove(), 5000);

    while (this.killFeed.children.length > 5) {
      this.killFeed.firstChild?.remove();
    }
  }

  setTimeRemaining(seconds: number): void {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    this.matchTimer.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  }

  showScoreboard(players: PlayerState[]): void {
    const sorted = [...players].sort((a, b) => b.kills - a.kills);
    this.scoreboard.innerHTML = sorted.map(p =>
      `<div class="sb-row"><span>${p.name}</span><span>${p.kills} / ${p.deaths}</span></div>`
    ).join('');
    this.scoreboard.style.display = 'block';
  }

  hideScoreboard(): void {
    this.scoreboard.style.display = 'none';
  }

  showRespawnCountdown(seconds: number): void {
    this.respawnCountdown.style.display = 'flex';
    this.respawnCountdown.textContent = `复活中... ${Math.ceil(seconds)}`;
  }

  hideRespawnCountdown(): void {
    this.respawnCountdown.style.display = 'none';
  }
}
