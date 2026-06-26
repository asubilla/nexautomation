import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the backend API base URL.
 * - In dev: Vite proxy handles /api → localhost:8081
 * - In production (Cloudflare Pages): uses VITE_API_BASE_URL env var
 *   e.g. set VITE_API_BASE_URL=http://localhost:8081 in .env.production.local
 * For OAuth redirects we MUST point directly at the local backend server
 * because Cloudflare Pages has no backend to handle /api routes.
 */
export function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envUrl) return envUrl.replace(/\/$/, "");
  // In dev mode Vite proxies /api automatically, so empty string = relative
  if (import.meta.env.DEV) return "";
  // Production fallback — local backend default port
  return "http://localhost:80";
}
