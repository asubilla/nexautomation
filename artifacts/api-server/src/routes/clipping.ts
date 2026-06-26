import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { db, uploadJobsTable, downloadJobsTable, activityItemsTable, monitoredAccountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateContent } from "../services/ai-generator";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CLIPPING_DIR = path.resolve("e:/Nex Automation/nex ai clipping");
const PYTHON_EXE = path.join(CLIPPING_DIR, "venv/Scripts/python.exe");
const CLIP_SCRIPT = path.join(CLIPPING_DIR, "clip_video.py");
const CLIPS_DIR = path.join(CLIPPING_DIR, "clips");

// ─── In-memory job store for UI real-time log streaming ──────────────────────
// NOTE: DB mein bhi record banta hai — ye sirf live log tracking ke liye hai
interface ClipJob {
  id: string;
  dbJobId?: number;      // DB download_jobs table ka ID
  url: string;
  status: "pending" | "running" | "done" | "failed";
  logs: string[];
  clips: string[];
  uploadTargets: string[];
  createdAt: string;
  completedAt?: string;
  error?: string;
}

const jobs = new Map<string, ClipJob>();

// ─── Helper: safe hostname extract ────────────────────────────────────────────
function safeHostname(url: string): string {
  try { return new URL(url).hostname; }
  catch { return url.slice(0, 50); }
}

// POST /api/clipping/start
router.post("/clipping/start", async (req, res): Promise<void> => {
  const {
    url,
    numClips = 4,
    minDuration = 15,
    maxDuration = 90,
    uploadTargets = [],
  } = req.body;

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Video URL required" });
    return;
  }

  const id = Date.now().toString();
  const job: ClipJob = {
    id,
    url,
    status: "pending",
    logs: [],
    clips: [],
    uploadTargets: Array.isArray(uploadTargets) ? uploadTargets : [],
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);

  res.json({ jobId: id });

  // ─── DB mein record banao ────────────────────────────────────────────────────
  // Manual clipping ke liye accountId=0 (sentinel — koi account nahi)
  // Ek virtual "manual" account dhundho ya create karo
  let dbJobId: number | undefined;
  try {
    // Find or create a sentinel "manual-clipping" account
    let [manualAccount] = await db
      .select()
      .from(monitoredAccountsTable)
      .where(eq(monitoredAccountsTable.username, "__manual_clipping__"))
      .limit(1);

    if (!manualAccount) {
      [manualAccount] = await db
        .insert(monitoredAccountsTable)
        .values({
          platform: "youtube",
          username: "__manual_clipping__",
          url: "https://youtube.com",
          enabled: false,
          uploadTargets: JSON.stringify([]),
        })
        .returning();
    }

    const [dbJob] = await db
      .insert(downloadJobsTable)
      .values({
        accountId: manualAccount.id,
        platform: "youtube",
        username: "manual",
        videoUrl: url,
        videoId: `manual_${id}`,
        originalTitle: `Manual clip — ${safeHostname(url)}`,
        status: "pending",
      })
      .returning();

    dbJobId = dbJob.id;
    job.dbJobId = dbJobId;

    logger.info({ jobId: id, dbJobId }, "Manual clipping job created in DB");
  } catch (err) {
    logger.warn({ err }, "Could not create DB record for manual clipping job (non-fatal)");
  }

  // ─── Python clipping process ─────────────────────────────────────────────────
  const args = [
    CLIP_SCRIPT,
    url,
    "--clips", String(numClips),
    "--min", String(minDuration),
    "--max", String(maxDuration),
    "--style", "clean_white",
    "--random-duration",
  ];

  const proc = spawn(PYTHON_EXE, args, {
    cwd: CLIPPING_DIR,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    },
  });

  job.status = "running";
  job.logs.push(`Starting: ${url}`);
  job.logs.push(`Clips: ${numClips} | Duration: ${minDuration}s-${maxDuration}s`);
  if (job.uploadTargets.length > 0) {
    job.logs.push(`Upload targets: ${job.uploadTargets.join(", ")}`);
  }

  // Update DB status to "downloading"
  if (dbJobId) {
    db.update(downloadJobsTable)
      .set({ status: "downloading" })
      .where(eq(downloadJobsTable.id, dbJobId))
      .catch(() => {});
  }

  let resultJson: any = null;

  proc.stdout.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      if (line.startsWith("CLIP_RESULT:")) {
        try {
          resultJson = JSON.parse(line.replace("CLIP_RESULT:", "").trim());
        } catch { /* ignore */ }
      } else {
        job.logs.push(line);
      }
    }
  });

  proc.stderr.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    job.logs.push(...lines.map((l) => `[ERR] ${l}`));
  });

  proc.on("close", async (code) => {
    job.completedAt = new Date().toISOString();

    if (code === 0 && resultJson?.success) {
      job.status = "done";
      job.clips = resultJson.clips ?? [];
      job.logs.push(`${job.clips.length} clips generated!`);

      // DB mein done mark karo
      if (dbJobId) {
        await db.update(downloadJobsTable)
          .set({
            status: "done",
            completedAt: new Date(),
            originalTitle: resultJson.title ?? `Manual clip — ${safeHostname(url)}`,
          })
          .where(eq(downloadJobsTable.id, dbJobId))
          .catch(() => {});
      }

      // Upload targets honay par upload jobs DB mein create karo
      if (job.uploadTargets.length > 0 && job.clips.length > 0 && dbJobId) {
        job.logs.push(`Creating scheduled upload jobs for ${job.clips.length} clips...`);
        await createUploadJobs(job, dbJobId, resultJson.title ?? safeHostname(url));
      }

    } else {
      job.status = "failed";
      job.error = resultJson?.error ?? `Process exited with code ${code}`;
      job.logs.push(`Failed: ${job.error}`);

      if (dbJobId) {
        await db.update(downloadJobsTable)
          .set({ status: "failed", errorMessage: job.error?.slice(0, 300) })
          .where(eq(downloadJobsTable.id, dbJobId))
          .catch(() => {});
      }
    }
  });
});

