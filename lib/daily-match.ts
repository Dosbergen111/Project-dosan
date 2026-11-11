import { pool } from "@/lib/db";

let tableReady: Promise<void> | null = null;

export function ensureDailyMatchesTable(): Promise<void> {
  if (!tableReady) {
    tableReady = pool.query(
      `CREATE TABLE IF NOT EXISTS daily_matches (
         user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         match_date DATE NOT NULL,
         result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
         elo INTEGER NOT NULL,
         elo_change INTEGER NOT NULL,
         league TEXT NOT NULL,
         PRIMARY KEY (user_id, match_date)
       )`,
    ).then(() => undefined).catch((error: unknown) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}
