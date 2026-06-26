/**
 * Facebook Upload via Playwright Browser Automation
 * - No API token needed — uses username/password login
 * - Session cookies saved
 * - Uploads video to profile/page
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import { logger } from "../lib/logger";

const SESSION_DIR = path.join(os.tmpdir(), "nex-facebook-sessions");
const SESSION_FILE = path.join(SESSION_DIR, "facebook-session.json");

if (!existsSync(SESSION_DIR)) {
  mkdirSync(SESSION_DIR, { recursive: true });
}

export interface FacebookCredentials {
  username: string; // email or phone
  password: string;
}

export interface FacebookUploadResult {
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
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 15000 });
    const profileLink = await page.$('[aria-label="Your profile"], [data-testid="blue_bar_profile_link"]');
    return !!profileLink;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

type LoginResult = "ok" | "wrong" | "blocked";

async function loginWithResult(context: BrowserContext, creds: FacebookCredentials): Promise<LoginResult> {
  const page = await context.newPage();
  try {
    await page.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('#email', { timeout: 10000 });
    await page.fill('#email', creds.username);
    await page.fill('#pass', creds.password);
    await page.waitForTimeout(800 + Math.random() * 500);
    await page.click('[name="login"]');
    await page.waitForNavigation({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // ✅ Logged in successfully
    const loggedIn = await page.$('[aria-label="Your profile"], [data-testid="blue_bar_profile_link"], [aria-label="Facebook"]');
    if (loggedIn) {
      await saveSession(context);
      logger.info("Facebook: login successful");
      return "ok";
    }

    const url = page.url();

    // 🔴 Wrong credentials — Facebook shows specific error on /login page with error code
    const errorMsg = await page.$('#error_box, [data-testid="royal_login_error"], ._9ay7');
    if (errorMsg) {
      const text = await errorMsg.textContent().catch(() => "");
      logger.warn({ text }, "Facebook: wrong credentials error");
      return "wrong";
    }

    // Also on login page with error param = wrong creds
    if (url.includes("login") && (url.includes("error") || url.includes("login_attempt"))) {
      logger.warn({ url }, "Facebook: login failed with error in URL — wrong credentials");
      return "wrong";
    }

    // 🟡 Checkpoint / 2FA / suspicious activity
    if (url.includes("checkpoint") || url.includes("two_step") || url.includes("confirmemail")) {
      logger.warn({ url }, "Facebook: security checkpoint — treating as blocked");
      return "blocked";
    }

    logger.warn({ url }, "Facebook: unknown state after login — treating as blocked");
    return "blocked";
  } catch (err: any) {
    logger.error({ err }, "Facebook: login error");
    return "blocked";
  } finally {
    await page.close();
  }
}

// Keep legacy helper for upload flow
async function login(context: BrowserContext, creds: FacebookCredentials): Promise<boolean> {
  const result = await loginWithResult(context, creds);
  return result === "ok";
}

export async function uploadToFacebookPlaywright(
  filePath: string,
  title: string,
  description: string,
  creds: FacebookCredentials
): Promise<FacebookUploadResult> {
  const browser = await getBrowser();
  const context = await getContext(browser);

  try {
    const alreadyLoggedIn = await isLoggedIn(context);
    if (!alreadyLoggedIn) {
      const ok = await login(context, creds);
      if (!ok) return { success: false, errorMessage: "Facebook login failed. Check credentials." };
    }

    const page = await context.newPage();
    try {
      // Go to video upload page
      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(2000);

      // Click "Video" / "Photo/Video" in post composer
      const videoBtn = await page.$('[aria-label="Video"], [aria-label="Photo/video"], span:has-text("Photo/video")');
      if (!videoBtn) {
        // Try direct video upload URL
        await page.goto("https://www.facebook.com/video/upload", { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(2000);
      } else {
        await videoBtn.click();
        await page.waitForTimeout(1500);
      }

      // Upload file
      const fileInput = await page.$('input[type="file"][accept*="video"]') ??
                        await page.$('input[type="file"]');
      if (!fileInput) return { success: false, errorMessage: "Facebook: file input not found" };
      await fileInput.setInputFiles(filePath);

      logger.info("Facebook: file selected, waiting for upload...");
      await page.waitForTimeout(5000);

      // Fill title/description
      const titleBox = await page.$('input[placeholder*="title"], input[name="title"]');
      if (titleBox) {
        await titleBox.fill(title.slice(0, 100));
      }

      const descBox = await page.$('textarea[placeholder*="description"], textarea[placeholder*="Tell"]');
      if (descBox) {
        await descBox.fill(description.slice(0, 2000));
        await page.waitForTimeout(500);
      }

      // Post
      const postBtn = await page.$('button:has-text("Post"), button:has-text("Publish"), div[role="button"]:has-text("Post")');
      if (!postBtn) return { success: false, errorMessage: "Facebook: Post button not found" };
      await postBtn.click();
      await page.waitForTimeout(5000);

      await saveSession(context);
      logger.info("Facebook: upload submitted");
      return { success: true };

    } finally {
      await page.close();
    }
  } catch (err: any) {
    logger.error({ err }, "Facebook Playwright upload error");
    return { success: false, errorMessage: `Facebook browser upload failed: ${err.message}` };
  } finally {
    await context.close();
  }
}

export function clearFacebookSession(): void {
  try {
    if (existsSync(SESSION_FILE)) {
      const { unlinkSync } = require("fs");
      unlinkSync(SESSION_FILE);
    }
  } catch {}
}

/**
 * Test Facebook login — used before saving credentials.
 * 3-state: ok = verified, wrong = hard reject, blocked = captcha/checkpoint (save as unverified)
 */
export async function testFacebookLogin(creds: FacebookCredentials): Promise<{ valid: boolean; error?: string }> {
  if (!creds.username || creds.username.trim().length < 5) {
    return { valid: false, error: "Facebook email/phone bahut chota hai" };
  }
  if (!creds.password || creds.password.trim().length < 6) {
    return { valid: false, error: "Facebook password bahut chota hai (min 6 characters)" };
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
      return { valid: false, error: "Facebook login failed — email/phone ya password galat hai. Dobara check karo." };
    }
    // blocked = checkpoint/2FA/security — save as unverified
    logger.info("Facebook: checkpoint/security detected — saving as unverified");
    return { valid: true };

  } catch (err: any) {
    if (err.message?.includes("Executable doesn't exist") || err.message?.includes("chromium")) {
      return { valid: true }; // Chromium not installed, skip test
    }
    // Any unexpected error = treat as blocked, not wrong creds
    logger.error({ err }, "Facebook test login error — saving as unverified");
    return { valid: true };
  }
}
