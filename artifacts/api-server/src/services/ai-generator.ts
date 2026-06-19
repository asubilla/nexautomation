export interface GeneratedContent {
  title: string;
  hashtags: string;
}

export function generateContent(originalTitle: string, targetPlatform: string): GeneratedContent {
  const hooks = [
    "You Won't Believe", "Watch This", "Incredible", "Insane", "Mind-Blowing",
    "This Changes Everything", "Nobody Expected", "Going Viral", "Shocking",
    "Must Watch", "Unbelievable", "Epic", "Legendary", "Breaking",
  ];

  const endings = [
    "😱", "🔥", "💯", "🚀", "⚡", "😮", "👀", "🎯", "💪", "🌟",
  ];

  const hook = hooks[Math.floor(Math.random() * hooks.length)];
  const ending = endings[Math.floor(Math.random() * endings.length)];

  const cleaned = originalTitle
    .replace(/[|#@]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  const title = `${hook}: ${cleaned} ${ending}`;

  const platformTags: Record<string, string[]> = {
    youtube: ["#youtube", "#viral", "#trending", "#shorts", "#fyp", "#subscribe", "#video"],
    tiktok: ["#fyp", "#foryou", "#viral", "#tiktok", "#trending", "#foryoupage", "#xyzbca"],
    instagram: ["#reels", "#viral", "#instagram", "#trending", "#explore", "#fyp", "#video"],
    facebook: ["#facebook", "#viral", "#trending", "#video", "#share", "#watch"],
  };

  const tags = platformTags[targetPlatform] ?? platformTags["youtube"];
  const hashtags = tags.join(" ");

  return { title, hashtags };
}
