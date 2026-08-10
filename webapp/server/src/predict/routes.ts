import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { optionalAuth, requireAuth, type AuthedRequest } from "../auth/middleware.js";

export const predictRouter = Router();

// Friendly, HTML-free message shown when the model service can't be reached.
const ML_UNAVAILABLE =
  "The rating model is waking up (free hosting) — please try again in a few seconds.";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call the Python ML service, riding out a cold start. Render's free tier spins
 * the service down after ~15 min of inactivity, so the first request wakes it
 * and gets a 502/503 HTML error page for ~30-60s. We keep retrying (up to a
 * deadline) so the user just waits a little instead of seeing that raw HTML.
 */
async function callMlService(path: string, payload: unknown): Promise<Response | null> {
  const deadline = Date.now() + 55_000; // total budget to wait out a cold start
  let firstTry = true;
  while (firstTry || Date.now() < deadline) {
    firstTry = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000); // per-attempt cap
    try {
      const response = await fetch(`${config.mlServiceUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      // 502/503/504 = still waking up on the free tier — wait and retry.
      if ((response.status === 502 || response.status === 503 || response.status === 504) && Date.now() < deadline) {
        await sleep(3000);
        continue;
      }
      return response;
    } catch {
      clearTimeout(timer);
      if (Date.now() < deadline) {
        await sleep(3000);
        continue;
      }
    }
  }
  return null; // gave up — service is (still) unavailable
}

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

  const response = await callMlService("/predict", payload);
  if (!response || !response.ok) {
    return res.status(503).json({ error: ML_UNAVAILABLE });
  }
  let mlResult: { predicted_rating: number; model_name?: string };
  try {
    mlResult = (await response.json()) as { predicted_rating: number; model_name?: string };
  } catch {
    return res.status(503).json({ error: ML_UNAVAILABLE });
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
  const response = await callMlService("/predict/batch", parsed.data);
  if (!response || !response.ok) {
    return res.status(503).json({ error: ML_UNAVAILABLE });
  }
  try {
    return res.json(await response.json());
  } catch {
    return res.status(503).json({ error: ML_UNAVAILABLE });
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

/** Delete a single prediction (scoped to the owner). */
predictRouter.delete("/history/:id", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.prediction.deleteMany({
    where: { id: req.params.id, userId: req.user!.sub },
  });
  return res.json({ ok: true });
});

/** Clear the whole prediction history for the current user. */
predictRouter.delete("/history", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.prediction.deleteMany({ where: { userId: req.user!.sub } });
  return res.json({ ok: true });
});
