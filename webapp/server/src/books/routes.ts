import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { optionalAuth, requireAuth, type AuthedRequest } from "../auth/middleware.js";

export const booksRouter = Router();

const SORT_FIELDS = {
  relevance: "ratingsCount",
  rating: "averageRating",
  popularity: "ratingsCount",
  reviews: "textReviewsCount",
  pages: "numPages",
  year: "publicationYear",
  title: "title",
} as const;

const searchSchema = z.object({
  q: z.string().trim().optional().default(""),
  language: z.string().trim().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxRating: z.coerce.number().min(0).max(5).optional(),
  minPages: z.coerce.number().int().min(0).optional(),
  maxPages: z.coerce.number().int().min(0).optional(),
  minYear: z.coerce.number().int().optional(),
  maxYear: z.coerce.number().int().optional(),
  sort: z.enum(["relevance", "rating", "popularity", "reviews", "pages", "year", "title"]).optional().default("relevance"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(60).optional().default(24),
});

/** Advanced catalog search with text matching, filters, sorting and pagination. */
booksRouter.get("/", optionalAuth, async (req: AuthedRequest, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
  }
  const p = parsed.data;

  const and: Prisma.BookWhereInput[] = [];
  if (p.q) {
    // `insensitive` mode makes it match any substring (start / middle / end)
    // regardless of case — Postgres `contains` is case-sensitive by default.
    and.push({
      OR: [
        { title: { contains: p.q, mode: "insensitive" } },
        { authors: { contains: p.q, mode: "insensitive" } },
        { publisher: { contains: p.q, mode: "insensitive" } },
      ],
    });
  }
  if (p.language) and.push({ languageCode: p.language });
  if (p.minRating !== undefined) and.push({ averageRating: { gte: p.minRating } });
  if (p.maxRating !== undefined) and.push({ averageRating: { lte: p.maxRating } });
  if (p.minPages !== undefined) and.push({ numPages: { gte: p.minPages } });
  if (p.maxPages !== undefined) and.push({ numPages: { lte: p.maxPages } });
  if (p.minYear !== undefined) and.push({ publicationYear: { gte: p.minYear } });
  if (p.maxYear !== undefined) and.push({ publicationYear: { lte: p.maxYear } });

  const where: Prisma.BookWhereInput = and.length ? { AND: and } : {};
  const orderBy: Prisma.BookOrderByWithRelationInput = { [SORT_FIELDS[p.sort]]: p.order };

  const [total, items] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.findMany({
      where,
      orderBy,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
  ]);

  // Record the search for logged-in users so recommendations can learn from it.
  if (req.user && (p.q || p.language || p.minRating !== undefined)) {
    prisma.searchEvent
      .create({
        data: {
          userId: req.user.sub,
          query: p.q,
          filters: JSON.stringify({
            language: p.language,
            minRating: p.minRating,
            maxRating: p.maxRating,
            minPages: p.minPages,
            maxPages: p.maxPages,
          }),
        },
      })
      .catch(() => undefined);
  }

  return res.json({
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
    items,
  });
});

/** Distinct language codes with counts, for the filter UI. */
booksRouter.get("/facets", async (_req, res) => {
  const languages = await prisma.book.groupBy({
    by: ["languageCode"],
    _count: { languageCode: true },
    orderBy: { _count: { languageCode: "desc" } },
  });
  const agg = await prisma.book.aggregate({
    _min: { publicationYear: true, numPages: true },
    _max: { publicationYear: true, numPages: true },
  });
  return res.json({
    languages: languages.map((l) => ({ code: l.languageCode, count: l._count.languageCode })),
    yearRange: [agg._min.publicationYear, agg._max.publicationYear],
    pagesRange: [agg._min.numPages, agg._max.numPages],
  });
});

booksRouter.get("/:id", optionalAuth, async (req: AuthedRequest, res) => {
  const book = await prisma.book.findUnique({ where: { id: req.params.id } });
  if (!book) return res.status(404).json({ error: "Book not found" });

  if (req.user) {
    prisma.bookView
      .create({ data: { userId: req.user.sub, bookId: book.id } })
      .catch(() => undefined);
  }

  // A few similar books by the same first author or language, for the detail page.
  const similar = await prisma.book.findMany({
    where: {
      id: { not: book.id },
      OR: [{ firstAuthor: book.firstAuthor }, { languageCode: book.languageCode }],
    },
    orderBy: { ratingsCount: "desc" },
    take: 6,
  });

  return res.json({ book, similar });
});

booksRouter.post("/:id/favorite", requireAuth, async (req: AuthedRequest, res) => {
  const book = await prisma.book.findUnique({ where: { id: req.params.id } });
  if (!book) return res.status(404).json({ error: "Book not found" });

  const existing = await prisma.favorite.findUnique({
    where: { userId_bookId: { userId: req.user!.sub, bookId: book.id } },
  });
  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return res.json({ favorited: false });
  }
  await prisma.favorite.create({ data: { userId: req.user!.sub, bookId: book.id } });
  return res.json({ favorited: true });
});

booksRouter.get("/me/favorites", requireAuth, async (req: AuthedRequest, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: req.user!.sub },
    orderBy: { createdAt: "desc" },
    include: { book: true },
  });
  return res.json({ items: favorites.map((f) => f.book) });
});
