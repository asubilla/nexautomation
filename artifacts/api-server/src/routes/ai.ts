import { Router, type IRouter } from "express";
import { GenerateContentBody } from "@workspace/api-zod";

const router: IRouter = Router();

const PLATFORM_HASHTAGS: Record<string, string[]> = {
  youtube: ["#youtube", "#viral", "#trending", "#subscribe", "#video"],
  instagram: ["#instagram", "#reels", "#viral", "#explore", "#content"],
  facebook: ["#facebook", "#video", "#trending", "#viral", "#social"],
  tiktok: ["#tiktok", "#viral", "#fyp", "#foryou", "#trending"],
};

const TITLE_TEMPLATES = [
  "You Won't Believe This {topic}!",
  "The Truth About {topic} Nobody Tells You",
  "{topic}: Everything You Need to Know in 2026",
  "I Tried {topic} For 30 Days — Here's What Happened",
  "Why {topic} Is Changing Everything",
  "The Ultimate Guide to {topic}",
  "{topic} That Will Blow Your Mind",
  "How {topic} Transformed My Life",
  "Secrets of {topic} Revealed",
  "Top 10 Things About {topic}",
];

function extractTopic(title: string): string {
  const cleaned = title
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(w => w.length > 3);
  if (words.length === 0) return title;
  const start = Math.floor(Math.random() * Math.max(1, words.length - 3));
  return words.slice(start, start + 3).join(" ");
}

function generateTitle(originalTitle: string): string {
  const topic = extractTopic(originalTitle);
  const template = TITLE_TEMPLATES[Math.floor(Math.random() * TITLE_TEMPLATES.length)];
  return template.replace("{topic}", topic);
}

function generateHashtags(platform: string, originalTitle: string, niche?: string | null): string[] {
  const base = PLATFORM_HASHTAGS[platform] ?? PLATFORM_HASHTAGS.youtube;
  const words = (originalTitle + " " + (niche ?? ""))
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 4)
    .slice(0, 5)
    .map(w => `#${w}`);
  const combined = [...new Set([...base, ...words])].slice(0, 15);
  return combined;
}

router.post("/ai/generate", async (req, res): Promise<void> => {
  const parsed = GenerateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { originalTitle, platform, niche } = parsed.data;

  // Check if OpenAI is available
  const aiBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const aiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

  if (aiBaseUrl && aiApiKey) {
    try {
      const response = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${aiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          max_completion_tokens: 512,
          messages: [
            {
              role: "system",
              content: `You are a social media content expert. Generate a viral title and relevant hashtags for a ${platform} video. Respond ONLY with valid JSON in this format: {"title": "string", "hashtags": ["string"]}`,
            },
            {
              role: "user",
              content: `Original title: "${originalTitle}"\nPlatform: ${platform}\n${niche ? `Niche: ${niche}` : ""}\n\nGenerate a catchy viral title and 10-15 hashtags. The title must be engaging and optimized for ${platform}. Return only the JSON.`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        const content = data.choices[0]?.message?.content ?? "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { title?: string; hashtags?: string[] };
          if (parsed.title && Array.isArray(parsed.hashtags)) {
            res.json({ title: parsed.title, hashtags: parsed.hashtags });
            return;
          }
        }
      }
    } catch (_e) {
      // Fall through to template-based generation
    }
  }

  // Template-based fallback
  const title = generateTitle(originalTitle);
  const hashtags = generateHashtags(platform, originalTitle, niche);
  res.json({ title, hashtags });
});

export default router;
