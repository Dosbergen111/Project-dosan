export function calculateExpectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));
}

export function calculateEloChange(
  playerElo: number,
  opponentElo: number,
  result: "win" | "loss" | "draw",
  kFactor = 32,
): number {
  const score = result === "win" ? 1 : result === "loss" ? 0 : 0.5;
  return Math.round(kFactor * (score - calculateExpectedScore(playerElo, opponentElo)));
}
