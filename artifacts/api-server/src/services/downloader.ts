import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, statSync } from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

const YTDLP_BIN = "/home/runner/workspace/.pythonlibs/bin/yt-dlp";
const DOWNLOAD_DIR = "/tmp/nex-downloads";

if (!existsSync(DOWNLOAD_DIR)) {
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
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
  try {
    const args = [
      "--flat-playlist",
      "--playlist-end", String(count),
      "-J",
      "--no-warnings",
      "--quiet",
      channelUrl,
    ];

    const { stdout } = await execFileAsync(YTDLP_BIN, args, { timeout: 60_000 });
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

  const infoArgs = [
    "--no-warnings",
    "--quiet",
    "-J",
    videoUrl,
  ];

  let title = videoId;
  let thumbnailUrl: string | undefined;

  try {
    const { stdout: infoOut } = await execFileAsync(YTDLP_BIN, infoArgs, { timeout: 30_000 });
    const info = JSON.parse(infoOut);
    title = info.title ?? videoId;
    thumbnailUrl = info.thumbnail ?? info.thumbnails?.[0]?.url;
  } catch {
  }

  const dlArgs = [
    "--no-warnings",
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "-o", outputTemplate,
    "--no-playlist",
    videoUrl,
  ];

  await execFileAsync(YTDLP_BIN, dlArgs, { timeout: 300_000 });

  const possiblePaths = [
    path.join(DOWNLOAD_DIR, `${videoId}.mp4`),
    path.join(DOWNLOAD_DIR, `${videoId}.mkv`),
    path.join(DOWNLOAD_DIR, `${videoId}.webm`),
  ];

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
