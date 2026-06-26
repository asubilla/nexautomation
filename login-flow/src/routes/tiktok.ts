import { Hono } from "hono";
import type { Env } from "../lib/types";
import { saveToken } from "../lib/kv";

const tiktok = new Hono<{ Bindings: Env }>();

// GET /auth/tiktok — redirect to TikTok consent screen
tiktok.get("/", (c) => {
  const { TIKTOK_CLIENT_KEY, FRONTEND_URL } = c.env;
  if (!TIKTOK_CLIENT_KEY) {
    return c.json({ error: "TikTok Client Key not configured" }, 500);
  }

  const workerUrl = new URL(c.req.url);
  const redirectUri = `${workerUrl.origin}/auth/tiktok/callback`;
  const state = crypto.randomUUID();

  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authUrl.searchParams.set("client_key", TIKTOK_CLIENT_KEY);
  authUrl.searchParams.set("scope", "user.info.basic,video.upload,video.publish");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  return c.redirect(authUrl.toString());
});

// GET /auth/tiktok/callback — TikTok redirects here
tiktok.get("/callback", async (c) => {
  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, FRONTEND_URL } = c.env;
  const { code, error } = c.req.query();

  if (error) {
    return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return c.redirect(`${FRONTEND_URL}/credentials?error=no_code`);
  }

  try {
    const workerUrl = new URL(c.req.url);
    const redirectUri = `${workerUrl.origin}/auth/tiktok/callback`;

    // Exchange code for token
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json() as any;

    if (!tokenData.access_token) {
      return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(tokenData.error_description || "token_failed")}`);
    }

    // Get user info
    const profileRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,username,avatar_url", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json() as any;
    const user = profileData?.data?.user;
    const username = user?.username || user?.display_name || "TikTok Account";

    // Save to KV
    await saveToken(c.env.AUTH_TOKENS, "tiktok", {
      platform: "tiktok",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 86400) * 1000,
      username,
      connectedAt: Date.now(),
    });

    const searchParams = new URLSearchParams({
      tiktok_connected: "true",
      username,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || "",
    });

    return c.redirect(`${FRONTEND_URL}/credentials?${searchParams.toString()}`);
  } catch (err: any) {
    return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(err.message)}`);
  }
});

export default tiktok;
