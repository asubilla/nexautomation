import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, statSync } from "fs";
import path from "path";
import os from "os";
import { logger } from "../lib/logger";
import { scrapeFacebookVideos } from "./facebook-scraper";
import { db, platformCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const execFileAsync = promisify(execFile);

// Cross-platform yt-dlp
function getYtDlpBin(): string {
  if (os.platform() === "win32") return "python";
  const replitPath = "/home/runner/workspace/.pythonlibs/bin/yt-dlp";
  if (existsSync(replitPath)) return replitPath;
  return "yt-dlp";
}

const IS_WINDOWS = os.platform() === "win32";
const YTDLP_BIN = getYtDlpBin();

// Windows pe E: drive use karo — C: full ho sakta hai
const DOWNLOAD_DIR = IS_WINDOWS ? "E:\\nex-downloads" : "/tmp/nex-downloads";

if (!existsSync(DOWNLOAD_DIR)) {
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function buildArgs(ytdlpArgs: string[]): { bin: string; args: string[] } {
  if (IS_WINDOWS) {
    return { bin: "python", args: ["-m", "yt_dlp", ...ytdlpArgs] };
  }
  return { bin: YTDLP_BIN, args: ytdlpArgs };
}

// Playwright bhi E: drive pe hai — set before any imports use it
if (IS_WINDOWS) {
  process.env["PLAYWRIGHT_BROWSERS_PATH"] = "E:\\ms-playwright";
}

/**
 * Facebook ke liye URL ko videos tab pe redirect karta hai
 * Profile URL → /videos URL
 */
export function normalizePlatformUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace("www.", "");

    if (host === "facebook.com") {
      const pathname = u.pathname.replace(/\/$/, "");
      // Already videos tab
      if (pathname.endsWith("/videos") || pathname.endsWith("/reels")) return url;
      // profile.php?id=XXX → profile.php?id=XXX/videos
      if (pathname === "/profile.php") {
        const id = u.searchParams.get("id");
        if (id) return `https://www.facebook.com/${id}/videos`;
      }
      // /pagename → /pagename/videos
      if (pathname && pathname !== "/") {
        return `https://www.facebook.com${pathname}/videos`;
      }
    }

    return url;
  } catch {
    return url;
  }
}

/**
 * Cookies file path — workspace mein store karo
 */
const COOKIES_DIR = path.join(os.tmpdir(), "nex-cookies");
if (!existsSync(COOKIES_DIR)) mkdirSync(COOKIES_DIR, { recursive: true });

// Workspace cookies bhi check karo (user ne manually rakhi hain)
const WORKSPACE_ROOT = path.join(path.dirname(path.dirname(path.dirname(path.dirname(
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
)))));

function getCookiesFile(platform: string): string | null {
  // Check workspace first (e.g. e:\Nex Automation\facebook-cookies.txt)
  const workspaceCookies = path.join(WORKSPACE_ROOT, `${platform}-cookies.txt`);
  if (existsSync(workspaceCookies)) return workspaceCookies;
  // Then temp dir
  const tempCookies = path.join(COOKIES_DIR, `${platform}-cookies.txt`);
  if (existsSync(tempCookies)) return tempCookies;
  return null;
}

/**
 * Get cookies args for platforms that need login.
 * Priority: workspace cookies file → temp cookies file → DB credentials (written as temp cookies)
 */
async function getCookiesArgsAsync(url: string): Promise<string[]> {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    const platform = host.split(".")[0]; // facebook, instagram, tiktok
    const cookiesFile = getCookiesFile(platform);
    if (cookiesFile) {
      logger.debug({ platform, cookiesFile }, "Using cookies file");
      return ["--cookies", cookiesFile];
    }

    // Try DB credentials (saved from campaign dialog Step 2)
    try {
      const [cred] = await db
        .select()
        .from(platformCredentialsTable)
        .where(eq(platformCredentialsTable.platform, `${platform}_source`))
        .limit(1);

      if (cred?.accessToken) {
        // Credentials exist — use yt-dlp --username --password
        logger.info({ platform }, "Using DB source credentials for download");
        return ["--username", cred.label, "--password", cred.accessToken];
      }
    } catch {
      // DB unavailable — continue without credentials
    }
  } catch {}
  return [];
}

// Sync version for backwards compat (returns empty if no file)
function getCookiesArgs(url: string): string[] {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    const platform = host.split(".")[0];
    const cookiesFile = getCookiesFile(platform);
    if (cookiesFile) return ["--cookies", cookiesFile];
  } catch {}
  return [];
}

