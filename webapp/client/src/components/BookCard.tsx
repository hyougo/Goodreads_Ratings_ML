import type { Book } from "../types";
import { formatCount, ratingColor } from "../lib/format";
import { StarRating } from "./StarRating";
import { BookCover } from "./BookCover";
import { useQuickView } from "../context/QuickView";

export function BookCard({ book }: { book: Book }) {
  const { open } = useQuickView();
  return (
    <button
      type="button"
      onClick={() => open(book)}
      className="book-card card group relative flex w-full flex-col overflow-hidden text-left transition duration-300 hover:z-10 hover:border-forest-300 hover:shadow-card focus:z-10 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:ring-offset-2"
      aria-label={`Quick view: ${book.title}`}
    >
      <div className="relative overflow-hidden">
        <BookCover book={book} className="h-52 w-full" initialsSize={44} />
        <span className="absolute right-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-forest-700 shadow-sm backdrop-blur">
          {book.languageCode}
        </span>
        {book.score !== undefined && (
          <span className="absolute left-2 top-2 rounded-full bg-gold-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-forest-900 shadow-sm">
            Recommended
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-snug text-forest-800 group-hover:text-forest-900">
          {book.title}
        </h3>
        <p className="line-clamp-1 text-xs text-stone-500">{book.firstAuthor}</p>
        <div className="book-card-extra">
          <p>{book.numPages} pages · {book.publicationYear || "Publication year unavailable"}</p>
          <p>{formatCount(book.textReviewsCount)} reader reviews</p>
        </div>
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex items-center gap-1.5">
            <StarRating value={book.averageRating} />
            <span className={`text-xs font-bold ${ratingColor(book.averageRating)}`}>
              {book.averageRating.toFixed(2)}
            </span>
          </div>
          <span className="text-[11px] text-stone-400">{formatCount(book.ratingsCount)} ratings</span>
        </div>
      </div>
    </button>
  );
}