// ─── Upload jobs DB mein create karo (scheduler se connected) ─────────────────
async function createUploadJobs(job: ClipJob, dbJobId: number, videoTitle: string): Promise<void> {
  const now = new Date();

  for (let i = 0; i < job.clips.length; i++) {
    const clipPath = job.clips[i];
    const fullPath = path.isAbsolute(clipPath) ? clipPath : path.join(CLIPS_DIR, clipPath);
    const partNumber = i + 1;
    // Schedule: +6h, +12h, +18h, +24h
    const scheduledAt = new Date(now.getTime() + partNumber * 6 * 60 * 60 * 1000);

    if (!fs.existsSync(fullPath)) {
      job.logs.push(`Clip file not found: ${clipPath}`);
      continue;
    }

    for (const platform of job.uploadTargets) {
      try {
        const content = await generateContent(videoTitle, platform, partNumber, null);

        await db.insert(uploadJobsTable).values({
          downloadJobId: dbJobId,
          targetPlatform: platform,
          localClipPath: fullPath,
          aiTitle: content.title,
          aiDescription: content.description,
          aiHashtags: content.hashtags,
          aiTags: JSON.stringify(content.tags),
          aiLocation: content.location ?? null,
          scheduledAt,
          status: "pending",
        } as any);

        job.logs.push(`Part ${partNumber} → ${platform} scheduled at ${scheduledAt.toISOString()}`);
        logger.info({ dbJobId, platform, part: partNumber, scheduledAt }, "Manual clip upload job scheduled");
      } catch (err: any) {
        job.logs.push(`Failed to schedule ${platform} Part ${partNumber}: ${err.message}`);
        logger.error({ err, platform, partNumber }, "Failed to create upload job");
      }
    }
  }

  job.logs.push(`Upload jobs created — scheduler will handle uploads automatically.`);

  await db.insert(activityItemsTable).values({
    type: "download_done",
    platform: "youtube",
    message: `Manual clips ready: "${videoTitle.slice(0, 60)}" — ${job.clips.length} clips scheduled`,
  }).catch(() => {});
}

// GET /api/clipping/status/:id
router.get("/clipping/status/:id", (req, res): void => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// GET /api/clipping/jobs
router.get("/clipping/jobs", (_req, res): void => {
  const all = Array.from(jobs.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);
  res.json(all);
});

// GET /api/clipping/clips
router.get("/clipping/clips", (_req, res): void => {
  try {
    if (!fs.existsSync(CLIPS_DIR)) {
      res.json([]);
      return;
    }
    const files = fs.readdirSync(CLIPS_DIR)
      .filter((f) => f.endsWith(".mp4"))
      .map((f) => ({
        name: f,
        size: Math.round(fs.statSync(path.join(CLIPS_DIR, f)).size / (1024 * 1024) * 10) / 10,
        createdAt: fs.statSync(path.join(CLIPS_DIR, f)).mtime.toISOString(),
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(files);
  } catch {
    res.json([]);
  }
});

export default router;
