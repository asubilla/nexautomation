/**
 * TikTok Upload via Playwright Browser Automation + Python tiktok-uploader
 * - Tries Python library first (more reliable)
 * - Falls back to Playwright with UK geolocation spoof
 * - Uses exported cookies for authentication
 * - Cookies file: e:\Nex Automation\tiktok-cookies.txt
 */

import { chromium as playwrightChromium, type Browser, type BrowserContext } from "playwright";
import { addExtra } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import { logger } from "../lib/logger";

const execFileAsync = promisify(execFile);
const UK_GEOLOCATION = { latitude: 51.5074, longitude: -0.1278, accuracy: 10 };
const UK_TIMEZONE = "Europe/London";
const UK_LOCALE = "en-GB";

// Setup stealth chromium — bypasses TikTok bot detection
const chromium = addExtra(playwrightChromium);
chromium.use(StealthPlugin());

const SESSION_DIR = path.join(os.tmpdir(), "nex-tiktok-sessions");
const SESSION_FILE = path.join(SESSION_DIR, "tiktok-session.json");

if (!existsSync(SESSION_DIR)) {
  mkdirSync(SESSION_DIR, { recursive: true });
}

// Cookies file locations to check
function getCookiesPaths(): string[] {
  const cwd = process.cwd(); // e:\Nex Automation\artifacts\api-server
  const workspaceRoot = path.resolve(cwd, "..", ".."); // e:\Nex Automation
  return [
    path.join(workspaceRoot, "tiktok-cookies.txt"),
    path.join(os.tmpdir(), "nex-tiktok-cookies.txt"),
    "E:\\Nex Automation\\tiktok-cookies.txt",
  ];
}

function loadCookiesFromFile(): any[] {
  const paths = getCookiesPaths();
  for (const cookiesPath of paths) {
    if (!existsSync(cookiesPath)) continue;
    try {
      const content = readFileSync(cookiesPath, "utf-8");
      const cookies: any[] = [];
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("# ")) continue;
        const isHttpOnly = trimmed.startsWith("#HttpOnly_");
        const cleaned = trimmed.replace(/^#HttpOnly_/, "");
        const parts = cleaned.split("\t");
        if (parts.length < 7) continue;
        const [domain, , cookiePath, secure, expires, name, ...valueParts] = parts;
        const value = valueParts.join("\t");
        if (!name || !value) continue;
        cookies.push({
          name: name.trim(),
          value: value.trim(),
          domain: domain.trim().replace(/^\./, ""),
          path: cookiePath.trim(),
          expires: parseInt(expires.trim()) || -1,
          httpOnly: isHttpOnly,
          secure: secure.trim() === "TRUE",
          sameSite: "None" as const,
        });
      }
      if (cookies.length > 0) {
        logger.info({ count: cookies.length, file: cookiesPath }, "TikTok: loaded cookies from file");
        return cookies;
      }
    } catch (err) {
      logger.warn({ err, cookiesPath }, "Could not parse TikTok cookies file");
    }
  }
  return [];
}

export interface TikTokCredentials {
  username: string;
  password: string;
}

export interface TikTokUploadResult {
  success: boolean;
  uploadedUrl?: string;
  errorMessage?: string;
}

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;

  // Explicit chromium executable path — avoid env variable space issues
  const chromiumPath = "E:\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
  const executablePath = existsSync(chromiumPath) ? chromiumPath : undefined;

  _browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--lang=en-GB",
    ],
  });
  return _browser;
}

async function getContext(browser: Browser): Promise<BrowserContext> {
  const storageState = existsSync(SESSION_FILE)
    ? JSON.parse(readFileSync(SESSION_FILE, "utf-8"))
    : undefined;

  const context = await browser.newContext({
    geolocation: UK_GEOLOCATION,
    permissions: ["geolocation"],
    locale: UK_LOCALE,
    timezoneId: UK_TIMEZONE,
    viewport: { width: 1366, height: 768 },
    // Real Chrome User-Agent — matching installed Chrome version
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.207 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    },
    storageState,
  });

  // Inject cookies from file
  const fileCookies = loadCookiesFromFile();
  if (fileCookies.length > 0) {
    await context.addCookies(fileCookies);
  }

  await context.addInitScript(() => {
    // Hide automation
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-GB", "en-US", "en"] });
    // Spoof geolocation
    navigator.geolocation.getCurrentPosition = (success: PositionCallback) => {
      success({
        coords: { latitude: 51.5074, longitude: -0.1278, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
        timestamp: Date.now(),
      } as GeolocationPosition);
    };
  });

  return context;
}

