import { logger } from "../lib/logger";

export interface GeneratedContent {
  title: string;        // "Part 1 | Catchy Hook Title"
  description: string;  // Full description with context + hashtags
  hashtags: string;     // "#fyp #viral ..."
  tags: string[];       // ["tag1", "tag2"] for YouTube
  location?: string;
}

// ─── OpenRouter call ──────────────────────────────────────────────────────────

async function callOpenRouter(prompt: string): Promise<string | null> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    logger.warn("OPENROUTER_API_KEY not set — using fallback");
    return null;
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/nex-automation",
        "X-Title": "Nex Automation",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        max_tokens: 600,
        temperature: 0.85,
        messages: [
          {
            role: "system",
            content: "You are a viral social media content expert. Always respond with ONLY valid JSON — no markdown, no explanation, no code block.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "OpenRouter API error");
      return null;
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? null;
  } catch (err) {
    logger.warn({ err }, "OpenRouter fetch failed");
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate full content for a clip upload.
 *
 * @param originalTitle  - Source video ka title
 * @param targetPlatform - youtube | tiktok | instagram | facebook
 * @param partNumber     - 1, 2, 3, 4 (series numbering)
 * @param clipHint       - Optional: AI clip title/hook from clipping pipeline
 */
export async function generateContent(
  originalTitle: string,
  targetPlatform: string,
  partNumberOrNiche: number | string | null = 1,
  clipHint?: string | null,
): Promise<GeneratedContent> {
  const partNumber = typeof partNumberOrNiche === "number" ? partNumberOrNiche : 1;
  const niche = typeof partNumberOrNiche === "string" ? partNumberOrNiche : null;

  const seriesLabel = `Part ${partNumber}`;
  const contextTitle = clipHint ?? originalTitle;

  const prompt = `You are creating viral short-form content for ${targetPlatform}.

Source video: "${originalTitle}"
${niche ? `Niche: "${niche}"\n` : ""}Clip context: "${contextTitle}"
Series label: "${seriesLabel}"
Platform: ${targetPlatform}

Generate:
1. title: Catchy hook title in format "Part ${partNumber} | <hook>" — max 80 chars, no emoji in Part label
2. description: 2-3 sentence engaging description about the clip content. End with a call-to-action like "Follow for more!" or "Like & Subscribe!". Max 300 chars.
3. hashtags: 12-15 space-separated hashtags optimized for ${targetPlatform}. Include #fyp #foryou for TikTok/Instagram, #shorts for YouTube.
4. tags: Array of 10 keyword strings (no # prefix) for YouTube SEO. Short single/double word tags.
5. location: A trending popular city relevant to content (e.g. "New York, USA" or "Dubai, UAE")

Respond ONLY with this JSON:
{
  "title": "Part ${partNumber} | ...",
  "description": "...",
  "hashtags": "#... #... #...",
  "tags": ["tag1", "tag2", ...],
  "location": "..."
}`;

  const raw = await callOpenRouter(prompt);

  if (raw) {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          title?: string;
          description?: string;
          hashtags?: string | string[];
          tags?: string[];
          location?: string;
        };

        const title = typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim() : null;

        const description = typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim() : null;

        const hashtagsRaw = parsed.hashtags;
        const hashtags = Array.isArray(hashtagsRaw)
          ? hashtagsRaw.join(" ")
          : typeof hashtagsRaw === "string" ? hashtagsRaw.trim() : null;

        const tags = Array.isArray(parsed.tags)
          ? parsed.tags.filter((t): t is string => typeof t === "string").slice(0, 15)
          : [];

        const location = typeof parsed.location === "string" && parsed.location.trim()
          ? parsed.location.trim() : undefined;

        if (title && hashtags) {
          logger.info({ title, platform: targetPlatform, part: partNumber }, "AI content generated");
          return {
            title,
            description: description ?? `${title} | Don't miss out — follow for more!`,
            hashtags,
            tags,
            location: location ?? (targetPlatform === "tiktok" ? "London, UK" : undefined),
          };
        }
      }
    } catch (err) {
      logger.warn({ err, raw }, "Failed to parse AI JSON response");
    }
  }

  return fallbackGenerate(originalTitle, targetPlatform, partNumber);
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function fallbackGenerate(
  originalTitle: string,
  targetPlatform: string,
  partNumber: number,
): GeneratedContent {
  const hooks = [
    "You Won't Believe This", "Watch Till The End", "Mind-Blowing Moment",
    "This Changes Everything", "Nobody Expected This", "Must Watch",
    "Insane Reaction", "Epic Moment", "Going Viral", "Shocking Truth",
  ];
  const hook = hooks[Math.floor(Math.random() * hooks.length)];
  const cleaned = originalTitle.replace(/[|#@]/g, "").replace(/\s+/g, " ").trim().slice(0, 50);

  const title = `Part ${partNumber} | ${hook}: ${cleaned}`;

  const descMap: Record<string, string> = {
    youtube: `${hook} — ${cleaned}. Watch the full series! Like, comment & subscribe for daily content 🔔`,
    tiktok: `${hook} 🔥 ${cleaned} | Part ${partNumber} of the series! Follow for more viral clips!`,
    instagram: `${hook} ✨ ${cleaned} | Series Part ${partNumber}. Follow & share with friends!`,
    facebook: `${hook} — ${cleaned} | Part ${partNumber}. Like & follow our page for daily videos!`,
  };

  const hashtagMap: Record<string, string> = {
    youtube: "#youtube #viral #trending #shorts #subscribe #video #fyp #content #reels #explore #youtubeshorts",
    tiktok: "#fyp #foryou #viral #tiktok #trending #foryoupage #xyzbca #tiktokdaily #viralvideo #trending",
    instagram: "#reels #viral #instagram #trending #explore #fyp #instareels #viralreels #video #share",
    facebook: "#facebook #viral #trending #video #share #watch #fbreels #facebookvideo #viralvideo",
  };

  const tagsMap: Record<string, string[]> = {
    youtube: ["viral", "shorts", "trending", "funny", "amazing", "must watch", "daily", "clips", "moments", "top"],
    tiktok: ["viral", "fyp", "trending", "funny", "tiktok", "clips", "moments", "daily", "top", "amazing"],
    instagram: ["reels", "viral", "trending", "instagram", "clips", "moments", "daily", "explore", "top", "amazing"],
    facebook: ["viral", "trending", "video", "facebook", "clips", "moments", "daily", "share", "top", "amazing"],
  };

  return {
    title,
    description: descMap[targetPlatform] ?? descMap["youtube"],
    hashtags: hashtagMap[targetPlatform] ?? hashtagMap["youtube"],
    tags: tagsMap[targetPlatform] ?? tagsMap["youtube"],
  };
}
