import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import os from "os";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
