import { Router, type IRouter } from "express";
import { db, platformCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CLIENT_KEY = (process.env.TIKTOK_CLIENT_KEY ?? "").trim();
const CLIENT_SECRET = (process.env.TIKTOK_CLIENT_SECRET ?? "").trim();

// GET /api/auth/tiktok — redirect to TikTok consent screen
router.get("/auth/tiktok", (req, res): void => {
  if (!CLIENT_KEY || !CLIENT_SECRET) {
    res.status(500).json({ error: "TikTok Client Key or Client Secret not configured in .env" });
    return;
  }

  const host = req.get("host") ? `${req.protocol}://${req.get("host")}` : "http://localhost:8081";
  const redirectUri = `${host}/api/auth/tiktok/callback`;
  const state = Math.random().toString(36).substring(2, 15);

  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authUrl.searchParams.set("client_key", CLIENT_KEY);
  authUrl.searchParams.set("scope", "user.info.basic,video.upload");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  logger.info({ redirectUri, authUrl: authUrl.toString() }, "TikTok OAuth redirect");
  res.redirect(authUrl.toString());
});

// GET /api/auth/tiktok/callback — TikTok redirects here after authorization
router.get("/auth/tiktok/callback", async (req, res): Promise<void> => {
  const { code, error, state } = req.query as { code?: string; error?: string; state?: string };
  const host = req.get("host") ? `${req.protocol}://${req.get("host")}` : "http://localhost:8081";

  if (error) {
    logger.warn({ error }, "TikTok OAuth denied");
    res.redirect(`${host}/credentials?error=${encodeURIComponent(error as string)}`);
    return;
  }

  if (!code) {
    res.status(400).json({ error: "No authorization code received" });
    return;
  }

  try {
    const redirectUri = `${host}/api/auth/tiktok/callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json() as any;

    if (tokenData.error || !tokenData.access_token) {
      logger.error({ tokenData }, "TikTok token exchange failed");
      res.redirect(`${host}/credentials?error=${encodeURIComponent(tokenData.error_description || "Token exchange failed")}`);
      return;
    }

    // Fetch user profile info to get the display name or username
    const profileRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,username,avatar_url", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const profileData = await profileRes.json() as any;
    let label = "TikTok Account";
    if (profileData.data?.user) {
      const user = profileData.data.user;
      label = user.username || user.display_name || "TikTok Account";
    }

    // Upsert into platform_credentials
    const existing = await db
      .select()
      .from(platformCredentialsTable)
      .where(eq(platformCredentialsTable.platform, "tiktok"))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(platformCredentialsTable)
        .set({
          label,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          clientId: CLIENT_KEY,
          clientSecret: CLIENT_SECRET,
          isValid: true,
          connectedAt: new Date(),
        })
        .where(eq(platformCredentialsTable.platform, "tiktok"));
    } else {
      await db.insert(platformCredentialsTable).values({
        platform: "tiktok",
        label,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        clientId: CLIENT_KEY,
        clientSecret: CLIENT_SECRET,
        isValid: true,
      });
    }

    logger.info({ label }, "TikTok account connected via official API");
    res.redirect(`${host}/credentials?tiktok_connected=true`);
  } catch (err: any) {
    logger.error({ err }, "TikTok OAuth callback error");
    res.redirect(`${host}/credentials?tiktok_error=${encodeURIComponent(err.message)}`);
  }
});

export default router;
