import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Book } from "../types";
import { api } from "../api/client";
import { BookCover } from "../components/BookCover";
import { StarRating } from "../components/StarRating";
import { formatCount, ratingColor } from "../lib/format";

interface QuickViewValue {
  open: (book: Book) => void;
  close: () => void;
}

const QuickViewContext = createContext<QuickViewValue | undefined>(undefined);

/**
 * Opens a book's details in an in-page modal (no navigation), with a smooth
 * zoom-in animation and a "you might also like" row that re-opens in place.
 */
export function QuickViewProvider({ children }: { children: ReactNode }) {
  const [book, setBook] = useState<Book | null>(null);
  const [similar, setSimilar] = useState<Book[]>([]);

  function open(b: Book) {
    setBook(b);
    setSimilar([]);
    // Best-effort: fetch related books (this also records a view server-side).
    api.book(b.id).then((r) => setSimilar(r.similar)).catch(() => setSimilar([]));
  }
  function close() {
    setBook(null);
  }

  // Close on Escape and lock background scrolling while the modal is open.
  useEffect(() => {
    if (!book) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [book]);

  return (
    <QuickViewContext.Provider value={{ open, close }}>
      {children}
      {book && <QuickViewModal book={book} similar={similar} onClose={close} onPick={open} />}
    </QuickViewContext.Provider>
  );
}

export function useQuickView() {
  const ctx = useContext(QuickViewContext);
  if (!ctx) throw new Error("useQuickView must be used within QuickViewProvider");
  return ctx;
}

function QuickViewModal({
  book,
  similar,
  onClose,
  onPick,
}: {
  book: Book;
  similar: Book[];
  onClose: () => void;
  onPick: (b: Book) => void;
}) {
  const meta: { label: string; value: string }[] = [
    { label: "Pages", value: book.numPages ? String(book.numPages) : "—" },
    { label: "Published", value: book.publicationYear ? String(book.publicationYear) : book.publicationDate || "—" },
    { label: "Language", value: book.languageCode || "—" },
    { label: "Publisher", value: book.publisher || "—" },
    { label: "Ratings", value: formatCount(book.ratingsCount) },
    { label: "Reviews", value: formatCount(book.textReviewsCount) },
  ];

  return (
    <div
      className="animate-backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,42,32,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={book.title}
    >
      <div
        className="animate-modal-in relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-parchment-200 bg-parchment-50 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/80 text-forest-700 shadow-sm backdrop-blur transition hover:rotate-90 hover:bg-white hover:text-forest-900"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:p-8">
          <BookCover
            book={book}
            size="L"
            className="animate-cover-in mx-auto aspect-[2/3] w-40 shrink-0 rounded-xl shadow-md ring-1 ring-black/5 sm:mx-0"
            initialsSize={40}
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-bold leading-tight text-forest-800">{book.title}</h2>
            <p className="mt-1 text-sm text-stone-500">{book.authors}</p>
            <div className="mt-3 flex items-center gap-2">
              <StarRating value={book.averageRating} size={22} />
              <span className={`font-display text-xl font-bold ${ratingColor(book.averageRating)}`}>
                {book.averageRating.toFixed(2)}
              </span>
              <span className="text-xs text-stone-400">/ 5</span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {meta.map((m) => (
                <div key={m.label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{m.label}</dt>
                  <dd className="truncate text-sm font-medium text-forest-700" title={m.value}>{m.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to={`/book/${book.id}`} onClick={onClose} className="btn-primary px-4 py-2 text-sm">
                Open full page →
              </Link>
              <Link to="/predict" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
                Predict a rating
              </Link>
            </div>
          </div>
        </div>

        {similar.length > 0 && (
          <div className="border-t border-parchment-200 bg-white/60 px-6 py-4 sm:px-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">You might also like</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {similar.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPick(s)}
                  title={s.title}
                  className="group shrink-0"
                  aria-label={`Quick view: ${s.title}`}
                >
                  <BookCover
                    book={s}
                    className="aspect-[2/3] w-16 rounded-md shadow-sm ring-1 ring-black/5 transition duration-300 group-hover:-translate-y-1.5 group-hover:shadow-md"
                    initialsSize={18}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
