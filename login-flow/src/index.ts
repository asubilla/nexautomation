import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/types";
import { getToken, getAllTokens, deleteToken } from "./lib/kv";
import tiktok from "./routes/tiktok";
import facebook from "./routes/facebook";
import instagram from "./routes/instagram";
import youtube from "./routes/youtube";
import upload from "./routes/upload";

const app = new Hono<{ Bindings: Env }>();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use("*", cors({
  origin: (origin, c) => {
    const allowed = [c.env.FRONTEND_URL, "https://nexautomation.pages.dev"];
    return allowed.includes(origin) ? origin : allowed[0];
  },
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// ── File Serving Route (for Instagram and general download/check) ─────────────
app.get("/files/:filename", async (c) => {
  try {
    const filename = c.req.param("filename");
    const object = await c.env.NEX_UPLOADS.get(filename);
    if (!object) {
      return c.text("File not found", 404);
    }
    c.header("Content-Type", object.httpMetadata?.contentType || "video/mp4");
    c.header("Content-Length", String(object.size));
    return c.body(object.body);
  } catch (err: any) {
    return c.text(`Error retrieving file: ${err.message}`, 500);
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (c) => c.json({
  name: "Nex Automation OAuth & Uploader Worker",
  version: "1.1.0",
  routes: [
    "GET /auth/tiktok",
    "GET /auth/tiktok/callback",
    "GET /auth/facebook",
    "GET /auth/facebook/callback",
    "GET /auth/instagram",
    "GET /auth/instagram/callback",
    "GET /auth/youtube",
    "GET /auth/youtube/callback",
    "POST /upload/file",
    "DELETE /upload/file/:filename",
    "GET /files/:filename",
    "POST /upload/youtube",
    "POST /upload/tiktok",
    "POST /upload/facebook",
    "POST /upload/instagram",
    "GET /tokens/:platform",
    "GET /tokens",
    "DELETE /tokens/:platform",
  ],
}));

// ── OAuth & Upload Routes ─────────────────────────────────────────────────────
app.route("/auth/tiktok", tiktok);
app.route("/auth/facebook", facebook);
app.route("/auth/instagram", instagram);
app.route("/auth/youtube", youtube);
app.route("/upload", upload);

// ── Token API (called by frontend) ───────────────────────────────────────────

// GET /tokens — list all connected platforms
app.get("/tokens", async (c) => {
  const all = await getAllTokens(c.env.AUTH_TOKENS);
  // Return sanitized data (no raw access tokens to frontend)
  const safe = Object.fromEntries(
    Object.entries(all).map(([platform, data]) => [
      platform,
      {
        platform: data.platform,
        username: data.username,
        pageName: data.pageName,
        pageId: data.pageId,
        connectedAt: data.connectedAt,
        expiresAt: data.expiresAt,
        isValid: !data.expiresAt || data.expiresAt > Date.now(),
      },
    ])
  );
  return c.json(safe);
});

// GET /tokens/:platform — check single platform status
app.get("/tokens/:platform", async (c) => {
  const platform = c.req.param("platform");
  const data = await getToken(c.env.AUTH_TOKENS, platform);
  if (!data) return c.json({ connected: false }, 404);
  return c.json({
    connected: true,
    platform: data.platform,
    username: data.username,
    pageName: data.pageName,
    pageId: data.pageId,
    connectedAt: data.connectedAt,
    expiresAt: data.expiresAt,
    isValid: !data.expiresAt || data.expiresAt > Date.now(),
  });
});

// DELETE /tokens/:platform — disconnect platform
app.delete("/tokens/:platform", async (c) => {
  const platform = c.req.param("platform");
  await deleteToken(c.env.AUTH_TOKENS, platform);
  return c.json({ success: true, message: `${platform} disconnected` });
});

export default app;
