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

function formatAccount(a: typeof monitoredAccountsTable.$inferSelect) {
  let uploadTargets: string[] = [];
  try {
    uploadTargets = JSON.parse(a.uploadTargets ?? "[]");
  } catch {
    uploadTargets = [];
  }
  return {
    ...a,
    uploadTargets,
    lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null,
    lastVideoAt: a.lastVideoAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/accounts", async (_req, res): Promise<void> => {
  const accounts = await db
    .select()
    .from(monitoredAccountsTable)
    .orderBy(monitoredAccountsTable.createdAt);
  res.json(accounts.map(formatAccount));
});

router.post("/accounts", async (req, res): Promise<void> => {
  const body = req.body ?? {};

  const uploadTargets: string[] = Array.isArray(body.uploadTargets) ? body.uploadTargets : [];
  const bodyForParsing = { ...body, uploadTargets: undefined };

  const parsed = CreateAccountBody.safeParse(bodyForParsing);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [account] = await db
    .insert(monitoredAccountsTable)
    .values({
      ...parsed.data,
      enabled: parsed.data.enabled ?? true,
      uploadTargets: JSON.stringify(uploadTargets),
    })
    .returning();
  res.status(201).json(formatAccount(account));
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
  res.json(formatAccount(account));
});

router.patch("/accounts/:id", async (req, res): Promise<void> => {
  const params = UpdateAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = req.body ?? {};
  const uploadTargets: string[] | undefined = Array.isArray(body.uploadTargets) ? body.uploadTargets : undefined;
  const bodyForParsing = { ...body, uploadTargets: undefined };

  const parsed = UpdateAccountBody.safeParse(bodyForParsing);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updatePayload: Record<string, unknown> = { ...parsed.data };
  if (uploadTargets !== undefined) {
    updatePayload["uploadTargets"] = JSON.stringify(uploadTargets);
  }

  const [account] = await db
    .update(monitoredAccountsTable)
    .set(updatePayload as any)
    .where(eq(monitoredAccountsTable.id, params.data.id))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json(formatAccount(account));
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
