import { logger } from "../lib/logger";

export interface GeneratedContent {
  title: string;
  hashtags: string;
}

async function callGroq(prompt: string): Promise<string | null> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 300,
        temperature: 0.85,
        messages: [
          {
            role: "system",
            content: "You are a viral social media content expert. Always respond with ONLY valid JSON — no markdown, no explanation.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.warn({ status: res.status, err: err.slice(0, 200) }, "Groq API error");
      return null;
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? null;
  } catch (err) {
    logger.warn({ err }, "Groq fetch failed");
    return null;
  }
}

export async function generateContent(
  originalTitle: string,
  targetPlatform: string,
  niche?: string | null
): Promise<GeneratedContent> {
  const prompt = `Generate a viral title and hashtags for a ${targetPlatform} video.

Original title: "${originalTitle}"
Platform: ${targetPlatform}${niche ? `\nNiche: ${niche}` : ""}

Rules:
- Title must be catchy, curiosity-driven, and optimized for ${targetPlatform} (max 100 chars)
- Include 10-15 trending hashtags relevant to the content and platform
- For TikTok/Instagram include #fyp #foryou style tags
- For YouTube include #shorts if it seems like a short video

Respond with ONLY this JSON (no markdown):
{"title": "...", "hashtags": "..."}`;

  const raw = await callGroq(prompt);

  if (raw) {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { title?: string; hashtags?: string | string[] };
        const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null;
        const hashtagsRaw = parsed.hashtags;
        const hashtags = Array.isArray(hashtagsRaw)
          ? hashtagsRaw.join(" ")
          : typeof hashtagsRaw === "string"
          ? hashtagsRaw.trim()
          : null;

        if (title && hashtags) {
          logger.info({ title, platform: targetPlatform }, "Groq generated content");
          return { title, hashtags };
        }
      }
    } catch (err) {
      logger.warn({ err, raw }, "Failed to parse Groq JSON response");
    }
  }

  return fallbackGenerate(originalTitle, targetPlatform);
}

function fallbackGenerate(originalTitle: string, targetPlatform: string): GeneratedContent {
  const hooks = [
    "You Won't Believe", "Watch This", "Incredible", "Insane", "Mind-Blowing",
    "This Changes Everything", "Nobody Expected", "Going Viral", "Shocking",
    "Must Watch", "Unbelievable", "Epic", "Legendary",
  ];
  const hook = hooks[Math.floor(Math.random() * hooks.length)];
  const cleaned = originalTitle.replace(/[|#@]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  const title = `${hook}: ${cleaned} 🔥`;

  const platformTags: Record<string, string> = {
    youtube: "#youtube #viral #trending #shorts #subscribe #video #content",
    tiktok: "#fyp #foryou #viral #tiktok #trending #foryoupage #xyzbca",
    instagram: "#reels #viral #instagram #trending #explore #fyp #video",
    facebook: "#facebook #viral #trending #video #share #watch",
  };

  const hashtags = platformTags[targetPlatform] ?? platformTags["youtube"];
  return { title, hashtags };
}
