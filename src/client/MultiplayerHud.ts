import type { KillMessage, PlayerState, TeamScores } from '../shared/protocol';

export class MultiplayerHud {
  private killFeed: HTMLElement;
  private matchTimer: HTMLElement;
  private leaderboard: HTMLElement;
  private respawnCountdown: HTMLElement;
  private mpHud: HTMLElement;
  private teamScoreBar: HTMLElement;
  private shuffleNotification: HTMLElement;

  constructor() {
    this.mpHud = document.getElementById('mp-hud')!;
    this.killFeed = document.getElementById('kill-feed')!;
    this.matchTimer = document.getElementById('match-timer')!;
    this.leaderboard = document.getElementById('mp-leaderboard')!;
    this.respawnCountdown = document.getElementById('respawn-countdown')!;
    this.teamScoreBar = document.getElementById('team-score-bar')!;
    this.shuffleNotification = document.getElementById('shuffle-notification')!;
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
    entry.innerHTML =
      `<span class="kill-name">${msg.killerName}</span>` +
      ` 击杀了 ` +
      `<span class="kill-name">${msg.victimName}</span>`;
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

  setTeamScores(scores: TeamScores): void {
    this.teamScoreBar.innerHTML =
      `<span class="team-red">RED ${scores.red}</span>` +
      `<span class="team-vs">—</span>` +
      `<span class="team-blue">${scores.blue} BLUE</span>`;
  }

  updateLeaderboard(players: PlayerState[]): void {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    this.leaderboard.innerHTML =
      `<div class="lb-header">排行榜</div>` +
      sorted.map((p, i) => {
        const color = p.team === 'red' ? '#ff6666' : '#66aaff';
        const botTag = p.isBot ? '<span class="lb-bot">[BOT]</span> ' : '';
        return `<div class="lb-row">` +
          `<span class="lb-rank">${i + 1}</span>` +
          `<span class="lb-name" style="color:${color}">${botTag}${p.name}</span>` +
          `<span class="lb-score">${p.score}</span>` +
          `</div>`;
      }).join('');
  }

  showRespawnCountdown(seconds: number): void {
    this.respawnCountdown.style.display = 'flex';
    this.respawnCountdown.textContent = `复活中... ${Math.ceil(seconds)}`;
  }

  hideRespawnCountdown(): void {
    this.respawnCountdown.style.display = 'none';
  }

  showShuffleNotification(): void {
    this.shuffleNotification.textContent = '阵营已洗牌！';
    this.shuffleNotification.style.display = 'block';
    this.shuffleNotification.style.opacity = '1';
    setTimeout(() => {
      this.shuffleNotification.style.opacity = '0';
      setTimeout(() => {
        this.shuffleNotification.style.display = 'none';
      }, 500);
    }, 3000);
  }
}
