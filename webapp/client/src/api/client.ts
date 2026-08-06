import type {
  Book,
  Facets,
  PredictionResult,
  RecommendationResponse,
  SearchResponse,
  User,
} from "../types";

// In production the client is served from a different origin than the API, so we
// prefix requests with VITE_API_URL (set at build time). Locally it stays empty
// and requests go through the Vite dev proxy ("/api" -> localhost:4000).
const API_BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_URL ?? "";

const TOKEN_KEY = "bookwise_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export interface PredictInput {
  title: string;
  authors: string;
  language_code: string;
  num_pages: number;
  ratings_count: number;
  text_reviews_count: number;
  publication_date: string;
  publisher: string;
}

export interface BatchPredictionRow extends PredictInput {
  predicted_rating: number;
}

export const api = {
  signup: (data: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  me: () => request<{ user: User }>("/auth/me"),

  searchBooks: (params: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    });
    return request<SearchResponse>(`/books?${qs.toString()}`);
  },
  facets: () => request<Facets>("/books/facets"),
  book: (id: string) => request<{ book: Book; similar: Book[] }>(`/books/${id}`),
  favorites: () => request<{ items: Book[] }>("/books/me/favorites"),
  toggleFavorite: (id: string) =>
    request<{ favorited: boolean }>(`/books/${id}/favorite`, { method: "POST" }),

  recommendations: (limit = 12) =>
    request<RecommendationResponse>(`/recommendations?limit=${limit}`),
  history: () =>
    request<{
      searches: { id: string; query: string; filters: unknown; at: string }[];
      views: { id: string; book: Book; at: string }[];
    }>("/recommendations/history"),

  predict: (data: PredictInput, persist = false) =>
    request<PredictionResult>("/predict", {
      method: "POST",
      body: JSON.stringify({ ...data, persist }),
    }),
  predictBatch: (items: PredictInput[]) =>
    request<{ predictions: BatchPredictionRow[]; count: number; model_name?: string }>(
      "/predict/batch",
      { method: "POST", body: JSON.stringify({ items }) },
    ),
  predictHistory: () =>
    request<{ items: { id: string; title: string; authors: string; predictedRating: number; createdAt: string }[] }>(
      "/predict/history",
    ),
  deletePrediction: (id: string) =>
    request<{ ok: boolean }>(`/predict/history/${id}`, { method: "DELETE" }),
  clearPredictionHistory: () =>
    request<{ ok: boolean }>("/predict/history", { method: "DELETE" }),
};
