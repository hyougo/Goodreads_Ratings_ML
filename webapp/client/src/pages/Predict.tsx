import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PredictInput, type BatchPredictionRow } from "../api/client";
import type { Book } from "../types";
import { formatCount, ratingColor, coverUrl, coverGradient } from "../lib/format";
import { StarRating } from "../components/StarRating";
import { Icon } from "../components/Icon";

const SAMPLE: PredictInput = {
  title: "The Name of the Wind (The Kingkiller Chronicle #1)",
  authors: "Patrick Rothfuss",
  language_code: "eng",
  num_pages: 662,
  ratings_count: 500000,
  text_reviews_count: 30000,
  publication_date: "3/27/2007",
  publisher: "DAW Books",
};

/* ---- small helpers ------------------------------------------------------- */

function yearFromDate(date: string): number {
  const m = date.match(/(\d{4})/);
  return m ? Number(m[1]) : 2010;
}


function bookToInput(b: Book): PredictInput {
  return {
    title: b.title,
    authors: b.authors,
    language_code: b.languageCode || "eng",
    num_pages: b.numPages || 0,
    ratings_count: b.ratingsCount || 0,
    text_reviews_count: b.textReviewsCount || 0,
    publication_date: b.publicationDate || "1/1/2015",
    publisher: b.publisher || "",
  };
}