export interface VideoInfo {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  uploadDate?: string;
}

export interface DownloadResult {
  filePath: string;
  fileSizeBytes: number;
  title: string;
  thumbnailUrl?: string;
}

export async function getLatestVideos(channelUrl: string, count = 5): Promise<VideoInfo[]> {
  // Facebook needs special browser-based scraping
  try {
    const host = new URL(channelUrl).hostname.replace("www.", "");
    if (host === "facebook.com") {
      const cookiesFile = getCookiesFile("facebook");
      const scraped = await scrapeFacebookVideos(channelUrl, count, cookiesFile ?? undefined);
      return scraped.map(v => ({
        id: v.id,
        title: v.title,
        url: v.url,
        thumbnailUrl: v.thumbnailUrl,
      }));
    }
  } catch {}

  // Normalize URL (e.g. Facebook profile → /videos tab)
  const normalizedUrl = normalizePlatformUrl(channelUrl);
  // Use async version to also check DB credentials
  const cookiesArgs = await getCookiesArgsAsync(normalizedUrl);

  try {
    const ytdlpArgs = [
      "--flat-playlist",
      "--playlist-end", String(count),
      "-J",
      "--no-warnings",
      "--quiet",
      ...cookiesArgs,
      normalizedUrl,
    ];

    const { bin, args } = buildArgs(ytdlpArgs);
    const { stdout } = await execFileAsync(bin, args, { timeout: 60_000 });
    const data = JSON.parse(stdout);

    const entries: VideoInfo[] = [];

    if (data.entries) {
      for (const entry of data.entries) {
        if (!entry.id) continue;
        entries.push({
          id: entry.id,
          title: entry.title ?? entry.id,
          url: entry.webpage_url ?? entry.url ?? `https://www.youtube.com/watch?v=${entry.id}`,
          thumbnailUrl: entry.thumbnail ?? entry.thumbnails?.[0]?.url,
          duration: entry.duration,
          uploadDate: entry.upload_date,
        });
      }
    } else if (data.id) {
      entries.push({
        id: data.id,
        title: data.title ?? data.id,
        url: data.webpage_url ?? channelUrl,
        thumbnailUrl: data.thumbnail ?? data.thumbnails?.[0]?.url,
        duration: data.duration,
        uploadDate: data.upload_date,
      });
    }

    return entries;
  } catch (err: any) {
    throw new Error(`yt-dlp playlist check failed: ${err.message}`);
  }
}

export async function downloadVideo(videoUrl: string, videoId: string): Promise<DownloadResult> {
  const outputTemplate = path.join(DOWNLOAD_DIR, `${videoId}.%(ext)s`);

  const infoYtArgs = [
    "--no-warnings",
    "--quiet",
    "-J",
    videoUrl,
  ];

  let title = videoId;
  let thumbnailUrl: string | undefined;

  try {
    const { bin: infoBin, args: infoArgs } = buildArgs(infoYtArgs);
    const { stdout: infoOut } = await execFileAsync(infoBin, infoArgs, { timeout: 30_000 });
    const info = JSON.parse(infoOut);
    title = info.title ?? videoId;
    thumbnailUrl = info.thumbnail ?? info.thumbnails?.[0]?.url;
  } catch {
  }

  const dlYtArgs = [
    "--no-warnings",
    // Single format jo already merged ho — ffmpeg ki zarurat nahi
    "-f", "best[ext=mp4]/best",
    "-o", outputTemplate,
    "--no-playlist",
    "--retries", "5",
    "--fragment-retries", "5",
    "--file-access-retries", "15",
    videoUrl,
  ];

  const { bin: dlBin, args: dlArgs } = buildArgs(dlYtArgs);
  await execFileAsync(dlBin, dlArgs, { timeout: 300_000 });

  // Check for completed file — also check .part files that were renamed
  const possiblePaths = [
    path.join(DOWNLOAD_DIR, `${videoId}.mp4`),
    path.join(DOWNLOAD_DIR, `${videoId}.mkv`),
    path.join(DOWNLOAD_DIR, `${videoId}.webm`),
  ];

  // Small delay on Windows to let OS release file lock
  if (IS_WINDOWS) {
    await new Promise(r => setTimeout(r, 1500));
  }

  let filePath: string | undefined;
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) {
    throw new Error(`Downloaded file not found for video ${videoId}`);
  }

  const stat = statSync(filePath);

  return {
    filePath,
    fileSizeBytes: stat.size,
    title,
    thumbnailUrl,
  };
}
