"""Build the cleaned SQLite dataset used by the Goodreads modelling notebook.

Run from the repository root:

    python scripts/clean_extended_goodreads.py

The existing cleaned database is validated and reused by default. Pass ``--force``
to rebuild it from the raw extended Goodreads database.
"""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import unicodedata
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_PATH = (
    REPOSITORY_ROOT
    / "data"
    / "external"
    / "goodreads_extended"
    / "goodreads_books_extended.db"
)
DEFAULT_OUTPUT_PATH = (
    REPOSITORY_ROOT
    / "data"
    / "processed"
    / "goodreads_extended_cleaned.db"
)

TARGET = "average_rating"
MINIMUM_RATINGS_COUNT = 50
REFERENCE_YEAR = 2026
CLEANING_VERSION = 1

RAW_MODEL_INPUT_COLUMNS = [
    "title",
    "authors",
    "language_code",
    "num_pages",
    "ratings_count",
    "text_reviews_count",
    "publication_date",
    "publisher",
]
REQUIRED_SOURCE_COLUMNS = {
    "bookID",
    "isbn",
    TARGET,
    *RAW_MODEL_INPUT_COLUMNS,
}
REQUIRED_OUTPUT_TABLES = {
    "books_cleaned",
    "cleaning_metadata",
    "isbn_conflicts",
}


def normalize_text(value: object) -> str | None:
    """Normalize one text value for stable duplicate comparisons."""
    if value is None or pd.isna(value):
        return None

    normalized = str(value).strip().lower()
    normalized = unicodedata.normalize("NFKD", normalized)
    normalized = "".join(
        character
        for character in normalized
        if not unicodedata.combining(character)
    )
    return re.sub(r"\s+", " ", normalized)


def normalize_isbn(isbn_values: pd.Series) -> pd.Series:
    """Convert nullable integer ISBN values to zero-padded ISBN-10 strings."""
    numeric_isbn = pd.to_numeric(isbn_values, errors="coerce").astype("Int64")
    return numeric_isbn.astype("string").str.zfill(10)


def source_fingerprint(source_path: Path) -> dict[str, int] | None:
    """Return inexpensive file attributes used to detect a changed source."""
    if not source_path.exists():
        return None

    source_stat = source_path.stat()
    return {
        "source_size_bytes": int(source_stat.st_size),
        "source_mtime_ns": int(source_stat.st_mtime_ns),
    }


def clean_model_inputs(raw_data: pd.DataFrame) -> pd.DataFrame:
    """Apply deterministic value cleaning without learned imputations."""
    cleaned_data = raw_data.copy()

    for column_name in ["title", "authors", "publisher", "language_code"]:
        cleaned_data[column_name] = (
            cleaned_data[column_name]
            .astype("string")
            .str.strip()
        )

    cleaned_data["publisher"] = cleaned_data["publisher"].replace("", pd.NA)
    cleaned_data["language_code"] = cleaned_data["language_code"].replace("", pd.NA)
    cleaned_data["title"] = (
        cleaned_data["title"]
        .str.replace("\ufffd", " ", regex=False)
        .str.replace(r"\s+", " ", regex=True)
        .str.strip()
    )

    cleaned_data[TARGET] = pd.to_numeric(cleaned_data[TARGET], errors="coerce")
    cleaned_data["ratings_count"] = (
        pd.to_numeric(cleaned_data["ratings_count"], errors="coerce")
        .fillna(0)
        .clip(lower=0)
    )
    cleaned_data["text_reviews_count"] = (
        pd.to_numeric(cleaned_data["text_reviews_count"], errors="coerce")
        .fillna(0)
        .clip(lower=0)
        .clip(upper=cleaned_data["ratings_count"])
    )

    page_counts = pd.to_numeric(cleaned_data["num_pages"], errors="coerce")
    invalid_page_count = (
        page_counts.isna()
        | page_counts.le(0)
        | page_counts.isin([9998, 9999])
        | page_counts.gt(10_000)
    )
    cleaned_data["num_pages"] = page_counts.mask(invalid_page_count)

    publication_date_text = cleaned_data["publication_date"].astype("string")
    publication_year = pd.to_numeric(
        publication_date_text.str.extract(
            r"(?<!\d)(\d{4})(?!\d)",
            expand=False,
        ),
        errors="coerce",
    )
    valid_publication_year = publication_year.between(1450, REFERENCE_YEAR)
    normalized_publication_year = (
        publication_year
        .where(valid_publication_year)
        .astype("Int64")
    )
    cleaned_data["publication_date"] = pd.to_datetime(
        normalized_publication_year.astype("string") + "-01-01",
        errors="coerce",
    )

    return cleaned_data


