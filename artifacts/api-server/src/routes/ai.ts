import { Router, type IRouter } from "express";
import { GenerateContentBody } from "@workspace/api-zod";
import { generateContent } from "../services/ai-generator";

const router: IRouter = Router();

router.post("/ai/generate", async (req, res): Promise<void> => {
  const parsed = GenerateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { originalTitle, platform, niche } = parsed.data;
  const result = await generateContent(originalTitle, platform, niche);
  res.json(result);
});

export default router;