async function saveSession(context: BrowserContext): Promise<void> {
  try {
    const state = await context.storageState();
    writeFileSync(SESSION_FILE, JSON.stringify(state));
    logger.info("TikTok session saved");
  } catch (err) {
    logger.warn({ err }, "Could not save TikTok session");
  }
}

async function isLoggedIn(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage();
  try {
    await page.goto("https://www.tiktok.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(4000);

    // Multiple ways to check if logged in
    const checks = await page.evaluate(() => {
      const navProfile = document.querySelector('[data-e2e="nav-profile"]');
      const loginBtn = document.querySelector('[data-e2e="top-login-button"]');
      const avatarImg = document.querySelector('img[class*="avatar"]');
      const userMenu = document.querySelector('[class*="DivUserInfo"]');
      const url = window.location.href;
      return {
        hasNavProfile: !!navProfile,
        hasLoginBtn: !!loginBtn,
        hasAvatar: !!avatarImg,
        hasUserMenu: !!userMenu,
        url,
      };
    });

    logger.info({ checks }, "TikTok: login check");

    // If login button present → not logged in
    if (checks.hasLoginBtn) return false;
    // If any profile indicator → logged in
    if (checks.hasNavProfile || checks.hasAvatar || checks.hasUserMenu) return true;
    // If no login button but also no profile → assume logged in (cookies worked)
    return true;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

// 3-state login result:
//   'ok'       — logged in successfully
//   'wrong'    — wrong username/password (hard reject)
//   'blocked'  — captcha / security checkpoint / timeout (soft allow)
type LoginResult = "ok" | "wrong" | "blocked";

async function loginWithResult(context: BrowserContext, creds: TikTokCredentials): Promise<LoginResult> {
  const page = await context.newPage();
  try {
    logger.info("TikTok: attempting login");

    await page.goto("https://www.tiktok.com/login/phone-or-email/email", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(3000);
    await page.waitForSelector('input[name="username"]', { timeout: 15000 });

    // Type slowly like a human
    await page.click('input[name="username"]');
    await page.waitForTimeout(500);
    for (const char of creds.username) {
      await page.keyboard.type(char);
      await page.waitForTimeout(50 + Math.random() * 100);
    }

    await page.waitForTimeout(800);
    await page.click('input[type="password"]');
    await page.waitForTimeout(300);
    for (const char of creds.password) {
      await page.keyboard.type(char);
      await page.waitForTimeout(50 + Math.random() * 80);
    }

    await page.waitForTimeout(1500);

    // Wait for button to become enabled
    try {
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('[data-e2e="login-button"]') as HTMLButtonElement;
          return btn && !btn.disabled;
        },
        { timeout: 10000 }
      );
    } catch { /* try clicking anyway */ }

    await page.click('[data-e2e="login-button"]', { force: true });

    await page.waitForTimeout(5000);
    await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // ✅ Logged in successfully
    const loggedIn = await page.$('[data-e2e="nav-profile"]');
    if (loggedIn) {
      await saveSession(context);
      logger.info("TikTok: login successful");
      return "ok";
    }

    // 🔴 Wrong credentials error message
    const errorMsg = await page.$('[data-e2e="login-error-text"], [class*="LoginError"], [class*="error-text"]');
    if (errorMsg) {
      const text = await errorMsg.textContent().catch(() => "");
      logger.warn({ text }, "TikTok: wrong credentials error");
      return "wrong";
    }

    // 🟡 Captcha or security checkpoint
    const captcha = await page.$('[id*="captcha"], [class*="captcha"], [class*="Captcha"]');
    if (captcha) {
      logger.warn("TikTok: captcha detected — treating as blocked (not wrong creds)");
      return "blocked";
    }

    // Still on login page = wrong credentials
    const url = page.url();
    if (url.includes("/login")) {
      logger.warn({ url }, "TikTok: still on login page after submit — likely wrong credentials");
      return "wrong";
    }

    logger.warn({ url }, "TikTok: unknown state after login");
    return "blocked";
  } catch (err: any) {
    logger.error({ err }, "TikTok: login error");
    return "blocked";
  } finally {
    await page.close();
  }
}

// Keep legacy helper for upload flow
async function login(context: BrowserContext, creds: TikTokCredentials): Promise<boolean> {
  const result = await loginWithResult(context, creds);
  return result === "ok";
}

/**
 * Try Python tiktok-uploader library first (more reliable than Playwright)
 */
async function tryPythonUploader(
  filePath: string,
  caption: string,
  cookiesFile: string
): Promise<TikTokUploadResult | null> {
  // Find tiktok_upload.py script
  const scriptPaths = [
    path.join(process.cwd(), "tiktok_upload.py"),
    path.join(path.dirname(process.cwd()), "tiktok_upload.py"),
  ];

  let scriptPath: string | undefined;
  for (const p of scriptPaths) {
    if (existsSync(p)) { scriptPath = p; break; }
  }

  if (!scriptPath) return null;

  try {
    const { stdout, stderr } = await execFileAsync(
      "python",
      [scriptPath, filePath, caption, cookiesFile],
      { timeout: 180_000 }
    );
    // Find last JSON line in stdout (ignore debug/info output)
    const lines = stdout.trim().split("\n");
    let result: any = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("{")) {
        try { result = JSON.parse(line); break; } catch {}
      }
    }
    if (!result) {
      logger.warn({ stdout: stdout.slice(0, 200) }, "TikTok Python: no JSON in output");
      return null;
    }
    if (result.success) {
      logger.info("TikTok: Python uploader succeeded");
      return { success: true };
    }
    if (result.error?.includes("No module") || result.error?.includes("ImportError") || result.error?.includes("ModuleNotFoundError")) {
      return null;
    }
    return { success: false, errorMessage: result.error };
  } catch (err: any) {
    logger.warn({ err: err.message?.slice(0, 100) }, "TikTok Python uploader failed");
    return null;
  }
}