def resolve_isbn_duplicates(
    cleaned_data: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, int]]:
    """Remove repeated edition snapshots while retaining ISBN conflicts."""
    resolved_data = cleaned_data.copy()
    resolved_data["isbn"] = normalize_isbn(resolved_data["isbn"])

    resolved_data["_identity_title"] = resolved_data["title"].map(normalize_text)
    resolved_data["_identity_authors"] = resolved_data["authors"].map(normalize_text)
    resolved_data["_identity_publisher"] = resolved_data["publisher"].map(normalize_text)
    resolved_data["_identity_year"] = (
        resolved_data["publication_date"]
        .dt.year
        .astype("Int64")
    )
    resolved_data["_identity_pages"] = resolved_data["num_pages"].astype("Float64")

    identity_columns = [
        "isbn",
        "_identity_title",
        "_identity_authors",
        "_identity_publisher",
        "_identity_year",
        "_identity_pages",
    ]
    repeated_isbn_mask = (
        resolved_data["isbn"].notna()
        & resolved_data.duplicated("isbn", keep=False)
    )
    repeated_isbn_groups = int(
        resolved_data.loc[repeated_isbn_mask, "isbn"].nunique()
    )

    ranked_candidates = resolved_data.loc[repeated_isbn_mask].sort_values(
        ["ratings_count", "text_reviews_count", "bookID"],
        ascending=[False, False, True],
    )
    repeated_snapshot_mask = ranked_candidates.duplicated(
        identity_columns,
        keep="first",
    )
    duplicate_book_ids = ranked_candidates.loc[
        repeated_snapshot_mask,
        "bookID",
    ]
    resolved_data = resolved_data.loc[
        ~resolved_data["bookID"].isin(duplicate_book_ids)
    ].copy()

    remaining_identity_duplicates = (
        resolved_data["isbn"].notna()
        & resolved_data.duplicated(identity_columns, keep=False)
    )
    if remaining_identity_duplicates.any():
        raise AssertionError(
            "True ISBN edition duplicates remain after resolution."
        )

    conflict_mask = (
        resolved_data["isbn"].notna()
        & resolved_data.duplicated("isbn", keep=False)
    )
    conflict_columns = [
        "isbn",
        "bookID",
        "title",
        "authors",
        "publisher",
        "publication_date",
        "num_pages",
        TARGET,
        "ratings_count",
        "text_reviews_count",
    ]
    isbn_conflicts = (
        resolved_data.loc[conflict_mask, conflict_columns]
        .sort_values(["isbn", "bookID"])
        .reset_index(drop=True)
    )

    identity_helper_columns = [
        column_name
        for column_name in resolved_data.columns
        if column_name.startswith("_identity_")
    ]
    resolved_data = resolved_data.drop(columns=identity_helper_columns)

    duplicate_audit = {
        "repeated_isbn_groups": repeated_isbn_groups,
        "true_duplicate_rows_removed": int(len(duplicate_book_ids)),
        "isbn_conflict_groups": int(isbn_conflicts["isbn"].nunique()),
        "isbn_conflict_rows": int(len(isbn_conflicts)),
    }
    return resolved_data, isbn_conflicts, duplicate_audit


