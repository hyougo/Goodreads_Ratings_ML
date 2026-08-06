import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { optionalAuth, requireAuth, type AuthedRequest } from "../auth/middleware.js";

export const predictRouter = Router();

const predictSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  authors: z.string().trim().min(1, "Author is required"),
  language_code: z.string().trim().default("eng"),
  num_pages: z.coerce.number().int().min(0),
  ratings_count: z.coerce.number().int().min(0),
  text_reviews_count: z.coerce.number().int().min(0),
  publication_date: z.string().trim().min(1, "Publication date is required"),
  publisher: z.string().trim().default(""),
});

/** Proxy a prediction request to the Python ML service and store the result. */
predictRouter.post("/", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = predictSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const payload = parsed.data;

  let mlResult: { predicted_rating: number; model_name?: string };
  try {
    const response = await fetch(`${config.mlServiceUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: `Model service error: ${detail}` });
    }
    mlResult = (await response.json()) as { predicted_rating: number; model_name?: string };
  } catch {
    return res
      .status(503)
      .json({ error: "The prediction service is unavailable. Make sure the ML service is running." });
  }

  // Only record deliberate saves — the Predict page previews live on every
  // keystroke, and we don't want those trial values polluting the history.
  if (req.body?.persist === true) {
    prisma.prediction
      .create({
        data: {
          userId: req.user?.sub ?? null,
          title: payload.title,
          authors: payload.authors,
          input: JSON.stringify(payload),
          predictedRating: mlResult.predicted_rating,
        },
      })
      .catch(() => undefined);
  }

  return res.json({
    predictedRating: mlResult.predicted_rating,
    modelName: mlResult.model_name,
  });
});

const batchSchema = z.object({
  items: z
    .array(predictSchema)
    .min(1, "Provide at least one row")
    .max(2000, "Too many rows (max 2000)"),
});

/** Proxy a batch (CSV) prediction request to the Python ML service. */
predictRouter.post("/batch", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  try {
    const response = await fetch(`${config.mlServiceUrl}/predict/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: `Model service error: ${detail}` });
    }
    return res.json(await response.json());
  } catch {
    return res
      .status(503)
      .json({ error: "The prediction service is unavailable. Make sure the ML service is running." });
  }
});

predictRouter.get("/history", requireAuth, async (req: AuthedRequest, res) => {
  const predictions = await prisma.prediction.findMany({
    where: { userId: req.user!.sub },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return res.json({ items: predictions });
});
