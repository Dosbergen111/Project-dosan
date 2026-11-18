import type { BotLevelId } from "@/lib/chess/types";

export type BotLevel = {
  id: BotLevelId;
  label: string;
  depth: number;
  skill: number;
  randomMoveRatio: number;
  elo: number;
  fallbackDepth: number;
};

export const BOT_LEVELS: readonly BotLevel[] = [
  { id: "beginner", label: "Новичок", depth: 2, skill: 2, randomMoveRatio: 0.3, elo: 800, fallbackDepth: 1 },
  { id: "intermediate", label: "Средний", depth: 6, skill: 6, randomMoveRatio: 0, elo: 1200, fallbackDepth: 2 },
  { id: "master", label: "Мастер", depth: 12, skill: 12, randomMoveRatio: 0, elo: 1800, fallbackDepth: 3 },
  { id: "grandmaster", label: "Гроссмейстер", depth: 18, skill: 20, randomMoveRatio: 0, elo: 2200, fallbackDepth: 4 },
];

export function levelByDifficulty(difficulty: number): BotLevel {
  if (difficulty <= 2) return BOT_LEVELS[0];
  if (difficulty <= 5) return BOT_LEVELS[1];
  if (difficulty <= 10) return BOT_LEVELS[2];
  return BOT_LEVELS[3];
}