export async function uploadToTikTokPlaywright(
  filePath: string,
  title: string,
  hashtags: string,
  creds: TikTokCredentials,
  location = "London, UK"
): Promise<TikTokUploadResult> {
  const caption = `${title}\n${hashtags}\n📍 ${location}`.slice(0, 2200);
  const cookiesFile = getCookiesPaths().find(p => existsSync(p));

  // Try Python tiktok-uploader first (bypasses headless detection)
  if (cookiesFile) {
    const pythonResult = await tryPythonUploader(filePath, caption, cookiesFile);
    if (pythonResult) return pythonResult;
    logger.info("TikTok: Python uploader not available, trying Playwright...");
  }
  const browser = await getBrowser();
  const context = await getContext(browser);

  try {
    // Check if logged in via cookies
    const alreadyLoggedIn = await isLoggedIn(context);
    if (!alreadyLoggedIn) {
      // Try login with credentials as fallback
      const loginSuccess = await login(context, creds);
      if (!loginSuccess) {
        return {
          success: false,
          errorMessage: "TikTok login failed. Please update cookies in tiktok-cookies.txt or check credentials.",
        };
      }
    } else {
      logger.info("TikTok: already logged in via cookies ✅");
    }

    const page = await context.newPage();

    try {
      logger.info({ filePath, location }, "TikTok: starting upload via browser");

      // Go to TikTok upload page
      // Regular accounts use tiktok.com/upload (iframe)
      // Creator accounts use creator-center/upload
      await page.goto("https://www.tiktok.com/upload", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(4000);

      const currentUrl = page.url();
      logger.info({ url: currentUrl }, "TikTok: upload page URL");

      if (currentUrl.includes("/login")) {
        return { success: false, errorMessage: "TikTok: cookies expired. Please re-export cookies from tiktok.com and save to tiktok-cookies.txt" };
      }

      // tiktok.com/upload uses an iframe
      let uploadFrame = page.mainFrame();
      const iframes = page.frames();
      if (iframes.length > 1) {
        uploadFrame = iframes[1]; // upload iframe
        logger.info({ frameCount: iframes.length }, "TikTok: using upload iframe");
      }

      // Upload file — check both page and iframe
      let fileInput = await page.$('input[type="file"]');
      if (!fileInput) {
        // Try waiting longer
        try {
          fileInput = await uploadFrame.waitForSelector('input[type="file"]', { timeout: 20000 });
        } catch {
          // Try in all frames
          for (const frame of page.frames()) {
            fileInput = await frame.$('input[type="file"]');
            if (fileInput) break;
          }
        }
      }

      if (!fileInput) {
        return { success: false, errorMessage: "TikTok: upload input not found. Page may have changed." };
      }

      await fileInput.setInputFiles(filePath);
      logger.info("TikTok: file selected, waiting for upload...");

      // Wait for upload progress to complete
      await page.waitForSelector('[class*="upload-success"], [class*="uploadSuccess"]', {
        timeout: 120000,
      }).catch(() => {});

      await page.waitForTimeout(3000);

      // Fill caption — title + hashtags + location
      const caption = `${title}\n${hashtags}\n📍 ${location}`;
      const captionBox = await page.$('[data-text="true"], .public-DraftEditor-content, [contenteditable="true"]');
      if (captionBox) {
        await captionBox.click();
        await page.waitForTimeout(500);
        // Clear existing text and type new
        if (process.platform === "darwin") {
          await page.keyboard.press("Meta+A");
        } else {
          await page.keyboard.press("Control+A");
        }
        await page.keyboard.press("Backspace");
        await page.keyboard.type(caption.slice(0, 2200));
      }

      await page.waitForTimeout(1500);

      // Click Post button
      const postButton = await page.$('[data-e2e="post_video_button"], button:has-text("Post")');
      if (!postButton) {
        return { success: false, errorMessage: "TikTok: could not find Post button" };
      }
      await postButton.click();

      // Wait for success
      await page.waitForTimeout(5000);

      // Save updated session
      await saveSession(context);

      logger.info("TikTok: upload submitted successfully");
      return { success: true };

    } finally {
      await page.close();
    }
  } catch (err: any) {
    logger.error({ err }, "TikTok Playwright upload error");
    return { success: false, errorMessage: `TikTok browser upload failed: ${err.message}` };
  } finally {
    await context.close();
  }
}

export function clearTikTokSession(): void {
  try {
    if (existsSync(SESSION_FILE)) {
      const { unlinkSync } = require("fs");
      unlinkSync(SESSION_FILE);
      logger.info("TikTok session cleared");
    }
  } catch {}
}

/**
 * Test TikTok login — used before saving credentials
 * Returns { valid: true } on success, { valid: false, error } on failure
 */
export async function testTikTokLogin(creds: TikTokCredentials): Promise<{ valid: boolean; error?: string }> {
  if (!creds.username || creds.username.trim().length < 3) {
    return { valid: false, error: "TikTok username bahut chota hai (min 3 characters)" };
  }
  if (!creds.password || creds.password.trim().length < 6) {
    return { valid: false, error: "TikTok password bahut chota hai (min 6 characters)" };
  }

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({
      geolocation: UK_GEOLOCATION,
      permissions: ["geolocation"],
      locale: UK_LOCALE,
      timezoneId: UK_TIMEZONE,
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const result = await loginWithResult(context, creds);
    await context.close();

    if (result === "ok") {
      return { valid: true };
    }
    if (result === "wrong") {
      // Definitively wrong credentials — hard reject
      return { valid: false, error: "TikTok login failed — username ya password galat hai. Dobara check karo." };
    }
    // result === "blocked" — captcha / security checkpoint
    // Save credentials anyway, they will be tested at first upload
    logger.info("TikTok: captcha/security checkpoint — saving credentials as unverified");
    return { valid: true };

  } catch (err: any) {
    if (err.message?.includes("Executable doesn't exist") || err.message?.includes("chromium")) {
      logger.warn("Playwright Chromium not installed yet — skipping TikTok login test");
      return { valid: true };
    }
    // Any other unexpected error — treat as blocked, not wrong credentials
    logger.error({ err }, "TikTok test login error — saving as unverified");
    return { valid: true };
  }
}
