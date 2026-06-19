import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, platformCredentialsTable } from "@workspace/db";
import {
  CreateCredentialBody,
  DeleteCredentialParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/credentials", async (_req, res): Promise<void> => {
  const credentials = await db
    .select()
    .from(platformCredentialsTable)
    .orderBy(platformCredentialsTable.connectedAt);
  res.json(credentials.map(c => ({
    id: c.id,
    platform: c.platform,
    label: c.label,
    isValid: c.isValid,
    connectedAt: c.connectedAt.toISOString(),
  })));
});

router.post("/credentials", async (req, res): Promise<void> => {
  const parsed = CreateCredentialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [credential] = await db
    .insert(platformCredentialsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json({
    id: credential.id,
    platform: credential.platform,
    label: credential.label,
    isValid: credential.isValid,
    connectedAt: credential.connectedAt.toISOString(),
  });
});

router.delete("/credentials/:id", async (req, res): Promise<void> => {
  const params = DeleteCredentialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(platformCredentialsTable)
    .where(eq(platformCredentialsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
