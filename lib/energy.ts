import { pool } from "@/lib/db";

const MINUTES_SINCE_UPDATE =
  "FLOOR(EXTRACT(EPOCH FROM (NOW() - last_energy_update)) / 60)";

export async function regenerateEnergy(userId: number): Promise<void> {
  await pool.query(
    `UPDATE users SET
       energy = LEAST(5, energy + (${MINUTES_SINCE_UPDATE} / 30)::int),
       last_energy_update = CASE
         WHEN energy + (${MINUTES_SINCE_UPDATE} / 30)::int >= 5 THEN NOW()
         ELSE last_energy_update + ((${MINUTES_SINCE_UPDATE} / 30)::int * 30) * INTERVAL '1 minute'
       END
     WHERE id = $1 AND energy < 5 AND ${MINUTES_SINCE_UPDATE} >= 30`,
    [userId],
  );
}
