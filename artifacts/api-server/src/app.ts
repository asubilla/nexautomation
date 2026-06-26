import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { startScheduler } from "./services/scheduler";


const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve built frontend from dist/public
const FRONTEND_DIST = path.resolve("e:/Nex Automation/artifacts/nex-automation/dist/public");

if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback — all non-API routes serve index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
  logger.info({ path: FRONTEND_DIST }, "Serving frontend from dist");
} else {
  logger.warn("Frontend dist not found — run: pnpm --filter @workspace/nex-automation run build");
}

startScheduler().catch((err) => logger.error({ err }, "Scheduler failed to start"));

export default app;
