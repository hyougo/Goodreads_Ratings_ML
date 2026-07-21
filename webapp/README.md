# BookWise — ML-powered book web app

A full-stack TypeScript application that puts the project's XGBoost Goodreads
rating model behind a modern web experience: a home page, a machine-learning
rating **predictor**, advanced **authentication**, a searchable **book catalog**,
and **personalized recommendations** that learn from each user's activity.

## Architecture

```
webapp/
├── ml-service/   Python FastAPI — loads the exported .pkl and serves predictions
├── server/       Node + TypeScript (Express + Prisma/SQLite) — auth, catalog, search, recommendations, prediction proxy
└── client/       React + TypeScript (Vite + Tailwind) — the UI
```

The rating model is a Python `cloudpickle` artifact (`GoodreadsRatingPredictor`),
so it is served by a small FastAPI microservice. The TypeScript API talks to it
over HTTP, adds users/catalog/recommendations, and the React client talks only to
the TypeScript API.

```
React client ──/api──▶ Node/TS API ──HTTP──▶ FastAPI ML service ──▶ XGBoost .pkl
                          │
                          └──▶ SQLite (users, books, search history, favorites)
```

## Prerequisites

- Node.js 18+ (tested on 22)
- Python 3.12
- The dataset at `../data/raw/books.csv` and the model at
  `../models/goodreads_rating_predictor_XGBoost_extended.pkl` (already in this repo)

## Setup & run (three terminals)

### 1) ML service (port 8000)

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\Activate.ps1        # Windows PowerShell
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

> The extended model was pickled with pandas ≥ 2.3 and numpy ≥ 2.0; the pinned
> `requirements.txt` matches. Set `MODEL_PATH` to use the smaller base model.

### 2) API server (port 4000)

```bash
cd server
npm install
npx prisma generate
npx prisma db push          # creates dev.db
npm run seed                # imports ~11,100 books from ../data/raw/books.csv
npm run dev
```

### 3) Web client (port 5173)

```bash
cd client
npm install
npm run dev
```

Open <http://localhost:5173>.

## Features

- **Home** — hero, catalog stats, and a featured/recommended shelf.
- **Rating predictor** — enter a book's 8 raw attributes (title, authors,
  language, pages, ratings/reviews counts, publication date, publisher) and get
  the model's estimated 0–5 rating, with a "fill sample" helper.
- **Authentication** — email/password signup with a live password-strength meter
  and validation, JWT-based sessions, protected routes.
- **Catalog** — full-text search across title/author/publisher, filters
  (language, minimum rating, page range, year range), six sort orders, and
  pagination over the whole catalog.
- **Recommendations** — content-based engine that builds a profile from each
  user's recorded searches and viewed books (favorite authors, keywords,
  languages) and scores the catalog, blended with a quality/popularity prior.
  Anonymous visitors get highly-rated popular books.
- **Profile** — search history, prediction history, recently viewed, favorites.

## API overview

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/auth/signup` | Create account, returns JWT |
| POST | `/api/auth/login` | Log in, returns JWT |
| GET  | `/api/auth/me` | Current user |
| GET  | `/api/books` | Search/filter/sort/paginate catalog |
| GET  | `/api/books/facets` | Languages + ranges for filter UI |
| GET  | `/api/books/:id` | Book detail + similar books |
| POST | `/api/books/:id/favorite` | Toggle favorite |
| GET  | `/api/recommendations` | Personalized (or trending) picks |
| GET  | `/api/recommendations/history` | User search/view history |
| POST | `/api/predict` | Predict a rating (proxied to ML service) |
| GET  | `/api/predict/history` | User's past predictions |

## Notes

- The model was trained on books with ≥ 50 ratings; predictions for books with
  very few ratings are less reliable.
- `server/.env` ships with development defaults. Change `JWT_SECRET` before any
  real deployment.
