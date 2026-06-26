import { Router, type IRouter } from "express";
import { google } from "googleapis";
import { db, platformCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CLIENT_ID = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
const CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
const REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:8081/api/auth/youtube/callback").trim();

function getOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

// GET /api/auth/youtube — redirect to Google consent screen
router.get("/auth/youtube", (_req, res): void => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    res.status(500).json({ error: "Google OAuth not configured" });
    return;
  }

  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });

  logger.info({ redirectUri: REDIRECT_URI, authUrl: url.slice(0, 200) }, "YouTube OAuth redirect");
  res.redirect(url);
});

// GET /api/auth/youtube/callback — Google redirects here after login
router.get("/auth/youtube/callback", async (req, res): Promise<void> => {
  const { code, error } = req.query as { code?: string; error?: string };

  if (error) {
    logger.warn({ error }, "YouTube OAuth denied");
    res.redirect(`http://localhost:8081/credentials?error=${encodeURIComponent(error as string)}`);
    return;
  }

  if (!code) {
    res.status(400).json({ error: "No authorization code received" });
    return;
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // Get user profile for label
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    const label = profile.name ?? profile.email ?? "YouTube Account";
    const accessToken = JSON.stringify(tokens); // store full token object (includes refresh_token)

    // Upsert — agar pehle se connected hai toh update karo
    const existing = await db
      .select()
      .from(platformCredentialsTable)
      .where(eq(platformCredentialsTable.platform, "youtube"))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(platformCredentialsTable)
        .set({ label, accessToken, isValid: true, connectedAt: new Date() })
        .where(eq(platformCredentialsTable.platform, "youtube"));
    } else {
      await db.insert(platformCredentialsTable).values({
        platform: "youtube",
        label,
        accessToken,
        isValid: true,
      });
    }

    logger.info({ label }, "YouTube account connected via OAuth");
    res.redirect("http://localhost:8081/clipping?youtube_connected=true");
  } catch (err: any) {
    logger.error({ err }, "YouTube OAuth callback error");
    res.redirect(`http://localhost:8081/clipping?youtube_error=${encodeURIComponent(err.message)}`);
  }
});

export default router;
