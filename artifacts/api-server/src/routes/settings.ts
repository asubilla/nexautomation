import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { setSchedulerInterval } from "../services/scheduler";

const router: IRouter = Router();

const DEFAULTS: Record<string, string> = {
  check_interval_ms: String(15 * 60 * 1000),
};

router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  res.json(map);
});

router.patch("/settings", async (req, res): Promise<void> => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") {
    res.status(400).json({ error: "Body must be a key-value object" });
    return;
  }

  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(settingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
  }

  if (updates["check_interval_ms"]) {
    const ms = parseInt(updates["check_interval_ms"], 10);
    if (!isNaN(ms) && ms > 0) {
      setSchedulerInterval(ms);
    }
  }

  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  res.json(map);
});

export default router;
