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

// GET /api/accounts/resolve?url=... — URL se channel name/handle resolve karo
router.get("/accounts/resolve", async (req, res): Promise<void> => {
  const url = req.query.url as string;
  if (!url) { res.status(400).json({ error: "url required" }); return; }

  try {
    const resolved = await resolveChannelInfo(url);
    res.json(resolved);
  } catch (err: any) {
    res.status(200).json({ username: extractFallbackUsername(url), handle: null, name: null });
  }
});

async function resolveChannelInfo(url: string): Promise<{ username: string; handle: string | null; name: string | null }> {
  const fallback = extractFallbackUsername(url);

  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.replace("www.", "");
    const pathname = u.pathname.replace(/\/$/, "");

    // YouTube channel ID (UCxxx...)
    const channelIdMatch = pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (host === "youtube.com" && channelIdMatch) {
      const channelId = channelIdMatch[1];
      // Try YouTube oEmbed (no API key needed)
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/channel/${channelId}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json() as { author_name?: string };
        const name = data.author_name ?? null;
        return { username: name ?? fallback, handle: name, name };
      }
    }

    // YouTube @handle
    const handleMatch = pathname.match(/\/@([^/]+)/);
    if (host === "youtube.com" && handleMatch) {
      const handle = handleMatch[1];
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/@${handle}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json() as { author_name?: string };
        const name = data.author_name ?? handle;
        return { username: name, handle: `@${handle}`, name };
      }
      return { username: handle, handle: `@${handle}`, name: null };
    }

    // TikTok @username
    if (host === "tiktok.com") {
      const m = pathname.match(/\/@([^/]+)/);
      if (m) return { username: m[1], handle: `@${m[1]}`, name: null };
    }

    // Instagram
    if (host === "instagram.com") {
      const m = pathname.match(/^\/([^/]+)/);
      if (m && !["p","reel","stories","explore","accounts"].includes(m[1])) {
        return { username: m[1], handle: `@${m[1]}`, name: null };
      }
    }

    // Facebook
    if (host === "facebook.com") {
      const id = u.searchParams.get("id");
      if (id) return { username: `id_${id}`, handle: null, name: null };
      const m = pathname.match(/^\/([^/]+)/);
      if (m && !["pages","groups","events","watch","profile.php"].includes(m[1])) {
        return { username: m[1], handle: m[1], name: null };
      }
    }
  } catch { /* ignore — return fallback */ }

  return { username: fallback, handle: null, name: null };
}

function extractFallbackUsername(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const pathname = u.pathname.replace(/\/$/, "");
    const parts = pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "channel";
  } catch { return "channel"; }
}

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

function sanitizeUrl(raw: string): string {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    // Remove tracking/extra params
    ["sk", "ref", "fref", "locale", "locale2", "refsrc", "_rdr",
     "igsh", "igshid", "_t", "_r"].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return raw;
  }
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
      url: sanitizeUrl(parsed.data.url),
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
