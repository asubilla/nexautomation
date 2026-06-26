import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import os from "os";
import https from "https";
import fs from "fs";
import path from "path";

// Set Playwright browsers path — Windows pe E: drive use karo (C: full ho sakta hai)
if (os.platform() === "win32" && !process.env["PLAYWRIGHT_BROWSERS_PATH"]) {
  process.env["PLAYWRIGHT_BROWSERS_PATH"] = "E:\\ms-playwright";
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Prevent unhandled rejections from crashing the server
process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled promise rejection — server will continue running");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — server will continue running");
});

// Start HTTP server
app.listen(port, () => {
  logger.info({ port }, "HTTP Server listening");
});

// Start HTTPS server on port 443 if SSL cert exists
const pfxPath = path.resolve(process.cwd(), "cert.pfx");
if (fs.existsSync(pfxPath)) {
  try {
    const httpsOptions = {
      pfx: fs.readFileSync(pfxPath),
      passphrase: "password"
    };
    https.createServer(httpsOptions, app).listen(443, () => {
      logger.info("HTTPS Server listening on port 443");
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to start HTTPS server");
  }
} else {
  logger.warn({ pfxPath }, "cert.pfx not found — HTTPS server disabled");
}

