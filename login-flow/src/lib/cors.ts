import type { Context } from "hono";
import type { Env } from "./types";

export function corsHeaders(frontendUrl: string) {
  return {
    "Access-Control-Allow-Origin": frontendUrl,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function addCors(c: Context<{ Bindings: Env }>, res: Response): Response {
  const headers = corsHeaders(c.env.FRONTEND_URL);
  const newHeaders = new Headers(res.headers);
  for (const [k, v] of Object.entries(headers)) newHeaders.set(k, v);
  return new Response(res.body, { status: res.status, headers: newHeaders });
}
