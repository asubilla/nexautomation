/**
 * Instagram Upload via Playwright Browser Automation
 * - No API token needed — uses username/password login
 * - Session cookies saved so login not repeated every time
 * - Uploads as Reels
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import { logger } from "../lib/logger";

const SESSION_DIR = path.join(os.tmpdir(), "nex-instagram-sessions");
const SESSION_FILE = path.join(SESSION_DIR, "instagram-session.json");

if (!existsSync(SESSION_DIR)) {
  mkdirSync(SESSION_DIR, { recursive: true });
}

export interface InstagramCredentials {
  username: string;
  password: string;
}

export interface InstagramUploadResult {
  success: boolean;
  uploadedUrl?: string;
  errorMessage?: string;
}

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--lang=en-US",
    ],
  });
  return _browser;
}

async function getContext(browser: Browser): Promise<BrowserContext> {
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

async function saveSession(context: BrowserContext): Promise<void> {
  try {
    const state = await context.storageState();
    writeFileSync(SESSION_FILE, JSON.stringify(state));
  } catch {}
}

async function isLoggedIn(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage();
  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 15000 });
    const avatar = await page.$('img[alt*="profile picture"], [data-testid="user-avatar"]');
    return !!avatar;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

type LoginResult = "ok" | "wrong" | "blocked";

async function loginWithResult(context: BrowserContext, creds: InstagramCredentials): Promise<LoginResult> {
  const page = await context.newPage();
  try {
    await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await page.fill('input[name="username"]', creds.username);
    await page.fill('input[name="password"]', creds.password);
    await page.waitForTimeout(800 + Math.random() * 800);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Dismiss "Save login info" popup if appears
    const notNow = await page.$('button:has-text("Not Now"), button:has-text("Not now")');
    if (notNow) await notNow.click();
    await page.waitForTimeout(1000);

    // Dismiss notifications popup
    const notNow2 = await page.$('button:has-text("Not Now"), button:has-text("Not now")');
    if (notNow2) await notNow2.click();

    // ✅ Logged in successfully
    const loggedIn = await page.$('svg[aria-label="Home"], [aria-label="Home"], a[href="/"]');
    if (loggedIn) {
      await saveSession(context);
      logger.info("Instagram: login successful");
      return "ok";
    }

    // 🔴 Wrong credentials — Instagram shows specific error
    const errorMsg = await page.$('p[role="alert"], #slfErrorAlert, [data-testid="login-error-message"]');
    if (errorMsg) {
      const text = await errorMsg.textContent().catch(() => "");
      logger.warn({ text }, "Instagram: wrong credentials error");
      return "wrong";
    }

    // 🟡 Still on login page but no error = captcha/2FA/security
    const url = page.url();
    if (url.includes("/accounts/login") || url.includes("/challenge") || url.includes("/two_factor")) {
      logger.warn({ url }, "Instagram: security challenge or captcha detected — treating as blocked");
      return "blocked";
    }

    // Unknown state
    logger.warn({ url }, "Instagram: unknown state after login — treating as blocked");
    return "blocked";
  } catch (err: any) {
    logger.error({ err }, "Instagram: login error");
    return "blocked";
  } finally {
    await page.close();
  }
}

// Keep legacy helper for upload flow
async function login(context: BrowserContext, creds: InstagramCredentials): Promise<boolean> {
  const result = await loginWithResult(context, creds);
  return result === "ok";
}

export async function uploadToInstagramPlaywright(
  filePath: string,
  caption: string,
  creds: InstagramCredentials
): Promise<InstagramUploadResult> {
  const browser = await getBrowser();
  const context = await getContext(browser);

  try {
    const alreadyLoggedIn = await isLoggedIn(context);
    if (!alreadyLoggedIn) {
      const ok = await login(context, creds);
      if (!ok) return { success: false, errorMessage: "Instagram login failed. Check credentials." };
    }

    const page = await context.newPage();
    try {
      await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(2000);

      // Click "New post" button
      const newPost = await page.$('svg[aria-label="New post"], a[href="/create/select/"]');
      if (!newPost) return { success: false, errorMessage: "Instagram: could not find New post button" };
      await newPost.click();
      await page.waitForTimeout(1500);

      // Upload file
      const fileInput = await page.$('input[type="file"]');
      if (!fileInput) return { success: false, errorMessage: "Instagram: file input not found" };
      await fileInput.setInputFiles(filePath);
      await page.waitForTimeout(3000);

      // Click "Next" through steps
      for (let i = 0; i < 3; i++) {
        const next = await page.$('button:has-text("Next"), div[role="button"]:has-text("Next")');
        if (next) { await next.click(); await page.waitForTimeout(1500); }
      }

      // Add caption
      const captionBox = await page.$('textarea[aria-label="Write a caption..."], div[aria-label="Write a caption..."]');
      if (captionBox) {
        await captionBox.click();
        await page.keyboard.type(caption.slice(0, 2200));
        await page.waitForTimeout(1000);
      }

      // Share
      const share = await page.$('button:has-text("Share"), div[role="button"]:has-text("Share")');
      if (!share) return { success: false, errorMessage: "Instagram: Share button not found" };
      await share.click();
      await page.waitForTimeout(5000);

      await saveSession(context);
      logger.info("Instagram: upload submitted");
      return { success: true };

    } finally {
      await page.close();
    }
  } catch (err: any) {
    logger.error({ err }, "Instagram Playwright upload error");
    return { success: false, errorMessage: `Instagram browser upload failed: ${err.message}` };
  } finally {
    await context.close();
  }
}

export function clearInstagramSession(): void {
  try {
    if (existsSync(SESSION_FILE)) {
      const { unlinkSync } = require("fs");
      unlinkSync(SESSION_FILE);
    }
  } catch {}
}

/**
 * Test Instagram login — used before saving credentials.
 * 3-state: ok = verified, wrong = hard reject, blocked = captcha/timeout (save as unverified)
 */
export async function testInstagramLogin(creds: InstagramCredentials): Promise<{ valid: boolean; error?: string }> {
  if (!creds.username || creds.username.trim().length < 3) {
    return { valid: false, error: "Instagram username bahut chota hai (min 3 characters)" };
  }
  if (!creds.password || creds.password.trim().length < 6) {
    return { valid: false, error: "Instagram password bahut chota hai (min 6 characters)" };
  }

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const result = await loginWithResult(context, creds);
    await context.close();

    if (result === "ok") return { valid: true };
    if (result === "wrong") {
      return { valid: false, error: "Instagram login failed — username ya password galat hai. Dobara check karo." };
    }
    // blocked = captcha/2FA/security — save as unverified
    logger.info("Instagram: captcha/security detected — saving as unverified");
    return { valid: true };

  } catch (err: any) {
    if (err.message?.includes("Executable doesn't exist") || err.message?.includes("chromium")) {
      return { valid: true }; // Chromium not installed, skip test
    }
    // Any unexpected error = treat as blocked, not wrong creds
    logger.error({ err }, "Instagram test login error — saving as unverified");
    return { valid: true };
  }
}