def load_and_clean_source(
    source_path: Path,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, object]]:
    """Read eligible source rows, clean them, and prepare audit metadata."""
    if not source_path.exists():
        raise FileNotFoundError(
            f"Extended source database not found: {source_path}"
        )

    source_uri = f"file:{source_path.resolve().as_posix()}?mode=ro"
    with sqlite3.connect(source_uri, uri=True) as source_connection:
        integrity_result = source_connection.execute(
            "PRAGMA quick_check"
        ).fetchone()[0]
        if integrity_result != "ok":
            raise ValueError(
                f"Source database integrity check failed: {integrity_result}"
            )

        source_columns = {
            row[1]
            for row in source_connection.execute("PRAGMA table_info(books)")
        }
        missing_columns = REQUIRED_SOURCE_COLUMNS - source_columns
        if missing_columns:
            raise ValueError(
                f"Extended source is missing columns: {sorted(missing_columns)}"
            )

        source_profile_query = """
        SELECT
            COUNT(*) AS source_rows,
            SUM(ratings_count >= ?) AS eligible_rating_count_rows,
            SUM(ratings_count = 0 AND average_rating = 0) AS unrated_rows
        FROM books
        """
        source_profile = pd.read_sql_query(
            source_profile_query,
            source_connection,
            params=[MINIMUM_RATINGS_COUNT],
        ).iloc[0]

        eligible_query = """
        SELECT
            bookID,
            isbn,
            average_rating,
            title,
            authors,
            language_code,
            num_pages,
            ratings_count,
            text_reviews_count,
            publication_date,
            publisher
        FROM books
        WHERE ratings_count >= ?
        """
        eligible_data = pd.read_sql_query(
            eligible_query,
            source_connection,
            params=[MINIMUM_RATINGS_COUNT],
        )

    numeric_target = pd.to_numeric(eligible_data[TARGET], errors="coerce")
    title_text = eligible_data["title"].astype("string").str.strip()
    author_text = eligible_data["authors"].astype("string").str.strip()

    invalid_target_mask = ~numeric_target.between(0, 5)
    blank_title_mask = title_text.isna() | title_text.eq("")
    blank_author_mask = author_text.isna() | author_text.eq("")
    invalid_author_mask = (
        author_text
        .str.lower()
        .eq("not a book")
        .fillna(False)
    )
    removal_mask = (
        invalid_target_mask
        | blank_title_mask
        | blank_author_mask
        | invalid_author_mask
    )

    eligible_cleaning_input = eligible_data.loc[~removal_mask].copy()
    raw_page_counts = pd.to_numeric(
        eligible_cleaning_input["num_pages"],
        errors="coerce",
    )
    page_values_set_missing = (
        raw_page_counts.isna()
        | raw_page_counts.le(0)
        | raw_page_counts.isin([9998, 9999])
        | raw_page_counts.gt(10_000)
    )
    replacement_title_rows = int(
        eligible_cleaning_input["title"]
        .astype("string")
        .str.contains("\ufffd", na=False)
        .sum()
    )
    possible_mojibake_title_rows = int(
        eligible_cleaning_input["title"]
        .astype("string")
        .str.contains(r"Ã|Â", regex=True, na=False)
        .sum()
    )

    cleaned_data = clean_model_inputs(eligible_cleaning_input)
    invalid_publication_year_rows = int(
        cleaned_data["publication_date"].isna().sum()
    )
    resolved_data, isbn_conflicts, duplicate_audit = resolve_isbn_duplicates(
        cleaned_data
    )

    fingerprint = source_fingerprint(source_path)
    if fingerprint is None:
        raise FileNotFoundError(
            f"Extended source database not found: {source_path}"
        )

    cleaning_metadata = {
        "cleaning_version": CLEANING_VERSION,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_path": str(source_path),
        "source_size_bytes": fingerprint["source_size_bytes"],
        "source_mtime_ns": fingerprint["source_mtime_ns"],
        "source_rows": int(source_profile["source_rows"]),
        "eligible_rating_count_rows": int(
            source_profile["eligible_rating_count_rows"]
        ),
        "unrated_rows": int(source_profile["unrated_rows"]),
        "eligible_rows_loaded": int(len(eligible_data)),
        "invalid_target_rows_removed": int(invalid_target_mask.sum()),
        "blank_title_rows_removed": int(blank_title_mask.sum()),
        "blank_author_rows_removed": int(blank_author_mask.sum()),
        "invalid_author_rows_removed": int(invalid_author_mask.sum()),
        "page_values_set_missing": int(page_values_set_missing.sum()),
        "invalid_publication_year_rows": invalid_publication_year_rows,
        "replacement_title_rows": replacement_title_rows,
        "possible_mojibake_title_rows": possible_mojibake_title_rows,
        "language_missing_rows": int(
            resolved_data["language_code"].isna().sum()
        ),
        "publisher_missing_rows": int(
            resolved_data["publisher"].isna().sum()
        ),
        "isbn_missing_rows": int(resolved_data["isbn"].isna().sum()),
        "minimum_ratings_count": MINIMUM_RATINGS_COUNT,
        "reference_year": REFERENCE_YEAR,
        **duplicate_audit,
        "final_rows": int(len(resolved_data)),
    }

    export_columns = ["bookID", "isbn", TARGET, *RAW_MODEL_INPUT_COLUMNS]
    resolved_data = (
        resolved_data[export_columns]
        .sort_values("bookID")
        .reset_index(drop=True)
    )
    return resolved_data, isbn_conflicts, cleaning_metadata


