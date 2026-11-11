/**
 * Определяет лигу по рейтингу Elo:
 * Bronze — ниже 1000, Silver — от 1000 до 1399,
 * Gold — от 1400 до 1799, Platinum — от 1800 до 2199,
 * Master — 2200 и выше.
 *
 * @param elo рейтинг игрока Elo
 * @returns название лиги
 */
export function leagueForElo(elo: number): string {
  if (elo < 1000) return "Bronze";
  if (elo < 1400) return "Silver";
  if (elo < 1800) return "Gold";
  if (elo < 2200) return "Platinum";
  return "Master";
}
