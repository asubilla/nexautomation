import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, monitoredAccountsTable } from "@workspace/db";
import {
  CreateAccountBody,
  GetAccountParams,
  UpdateAccountParams,
  UpdateAccountBody,
  DeleteAccountParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/accounts", async (_req, res): Promise<void> => {
  const accounts = await db
    .select()
    .from(monitoredAccountsTable)
    .orderBy(monitoredAccountsTable.createdAt);
  res.json(accounts.map(a => ({
    ...a,
    lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null,
    lastVideoAt: a.lastVideoAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  })));
});

router.post("/accounts", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [account] = await db
    .insert(monitoredAccountsTable)
    .values({ ...parsed.data, enabled: parsed.data.enabled ?? true })
    .returning();
  res.status(201).json({
    ...account,
    lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
    lastVideoAt: account.lastVideoAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
  });
});

router.get("/accounts/:id", async (req, res): Promise<void> => {
  const params = GetAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [account] = await db
    .select()
    .from(monitoredAccountsTable)
    .where(eq(monitoredAccountsTable.id, params.data.id));
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json({
    ...account,
    lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
    lastVideoAt: account.lastVideoAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
  });
});

router.patch("/accounts/:id", async (req, res): Promise<void> => {
  const params = UpdateAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [account] = await db
    .update(monitoredAccountsTable)
    .set(parsed.data)
    .where(eq(monitoredAccountsTable.id, params.data.id))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json({
    ...account,
    lastCheckedAt: account.lastCheckedAt?.toISOString() ?? null,
    lastVideoAt: account.lastVideoAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
  });
});

router.delete("/accounts/:id", async (req, res): Promise<void> => {
  const params = DeleteAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(monitoredAccountsTable)
    .where(eq(monitoredAccountsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
