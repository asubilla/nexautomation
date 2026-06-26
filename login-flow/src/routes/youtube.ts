import { Hono } from "hono";
import type { Env } from "../lib/types";
import { saveToken } from "../lib/kv";

const youtube = new Hono<{ Bindings: Env }>();

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
  "openid",
  "email",
  "profile",
].join(" ");

// GET /auth/youtube — redirect to Google consent screen
youtube.get("/", (c) => {
  const { GOOGLE_CLIENT_ID } = c.env;
  if (!GOOGLE_CLIENT_ID) return c.json({ error: "Google Client ID not configured" }, 500);

  const workerUrl = new URL(c.req.url);
  const redirectUri = `${workerUrl.origin}/auth/youtube/callback`;
  const state = crypto.randomUUID();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return c.redirect(authUrl.toString());
});

// GET /auth/youtube/callback
youtube.get("/callback", async (c) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL } = c.env;
  const { code, error } = c.req.query();

  if (error) return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(error)}`);
  if (!code) return c.redirect(`${FRONTEND_URL}/credentials?error=no_code`);

  try {
    const workerUrl = new URL(c.req.url);
    const redirectUri = `${workerUrl.origin}/auth/youtube/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json() as any;

    if (!tokenData.access_token) {
      return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(tokenData.error_description || "token_failed")}`);
    }

    // Get channel info
    const channelRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const channelData = await channelRes.json() as any;
    const channel = channelData?.items?.[0];
    const username = channel?.snippet?.title || "YouTube Channel";

    await saveToken(c.env.AUTH_TOKENS, "youtube", {
      platform: "youtube",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      username,
      connectedAt: Date.now(),
    });

    const searchParams = new URLSearchParams({
      youtube_connected: "true",
      username,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || "",
    });

    return c.redirect(`${FRONTEND_URL}/credentials?${searchParams.toString()}`);
  } catch (err: any) {
    return c.redirect(`${FRONTEND_URL}/credentials?error=${encodeURIComponent(err.message)}`);
  }
});

export default youtube;
