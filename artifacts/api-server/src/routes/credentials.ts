import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, platformCredentialsTable } from "@workspace/db";
import {
  CreateCredentialBody,
  DeleteCredentialParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { testInstagramLogin } from "../services/instagram-playwright";
import { testFacebookLogin } from "../services/facebook-playwright";
import { testTikTokLogin } from "../services/tiktok-playwright";

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

/**
 * Validate credentials before saving.
 *
 * Strategy:
 *  - Basic field checks (empty, min length, format) — always, instant
 *  - YouTube: quick API token check (fast, reliable)
 *  - TikTok / Instagram / Facebook: format check + real browser login check (Playwright)
 */
async function validateCredential(
  platform: string,
  label: string,         // username / email for browser-login platforms
  accessToken: string    // password for browser-login, OAuth token for YouTube
): Promise<{ valid: boolean; error?: string }> {

  // ── 1. Basic field checks (all platforms) ──────────────────────────────
  if (!label || label.trim().length < 2) {
    return { valid: false, error: "Username / Email bahut chota hai (minimum 2 characters)." };
  }
  if (!accessToken || accessToken.trim().length < 4) {
    return { valid: false, error: "Password / Token bahut chota hai (minimum 4 characters)." };
  }

  // ── 2. Platform-specific checks ────────────────────────────────────────
  switch (platform) {

    case "youtube": {
      // YouTube uses OAuth tokens — validate by calling the API
      try {
        const r = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
          { headers: { Authorization: `Bearer ${accessToken.trim()}` } }
        );
        if (r.status === 401) {
          return { valid: false, error: "YouTube token invalid ya expired hai. Google se dobara connect karo." };
        }
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          return { valid: false, error: `YouTube API error (${r.status}): ${body.slice(0, 120)}` };
        }
      } catch (err: any) {
        return { valid: false, error: `YouTube validation failed: ${err.message}` };
      }
      return { valid: true };
    }

    case "instagram": {
      // If it looks like an official access token, validate it
      if (accessToken.length > 50 && !accessToken.includes(" ")) {
        try {
          const r = await fetch(
            `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken.trim()}`
          );
          const data = await r.json() as any;
          if (!r.ok || data.error) {
            return { valid: false, error: `Instagram token invalid: ${data.error?.message ?? "Token rejected"}` };
          }
          return { valid: true };
        } catch (err: any) {
          return { valid: false, error: `Instagram validation failed: ${err.message}` };
        }
      }
      // Browser-login: basic format checks first
      const emailOrUsernameRegex = /^[a-zA-Z0-9._%+\-@]+$/;
      if (!emailOrUsernameRegex.test(label.trim())) {
        return { valid: false, error: "Instagram username mein invalid characters hain." };
      }
      if (accessToken.trim().length < 6) {
        return { valid: false, error: "Instagram password minimum 6 characters ka hona chahiye." };
      }

      // Real browser-login test
      logger.info({ username: label }, "Running browser-based Instagram login validation...");
      const browserRes = await testInstagramLogin({ username: label.trim(), password: accessToken.trim() });
      if (!browserRes.valid) {
        return browserRes;
      }
      return { valid: true };
    }

    case "facebook": {
      // If it looks like an official access token, validate it
      if (accessToken.length > 50 && !accessToken.includes(" ")) {
        try {
          const r = await fetch(
            `https://graph.facebook.com/me?fields=id,name&access_token=${accessToken.trim()}`
          );
          const data = await r.json() as any;
          if (!r.ok || data.error) {
            return { valid: false, error: `Facebook token invalid: ${data.error?.message ?? "Token rejected"}` };
          }
          return { valid: true };
        } catch (err: any) {
          return { valid: false, error: `Facebook validation failed: ${err.message}` };
        }
      }
      // Browser-login: basic format checks first
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^\+?[\d\s\-().]{7,15}$/;
      if (!emailRegex.test(label.trim()) && !phoneRegex.test(label.trim())) {
        return { valid: false, error: "Facebook mein valid email ya phone number dalo (e.g. user@gmail.com)." };
      }
      if (accessToken.trim().length < 6) {
        return { valid: false, error: "Facebook password minimum 6 characters ka hona chahiye." };
      }

      // Real browser-login test
      logger.info({ username: label }, "Running browser-based Facebook login validation...");
      const browserRes = await testFacebookLogin({ username: label.trim(), password: accessToken.trim() });
      if (!browserRes.valid) {
        return browserRes;
      }
      return { valid: true };
    }

    case "tiktok": {
      // Basic format checks first
      if (label.trim().length < 3) {
        return { valid: false, error: "TikTok username minimum 3 characters ka hona chahiye." };
      }
      if (accessToken.trim().length < 6) {
        return { valid: false, error: "TikTok password minimum 6 characters ka hona chahiye." };
      }
      // No spaces in username/email
      if (label.includes(" ")) {
        return { valid: false, error: "TikTok username mein spaces nahi ho sakte." };
      }

      // Real browser-login test
      logger.info({ username: label }, "Running browser-based TikTok login validation...");
      const browserRes = await testTikTokLogin({ username: label.trim(), password: accessToken.trim() });
      if (!browserRes.valid) {
        return browserRes;
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}

router.post("/credentials", async (req, res): Promise<void> => {
  const parsed = CreateCredentialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request: " + parsed.error.message });
    return;
  }

  const { platform, label, accessToken } = parsed.data;

  // ── Validate before saving ──────────────────────────────────────────────
  logger.info({ platform, label }, "Validating credential...");
  const validation = await validateCredential(platform, label, accessToken);

  if (!validation.valid) {
    logger.warn({ platform, label, error: validation.error }, "Credential validation failed");
    res.status(400).json({ error: validation.error ?? "Invalid credentials. Please check and try again." });
    return;
  }

  // ── Check for exact duplicate (same platform + same label) ──────────────
  const existing = await db
    .select()
    .from(platformCredentialsTable)
    .where(eq(platformCredentialsTable.platform, platform));

  const duplicate = existing.find(
    c => c.label.toLowerCase().trim() === label.toLowerCase().trim()
  );
  if (duplicate) {
    res.status(400).json({
      error: `"${label}" ka account already ${platform} mein connected hai. Delete karke dobara add karo.`,
    });
    return;
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const [credential] = await db
    .insert(platformCredentialsTable)
    .values({ ...parsed.data, isValid: true })
    .returning();

  logger.info({ platform, label, id: credential.id }, "Credential saved");

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
