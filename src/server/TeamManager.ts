import type { Team } from '../shared/protocol';

export class TeamManager {
  private assignments = new Map<number, Team>();

  assign(playerId: number): Team {
    let redCount = 0, blueCount = 0;
    for (const t of this.assignments.values()) {
      if (t === 'red') redCount++; else blueCount++;
    }
    const team: Team = redCount <= blueCount ? 'red' : 'blue';
    this.assignments.set(playerId, team);
    return team;
  }

  remove(playerId: number): void {
    this.assignments.delete(playerId);
  }

  shuffle(playerIds: number[], rng: () => number): void {
    // Fisher-Yates shuffle
    const ids = [...playerIds];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    // First half red, second half blue
    const half = Math.ceil(ids.length / 2);
    for (let i = 0; i < ids.length; i++) {
      this.assignments.set(ids[i]!, i < half ? 'red' : 'blue');
    }
  }

  getTeam(playerId: number): Team {
    return this.assignments.get(playerId) ?? 'red';
  }

  sameTeam(a: number, b: number): boolean {
    return this.getTeam(a) === this.getTeam(b);
  }

  getPlayersByTeam(team: Team): number[] {
    const result: number[] = [];
    for (const [id, t] of this.assignments) {
      if (t === team) result.push(id);
    }
    return result;
  }

  clear(): void {
    this.assignments.clear();
  }
}
