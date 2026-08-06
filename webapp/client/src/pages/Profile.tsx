import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Book } from "../types";
import { BookCard } from "../components/BookCard";
import { useAuth } from "../context/AuthContext";
import { ratingColor } from "../lib/format";

interface HistoryData {
  searches: { id: string; query: string; at: string }[];
  views: { id: string; book: Book; at: string }[];
}
interface PredRow {
  id: string;
  title: string;
  authors: string;
  predictedRating: number;
  createdAt: string;
}

export function Profile() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Book[]>([]);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [predictions, setPredictions] = useState<PredRow[]>([]);

  useEffect(() => {
    api.favorites().then((r) => setFavorites(r.items)).catch(() => undefined);
    api.history().then(setHistory).catch(() => undefined);
    api.predictHistory().then((r) => setPredictions(r.items)).catch(() => undefined);
  }, []);

  if (!user) return null;

  // Clean up "Recent searches": drop empties and placeholder junk, de-duplicate
  // case-insensitively, and collapse typing prefixes (keep "The Name of the Wind"
  // but hide the "The Name", "The Name of the Win" it was typed through).
  const JUNK = new Set(["untitled", "unknown"]);
  const visibleSearches = (() => {
    const kept: { id: string; query: string }[] = [];
    const seen = new Set<string>();
    for (const s of history?.searches ?? []) {
      const q = s.query.trim();
      const lc = q.toLowerCase();
      if (!q || JUNK.has(lc) || seen.has(lc)) continue;
      // Skip if it's just a prefix of a longer query we've already kept.
      if (kept.some((k) => k.query.toLowerCase().startsWith(lc) && k.query.length > q.length)) continue;
      seen.add(lc);
      kept.push({ id: s.id, query: q });
    }
    return kept;
  })();

  // Show each book only once — keep the most recent prediction per title + author,
  // and hide placeholder rows from earlier CSV / typing tests.
  const uniquePredictions = predictions
    .filter((p) => !JUNK.has(p.title.trim().toLowerCase()))
    .filter((p, i, arr) => {
      const key = `${p.title.trim().toLowerCase()}|${p.authors.trim().toLowerCase()}`;
      return (
        arr.findIndex(
          (q) => `${q.title.trim().toLowerCase()}|${q.authors.trim().toLowerCase()}` === key,
        ) === i
      );
    });

  const predKey = (p: PredRow) => `${p.title.trim().toLowerCase()}|${p.authors.trim().toLowerCase()}`;

  // Remove every saved prediction for this title + author (not just the shown row).
  async function removePrediction(row: PredRow) {
    const ids = predictions.filter((p) => predKey(p) === predKey(row)).map((p) => p.id);
    setPredictions((prev) => prev.filter((p) => !ids.includes(p.id)));
    await Promise.all(ids.map((id) => api.deletePrediction(id).catch(() => undefined)));
  }

  async function clearPredictions() {
    setPredictions([]);
    await api.clearPredictionHistory().catch(() => undefined);
  }

  return (
    <div className="space-y-10">
      <div className="card flex items-center gap-4 p-6">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-forest-700 font-display text-2xl font-bold text-gold-300 shadow-glow">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-forest-800">{user.name}</h1>
          <p className="text-sm text-stone-500">{user.email}</p>
          <p className="text-xs text-stone-400">Member since {new Date(user.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <Section title="Recent searches">
        {visibleSearches.length ? (
          <div className="flex flex-wrap gap-2">
            {visibleSearches.map((s) => (
              <Link key={s.id} to={`/catalog?q=${encodeURIComponent(s.query)}`} className="chip hover:bg-parchment-200">
                {s.query}
              </Link>
            ))}
          </div>
        ) : (
          <Empty text="No searches yet." />
        )}
      </Section>

      <Section
        title="Prediction history"
        action={
          uniquePredictions.length ? (
            <button
              onClick={clearPredictions}
              className="text-xs font-semibold text-red-500 hover:text-red-600"
            >
              Clear all
            </button>
          ) : null
        }
      >
        {uniquePredictions.length ? (
          <div className="card divide-y divide-parchment-200">
            {uniquePredictions.map((p) => (
              <div key={p.id} className="group flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-forest-800">{p.title}</div>
                  <div className="truncate text-xs text-stone-400">{p.authors}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`font-display text-xl font-bold ${ratingColor(p.predictedRating)}`}>
                    {p.predictedRating.toFixed(2)}
                  </div>
                  <button
                    onClick={() => removePrediction(p)}
                    title="Remove from history"
                    aria-label="Remove from history"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-stone-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="No predictions yet." />
        )}
      </Section>

      <Section title="Recently viewed">
        {history?.views.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {history.views.slice(0, 6).map((v) => (
              <BookCard key={v.id} book={v.book} />
            ))}
          </div>
        ) : (
          <Empty text="No viewed books yet." />
        )}
      </Section>

      <Section title="Favorites">
        {favorites.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {favorites.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        ) : (
          <Empty text="No favorites saved yet." />
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-forest-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-stone-400">{text}</p>;
}
