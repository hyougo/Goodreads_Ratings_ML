import { useEffect } from "react";
import type { Book } from "../types";
import { formatCount, ratingColor } from "../lib/format";
import { BookCover } from "./BookCover";
import { StarRating } from "./StarRating";

interface Props {
  book: Book;
  onClose: () => void;
}

/** A focused, in-page view so readers can inspect a book without leaving the list. */
export function BookQuickView({ book, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.classList.add("overflow-hidden");
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("overflow-hidden");
    };
  }, [onClose]);

  return (
    <div
      className="quick-view-backdrop fixed inset-0 z-50 grid place-items-center bg-forest-900/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`book-title-${book.id}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="quick-view-panel relative grid max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-parchment-50 shadow-2xl md:grid-cols-[260px_1fr]">
        <button
          type="button"
          className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-xl text-forest-800 shadow-sm transition hover:scale-110 hover:bg-gold-100"
          onClick={onClose}
          aria-label="Close book details"
        >
          ×
        </button>

        <div className="min-h-72 bg-forest-800 p-8 md:min-h-full">
          <BookCover book={book} size="L" className="quick-view-cover mx-auto h-full min-h-72 max-w-52 rounded-xl shadow-2xl" initialsSize={56} />
        </div>

        <div className="p-7 sm:p-10">
          <div className="mb-4 flex flex-wrap gap-2 pr-10">
            <span className="chip">{book.languageCode}</span>
            {book.publicationYear && <span className="chip">{book.publicationYear}</span>}
            <span className="chip">{book.numPages} pages</span>
          </div>
          <h2 id={`book-title-${book.id}`} className="font-display text-3xl font-bold leading-tight text-forest-800 sm:text-4xl">
            {book.title}
          </h2>
          <p className="mt-3 text-lg text-stone-600">by {book.authors.replace(/\//g, ", ")}</p>
          <p className="mt-2 text-sm text-stone-500">
            Published by {book.publisher || "Unknown"} · {book.publicationDate || "Publication date unavailable"}
          </p>

          <div className="my-7 h-px bg-parchment-200" />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <StarRating value={book.averageRating} size={22} />
              <span className={`text-2xl font-bold ${ratingColor(book.averageRating)}`}>
                {book.averageRating.toFixed(2)}
              </span>
            </div>
            <p className="text-sm text-stone-500">
              <span className="font-semibold text-forest-700">{formatCount(book.ratingsCount)}</span> ratings · {formatCount(book.textReviewsCount)} reviews
            </p>
          </div>

          <div className="mt-8 rounded-2xl bg-forest-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold-600">Quick view</p>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Keeping the catalogue in view makes it easier to compare titles and continue browsing.
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