def temporary_output_path(output_path: Path) -> Path:
    """Return the temporary database path used for an atomic export."""
    return output_path.with_name(
        f"{output_path.stem}.tmp{output_path.suffix}"
    )


def export_cleaned_database(
    cleaned_data: pd.DataFrame,
    isbn_conflicts: pd.DataFrame,
    cleaning_metadata: dict[str, object],
    output_path: Path,
) -> None:
    """Write cleaned tables safely, then replace the final database."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = temporary_output_path(output_path)
    if temp_path.exists():
        temp_path.unlink()

    try:
        with closing(sqlite3.connect(temp_path)) as output_connection:
            cleaned_data.to_sql(
                "books_cleaned",
                output_connection,
                if_exists="replace",
                index=False,
            )
            pd.DataFrame([cleaning_metadata]).to_sql(
                "cleaning_metadata",
                output_connection,
                if_exists="replace",
                index=False,
            )
            isbn_conflicts.to_sql(
                "isbn_conflicts",
                output_connection,
                if_exists="replace",
                index=False,
            )
            output_connection.execute(
                "CREATE UNIQUE INDEX idx_books_cleaned_bookID "
                "ON books_cleaned(bookID)"
            )
            output_connection.execute(
                "CREATE INDEX idx_books_cleaned_isbn ON books_cleaned(isbn)"
            )
            output_connection.execute("ANALYZE")
            integrity_result = output_connection.execute(
                "PRAGMA quick_check"
            ).fetchone()[0]
            if integrity_result != "ok":
                raise ValueError(
                    "Temporary output integrity check failed: "
                    f"{integrity_result}"
                )

        os.replace(temp_path, output_path)
    except Exception:
        if temp_path.exists():
            temp_path.unlink()
        raise


def validate_cleaned_database(
    output_path: Path,
    source_path: Path | None = None,
) -> pd.DataFrame:
    """Validate the cleaned database and return its single metadata row."""
    if not output_path.exists():
        raise FileNotFoundError(
            f"Cleaned extended dataset not found: {output_path}"
        )

    output_uri = f"file:{output_path.resolve().as_posix()}?mode=ro"
    with closing(sqlite3.connect(output_uri, uri=True)) as output_connection:
        integrity_result = output_connection.execute(
            "PRAGMA quick_check"
        ).fetchone()[0]
        available_tables = {
            row[0]
            for row in output_connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        missing_tables = REQUIRED_OUTPUT_TABLES - available_tables
        if missing_tables:
            raise ValueError(
                f"Cleaned database is missing tables: {sorted(missing_tables)}"
            )

        metadata = pd.read_sql_query(
            "SELECT * FROM cleaning_metadata",
            output_connection,
        )
        exported_row_count = output_connection.execute(
            "SELECT COUNT(*) FROM books_cleaned"
        ).fetchone()[0]
        output_columns = {
            row[1]
            for row in output_connection.execute(
                "PRAGMA table_info(books_cleaned)"
            )
        }

    if integrity_result != "ok":
        raise ValueError(
            f"Cleaned database integrity check failed: {integrity_result}"
        )
    if len(metadata) != 1:
        raise ValueError(
            "Cleaned database must contain exactly one metadata row."
        )

    missing_columns = REQUIRED_SOURCE_COLUMNS - output_columns
    if missing_columns:
        raise ValueError(
            f"Cleaned database is missing columns: {sorted(missing_columns)}"
        )

    metadata_row = metadata.iloc[0]
    if int(metadata_row["cleaning_version"]) != CLEANING_VERSION:
        raise ValueError(
            "The cleaning version changed. Rebuild with --force."
        )
    if int(metadata_row["final_rows"]) != int(exported_row_count):
        raise ValueError(
            "Cleaned database row count does not match its metadata."
        )
    if int(metadata_row["minimum_ratings_count"]) != MINIMUM_RATINGS_COUNT:
        raise ValueError(
            "The saved minimum rating-count rule does not match the script."
        )
    if int(metadata_row["reference_year"]) != REFERENCE_YEAR:
        raise ValueError(
            "The saved reference year does not match the script."
        )

    if source_path is not None:
        current_fingerprint = source_fingerprint(source_path)
        if current_fingerprint is not None:
            fingerprint_changed = any(
                int(metadata_row[field_name])
                != current_fingerprint[field_name]
                for field_name in ["source_size_bytes", "source_mtime_ns"]
            )
            if fingerprint_changed:
                raise ValueError(
                    "The raw extended source changed. Rebuild with --force."
                )

    return metadata


def build_or_validate(
    source_path: Path,
    output_path: Path,
    force: bool,
) -> tuple[str, pd.DataFrame]:
    """Build the cleaned database when needed, otherwise validate it."""
    if output_path.exists() and not force:
        metadata = validate_cleaned_database(output_path, source_path)
        return "validated existing cleaned database", metadata

    cleaned_data, isbn_conflicts, cleaning_metadata = load_and_clean_source(
        source_path
    )
    export_cleaned_database(
        cleaned_data,
        isbn_conflicts,
        cleaning_metadata,
        output_path,
    )
    metadata = validate_cleaned_database(output_path, source_path)
    return "built cleaned database from raw source", metadata


def parse_arguments() -> argparse.Namespace:
    """Parse command-line paths and rebuild controls."""
    parser = argparse.ArgumentParser(
        description=(
            "Build or validate the cleaned SQLite dataset used by the "
            "Goodreads modelling notebook."
        )
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE_PATH,
        help="Path to the raw extended Goodreads SQLite database.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path for the cleaned SQLite database.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild the cleaned database even when it already exists.",
    )
    return parser.parse_args()


def main() -> None:
    """Run the command-line cleaning pipeline."""
    arguments = parse_arguments()
    source_path = arguments.source.expanduser().resolve()
    output_path = arguments.output.expanduser().resolve()

    status, metadata = build_or_validate(
        source_path=source_path,
        output_path=output_path,
        force=arguments.force,
    )
    metadata_row = metadata.iloc[0]

    print(f"Status: {status}")
    print(f"Output: {output_path}")
    print(f"Cleaning version: {int(metadata_row['cleaning_version'])}")
    print(f"Cleaned rows: {int(metadata_row['final_rows']):,}")
    print(f"Output size: {output_path.stat().st_size / (1024 ** 2):.1f} MB")


if __name__ == "__main__":
    main()
