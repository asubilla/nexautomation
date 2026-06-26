/**
 * Facebook Video Scraper via Playwright
 * Scrapes latest video/reel URLs from a Facebook profile/page
 * since yt-dlp doesn't support Facebook channel listing
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import { logger } from "../lib/logger";

const SESSION_DIR = path.join(os.tmpdir(), "nex-facebook-sessions");
const SESSION_FILE = path.join(SESSION_DIR, "facebook-scraper-session.json");

if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  return _browser;
}

async function getContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  const storageState = existsSync(SESSION_FILE)
    ? JSON.parse(readFileSync(SESSION_FILE, "utf-8"))
    : undefined;

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
    storageState,
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  return context;
}

/**
 * Load Facebook cookies from the cookies.txt file into browser session
 */
async function loadCookiesFromFile(context: BrowserContext, cookiesFile: string): Promise<void> {
  try {
    const content = readFileSync(cookiesFile, "utf-8");
    const cookies: any[] = [];
    for (const line of content.split("\n")) {
      if (line.startsWith("#") || !line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      const [domain, , path, secure, expires, name, value] = parts;
      cookies.push({
        name: name.trim(),
        value: value.trim(),
        domain: domain.trim().replace(/^#HttpOnly_/, ""),
        path: path.trim(),
        expires: parseInt(expires.trim()) || -1,
        httpOnly: line.includes("#HttpOnly_"),
        secure: secure.trim() === "TRUE",
        sameSite: "None" as const,
      });
    }
    if (cookies.length > 0) {
      await context.addCookies(cookies);
      logger.info({ count: cookies.length }, "Facebook cookies loaded into browser");
    }
  } catch (err) {
    logger.warn({ err }, "Could not load Facebook cookies");
  }
}

export interface ScrapedVideo {
  id: string;
  url: string;
  title: string;
  thumbnailUrl?: string;
}

/**
 * Scrape latest video/reel URLs from a Facebook profile or page
 */
export async function scrapeFacebookVideos(
  profileUrl: string,
  count = 5,
  cookiesFile?: string
): Promise<ScrapedVideo[]> {
  const context = await getContext();

  // Load cookies if available
  if (cookiesFile && existsSync(cookiesFile)) {
    await loadCookiesFromFile(context, cookiesFile);
  }

  const page = await context.newPage();
  const videos: ScrapedVideo[] = [];

  try {
    // Try reels tab first
    const reelsUrl = profileUrl.includes("/profile.php")
      ? profileUrl.replace(/[?&]sk=[^&]*/, "") + "&sk=reels"
      : profileUrl.replace(/\/$/, "") + "/reels";

    logger.info({ reelsUrl }, "Facebook: scraping reels");

    await page.goto(reelsUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Scroll to load more content
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);
    }

    // Extract video/reel links
    const links = await page.evaluate((maxCount: number) => {
      const found: { href: string; text: string }[] = [];
      const seen = new Set<string>();

      const anchors = document.querySelectorAll('a[href]');
      for (const a of anchors) {
        const href = (a as HTMLAnchorElement).href;
        if (!href) continue;

        // Match video/reel URLs
        const isVideo = href.includes('/videos/') ||
                       href.includes('/reel/') ||
                       href.includes('/reels/') ||
                       (href.includes('facebook.com') && href.includes('/v/'));

        if (isVideo && !seen.has(href)) {
          seen.add(href);
          found.push({ href, text: a.textContent?.trim() || "" });
          if (found.length >= maxCount) break;
        }
      }
      return found;
    }, count);

    for (const link of links) {
      // Extract ID from URL
      const idMatch = link.href.match(/\/(?:videos|reel|reels|v)\/(\d+)/);
      const id = idMatch ? idMatch[1] : link.href.split("/").filter(Boolean).pop() || Date.now().toString();

      videos.push({
        id,
        url: link.href,
        title: link.text || `Facebook Video ${id}`,
      });
    }

    // Save session
    try {
      const state = await context.storageState();
      writeFileSync(SESSION_FILE, JSON.stringify(state));
    } catch {}

    logger.info({ count: videos.length, profileUrl }, "Facebook: scraped videos");
    return videos;

  } catch (err: any) {
    logger.error({ err, profileUrl }, "Facebook scraper error");
    return [];
  } finally {
    await page.close();
    await context.close();
  }
}
