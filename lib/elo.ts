export function leagueForElo(elo: number): string {
  if (elo < 1000) return "Bronze";
  if (elo < 1400) return "Silver";
  if (elo < 1800) return "Gold";
  if (elo < 2200) return "Platinum";
  return "Master";
}