/** Animated number that eases toward `target` (used for the big rating). */
function useCountUp(target: number | null, duration = 550): number {
  const [display, setDisplay] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);
  useEffect(() => {
    if (target === null) return;
    const start = fromRef.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (target - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

type CoverBook = Pick<Book, "title" | "isbn" | "isbn13">;

/** Book cover — shows the real Open Library image, or a titled gradient tile if
    that book has no cover, so something is always visible (like the catalog). */
function CoverCard({ book }: { book: CoverBook }) {
  const [failed, setFailed] = useState(false);
  const src = coverUrl(book, "M");
  return (
    <div className="animate-cover-in mx-auto mb-1 aspect-[2/3] w-24 overflow-hidden rounded-lg shadow-md ring-1 ring-black/5 sm:w-28">
      {src && !failed ? (
        <img
          src={src}
          alt={book.title}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center p-2 text-center text-[11px] font-semibold leading-tight text-white"
          style={{ background: coverGradient(book.title) }}
        >
          {book.title.slice(0, 40)}
        </div>
      )}
    </div>
  );
}

/** Inline validation message shown under an invalid field. */
function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="field-error">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" strokeLinecap="round" />
        <path d="M12 16h.01" strokeLinecap="round" />
      </svg>
      {msg}
    </p>
  );
}

/** Minimal CSV parser that respects quoted fields (commas inside titles). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
      return obj;
    });
}

function rowToInput(row: Record<string, string>): PredictInput {
  const num = (v: string, d: number) => (v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    title: row.title || "Untitled",
    authors: row.authors || "Unknown",
    language_code: row.language_code || "eng",
    num_pages: num(row.num_pages, 0),
    ratings_count: num(row.ratings_count, 0),
    text_reviews_count: num(row.text_reviews_count, 0),
    publication_date: row.publication_date || "1/1/2015",
    publisher: row.publisher || "",
  };
}

const CSV_COLUMNS = [
  "title", "authors", "language_code", "num_pages", "ratings_count",
  "text_reviews_count", "publication_date", "publisher", "predicted_rating",
];

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const TEMPLATE_CSV =
  "title,authors,language_code,num_pages,ratings_count,text_reviews_count,publication_date,publisher\n" +
  "The Hobbit,J.R.R. Tolkien,eng,366,3000000,50000,9/15/1937,Houghton Mifflin\n" +
  "1984,George Orwell,eng,328,3000000,60000,6/8/1949,Signet Classics\n";

/* ---- page ---------------------------------------------------------------- */

export function Predict() {
  const [form, setForm] = useState<PredictInput>(SAMPLE);
  const [result, setResult] = useState<number | null>(null);
  const [coverBook, setCoverBook] = useState<CoverBook | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const debounce = useRef<number>();
  const predictionRequest = useRef(0);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<Book[]>([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const suggestDebounce = useRef<number>();
  const typing = useRef(false); // true only while the user edits the title field

  const animated = useCountUp(result);

  const runPredict = useCallback((f: PredictInput) => {
    if (!f.title.trim() || !f.authors.trim()) return;
    const requestId = ++predictionRequest.current;
    setLoading(true);
    setError(null);

    // The ML service runs on free hosting and can take up to a minute to wake
    // from sleep. Retry automatically so the rating appears on its own instead
    // of leaving the user staring at an error.
    const isTransient = (msg: string) =>
      /waking up|failed to fetch|unavailable|network|load failed|timeout|50[234]/i.test(msg);

    const attempt = (n: number) => {
      if (predictionRequest.current !== requestId) return; // superseded by a newer edit
      api
        .predict(f)
        .then((res) => {
          if (predictionRequest.current !== requestId) return;
          setResult(res.predictedRating);
          setError(null);
          setLoading(false);
        })
        .catch((err) => {
          if (predictionRequest.current !== requestId) return;
          const msg = err instanceof Error ? err.message : "Prediction failed";
          if (isTransient(msg) && n < 6) {
            setError(null); // keep the calm "waking up" panel, not a red error
            window.setTimeout(() => attempt(n + 1), 4000);
          } else {
            setError(
              isTransient(msg)
                ? "The rating model isn't responding. It may be down — please try again in a minute."
                : msg,
            );
            setLoading(false);
          }
        });
    };
    attempt(0);
  }, []);

  // After a couple of seconds of loading, show a "waking up" hint (cold start).
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const t = window.setTimeout(() => setSlow(true), 2500);
    return () => window.clearTimeout(t);
  }, [loading]);

  // Live prediction: re-run (debounced) whenever any input changes.
  useEffect(() => {
    window.clearTimeout(debounce.current);
    // A rating only belongs to the exact set of values that produced it.
    // Clearing it prevents the previous book's score from being shown while
    // the new title is being typed and its prediction is still loading.
    predictionRequest.current += 1;
    setResult(null);
    setSaved(false);
    setLoading(false);
    debounce.current = window.setTimeout(() => runPredict(form), 350);
    return () => window.clearTimeout(debounce.current);
  }, [form, runPredict]);

  // Title autocomplete: search the catalog while the user types.
  useEffect(() => {
    if (!typing.current) return;
    const q = form.title.trim();
    window.clearTimeout(suggestDebounce.current);
    if (q.length < 2) {
      setSuggestions([]);
      setOpenSuggest(false);
      return;
    }
    suggestDebounce.current = window.setTimeout(() => {
      api
        .searchBooks({ q, pageSize: 8, sort: "relevance", track: 0 })
        .then((r) => {
          setSuggestions(r.items);
          setOpenSuggest(r.items.length > 0);
          // Reuse these results for the cover so typing doesn't fire a 2nd search.
          const match = r.items.find((b) => b.isbn13 || b.isbn) ?? r.items[0];
          if (match) setCoverBook(match);
        })
        .catch(() => {
          setSuggestions([]);
          setOpenSuggest(false);
        });
    }, 250);
    return () => window.clearTimeout(suggestDebounce.current);
  }, [form.title]);

  // Resolve a real cover image for whatever book is currently in the form —
  // works for the sample, manual typing, autocomplete picks and CSV rows alike.
  useEffect(() => {
    if (typing.current) return; // while typing, the autocomplete search sets the cover
    const title = form.title.trim();
    if (!title) {
      setCoverBook(null);
      return;
    }
    const q = title.split(/[(:]/)[0].trim() || title; // drop "(series)" / subtitle
    const handle = window.setTimeout(() => {
      api
        .searchBooks({ q, pageSize: 5, sort: "relevance", track: 0 })
        .then((r) => {
          const match = r.items.find((b) => b.isbn13 || b.isbn) ?? r.items[0];
          setCoverBook(match ?? null);
        })
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [form.title]);

  function set<K extends keyof PredictInput>(key: K, value: PredictInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Input constraints: which required fields are currently invalid.
  function errorFor(key: keyof PredictInput): string | null {
    switch (key) {
      case "title":
        return form.title.trim() ? null : "Title is required";
      case "authors":
        return form.authors.trim() ? null : "At least one author is required";
      case "publication_date":
        if (!form.publication_date.trim()) return "Publication date is required";
        return /\d{4}/.test(form.publication_date) ? null : "Enter a valid date (M/D/YYYY)";
      default:
        return null;
    }
  }
  // Only surface the error once the field has been touched (blurred).
  const showError = (key: keyof PredictInput) => (touched[key] ? errorFor(key) : null);
  const markTouched = (key: keyof PredictInput) => setTouched((t) => ({ ...t, [key]: true }));
  const cx = (key: keyof PredictInput) => `input ${showError(key) ? "input-error" : ""}`;

  // Fill the whole form from a picked catalog book (autocomplete).
  function pickBook(b: Book) {
    typing.current = false;
    setOpenSuggest(false);
    setSuggestions([]);
    setCoverBook(b); // instant; the effect refines it
    setForm(bookToInput(b));
  }

  // Fill the form from a CSV result row (the cover effect resolves its image).
  const pickRow = useCallback((row: BatchPredictionRow) => {
    typing.current = false;
    setOpenSuggest(false);
    const { predicted_rating, ...input } = row;
    setForm(input);
    setResult(predicted_rating);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Deliberately save the current prediction to the user's history.
  function savePrediction() {
    if (errorFor("title") || errorFor("authors") || errorFor("publication_date")) {
      setTouched({ title: true, authors: true, publication_date: true });
      return;
    }
    api
      .predict(form, true)
      .then(() => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
      })
      .catch(() => undefined);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="text-center">
        <span className="eyebrow">Rating estimator</span>
        <h1 className="section-title mt-4 text-4xl">Rating Predictor</h1>
        <p className="mx-auto mt-2 max-w-xl text-stone-500">
          Start typing a title to pick a real book, or enter details manually — the estimate updates <strong>live</strong>.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTouched({ title: true, authors: true, publication_date: true });
            runPredict(form);
          }}
          className="card space-y-4 p-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-forest-800">Book attributes</h2>
            <button
              type="button"
              className="rounded-full border border-parchment-300 px-3 py-1 text-xs font-semibold text-forest-600 hover:bg-parchment-100"
              onClick={() => { typing.current = false; setForm(SAMPLE); setCoverBook(null); }}
            >
              Fill sample
            </button>
          </div>

          <div className="relative">
            <label className="label">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              className={cx("title")}
              value={form.title}
              autoComplete="off"
              aria-invalid={!!showError("title")}
              placeholder="Start typing to search real books…"
              onChange={(e) => { typing.current = true; set("title", e.target.value); }}
              onFocus={() => { if (suggestions.length) setOpenSuggest(true); }}
              onBlur={() => { markTouched("title"); window.setTimeout(() => setOpenSuggest(false), 150); }}
              required
            />
            {openSuggest && suggestions.length > 0 && (
              <ul className="animate-drop-in absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-parchment-200 bg-white shadow-lg">
                {suggestions.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickBook(b)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-parchment-100"
                    >
                      <span className="truncate text-sm font-medium text-forest-800">{b.title}</span>
                      <span className="ml-auto shrink-0 truncate text-xs text-stone-400">
                        {b.firstAuthor || b.authors}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FieldError msg={showError("title")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">
                Author(s) <span className="text-red-500">*</span>
              </label>
              <input
                className={cx("authors")}
                value={form.authors}
                aria-invalid={!!showError("authors")}
                onChange={(e) => set("authors", e.target.value)}
                onBlur={() => markTouched("authors")}
                required
              />
              <FieldError msg={showError("authors")} />
            </div>
            <div>
              <label className="label">Publisher</label>
              <input className="input" value={form.publisher} onChange={(e) => set("publisher", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Language</label>
              <select className="input" value={form.language_code} onChange={(e) => set("language_code", e.target.value)}>
                {["eng", "en-US", "en-GB", "spa", "fre", "ger", "jpn", "ita", "por"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                Publication date <span className="text-red-500">*</span>
              </label>
              <input
                className={cx("publication_date")}
                placeholder="M/D/YYYY"
                value={form.publication_date}
                aria-invalid={!!showError("publication_date")}
                onChange={(e) => set("publication_date", e.target.value)}
                onBlur={() => markTouched("publication_date")}
              />
              <FieldError msg={showError("publication_date")} />
            </div>
          </div>

          {/* What-if sliders */}
          <div className="rounded-xl border border-parchment-200 bg-parchment-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-forest-700">
              <Icon name="gauge" size={16} /> What-if sliders
            </div>
            <div className="space-y-3">
              <Slider
                label="Pages" value={form.num_pages} min={0} max={1200} step={10}
                display={`${form.num_pages}`} onChange={(v) => set("num_pages", v)}
              />
              <Slider
                label="Ratings count" value={form.ratings_count} min={0} max={1_500_000} step={5000}
                display={formatCount(form.ratings_count)} onChange={(v) => set("ratings_count", v)}
              />
              <Slider
                label="Text reviews" value={form.text_reviews_count} min={0} max={60_000} step={500}
                display={formatCount(form.text_reviews_count)} onChange={(v) => set("text_reviews_count", v)}
              />
              <Slider
                label="Publication year" value={yearFromDate(form.publication_date)} min={1950} max={2024} step={1}
                display={`${yearFromDate(form.publication_date)}`}
                onChange={(v) => set("publication_date", `1/1/${v}`)}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </form>

        {/* result gauge */}
        <div className="card flex flex-col items-center justify-center gap-4 p-8 text-center lg:sticky lg:top-24 lg:self-start">
          {result === null ? (
            loading ? (
              <div className="flex flex-col items-center">
                <span className="mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-parchment-100">
                  <span className="h-7 w-7 animate-spin rounded-full border-2 border-forest-200 border-t-forest-500" />
                </span>
                <p className="text-sm font-medium text-forest-600">
                  {slow ? "Waking up the rating model…" : "Estimating rating…"}
                </p>
                {slow && (
                  <p className="mt-1 max-w-[15rem] text-xs text-stone-400">
                    Free hosting — the first prediction can take up to a minute.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center text-stone-400">
                <span className="animate-float mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-parchment-100 text-forest-400">
                  <Icon name="gauge" size={30} />
                </span>
                <p className="text-sm">Add a title & author to see a live prediction.</p>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {coverBook && (
                <div className="animate-float">
                  <CoverCard key={coverBook.isbn13 || coverBook.isbn || coverBook.title} book={coverBook} />
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                Predicted rating {loading && <span className="h-2 w-2 animate-ping rounded-full bg-forest-400" />}
              </div>
              <div
                key={result}
                className={`animate-pop-in font-display text-6xl font-bold tabular-nums ${ratingColor(animated)}`}
              >
                {animated.toFixed(2)}
              </div>
              <StarRating value={animated} size={26} />
              <div className="mx-auto mt-2 h-2.5 w-48 overflow-hidden rounded-full bg-parchment-200">
                <div
                  className="shimmer-bar h-full rounded-full transition-all duration-500"
                  style={{ width: `${(animated / 5) * 100}%` }}
                />
              </div>
              <p className="pt-1 text-xs text-stone-400">Updates live as you edit the inputs.</p>
              <button
                type="button"
                onClick={savePrediction}
                disabled={saved}
                className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  saved
                    ? "animate-pop-in bg-forest-100 text-forest-700"
                    : "bg-forest-700 text-white hover:-translate-y-0.5 hover:bg-forest-800 hover:shadow-glow"
                }`}
              >
                {saved ? "✓ Saved to history" : "Save to history"}
              </button>
            </div>
          )}
        </div>
      </div>

      <BatchPredict onPickRow={pickRow} />
    </div>
  );
}

function Slider(props: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-stone-600">{props.label}</span>
        <span className="font-semibold tabular-nums text-forest-700">{props.display}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-forest-500"
      />
    </div>
  );
}

/* ---- CSV batch prediction ------------------------------------------------ */

function BatchPredict({ onPickRow }: { onPickRow: (row: BatchPredictionRow) => void }) {
  const [rows, setRows] = useState<BatchPredictionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setRows([]);
    try {
      const text = await file.text();
      const parsed = parseCsv(text).map(rowToInput);
      if (!parsed.length) throw new Error("No rows found in the file.");
      if (parsed.length > 2000) throw new Error(`Too many rows (${parsed.length}). Max is 2000.`);
      // Retry while the free-tier ML service wakes up, like the live predictor.
      const isTransient = (m: string) =>
        /waking up|failed to fetch|unavailable|network|load failed|timeout|50[234]/i.test(m);
      let res: Awaited<ReturnType<typeof api.predictBatch>> | null = null;
      for (let n = 0; n < 6; n++) {
        try {
          res = await api.predictBatch(parsed);
          break;
        } catch (err) {
          const m = err instanceof Error ? err.message : "";
          if (!isTransient(m) || n === 5) throw err;
          setError("Waking up the rating model… retrying automatically.");
          await new Promise((r) => setTimeout(r, 4000));
        }
      }
      if (res) {
        setError(null);
        setRows(res.predictions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch prediction failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-forest-800">Batch prediction (CSV)</h2>
          <p className="text-sm text-stone-500">Upload a CSV of books and score them all at once.</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-parchment-300 px-3 py-1 text-xs font-semibold text-forest-600 hover:bg-parchment-100"
          onClick={() => download("book_template.csv", TEMPLATE_CSV)}
        >
          Download template
        </button>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        }}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-forest-400 bg-forest-50" : "border-parchment-300 bg-parchment-50 hover:border-forest-300"
        }`}
      >
        <span className="mb-2 grid h-12 w-12 place-items-center rounded-xl bg-white text-forest-500 shadow-sm">
          <Icon name="gauge" size={22} />
        </span>
        <p className="text-sm font-semibold text-forest-700">
          {busy ? "Scoring…" : "Drop a CSV here, or click to browse"}
        </p>
        <p className="mt-1 text-xs text-stone-400">
          Columns: title, authors, language_code, num_pages, ratings_count, text_reviews_count, publication_date, publisher
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-forest-700">
              {rows.length} results — <span className="font-normal text-stone-500">click a row to load it above</span>
            </span>
            <button
              type="button"
              className="btn-primary px-4 py-1.5 text-sm"
              onClick={() => download("predictions.csv", toCsv(rows as unknown as Record<string, unknown>[], CSV_COLUMNS))}
            >
              Download results (CSV)
            </button>
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-parchment-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-parchment-100 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Author</th>
                  <th className="px-3 py-2 text-right">Rating</th>
                  <th className="px-3 py-2">Stars</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => onPickRow(r)}
                    title="Load this book into the form above"
                    className="cursor-pointer border-t border-parchment-200 transition-colors hover:bg-forest-50"
                  >
                    <td className="max-w-xs truncate px-3 py-2 font-medium text-forest-700">{r.title}</td>
                    <td className="max-w-[10rem] truncate px-3 py-2 text-stone-500">{r.authors}</td>
                    <td className={`px-3 py-2 text-right font-bold tabular-nums ${ratingColor(r.predicted_rating)}`}>
                      {r.predicted_rating.toFixed(2)}
                    </td>
                    <td className="px-3 py-2"><StarRating value={r.predicted_rating} size={15} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 200 && (
            <p className="text-xs text-stone-400">Showing the first 200 rows — download the CSV for all {rows.length}.</p>
          )}
        </div>
      )}
    </div>
  );
}
