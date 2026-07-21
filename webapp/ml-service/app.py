"""FastAPI microservice that serves the exported Goodreads rating predictor.

The model artifact (`GoodreadsRatingPredictor`) was exported from the project
notebook with cloudpickle. It is self-contained: it carries its own feature
engineering functions and reference statistics, so we only need to feed it the
eight raw input columns and it returns a rating on the 0-5 scale.
"""
from __future__ import annotations

import os
import warnings
from pathlib import Path
from typing import Optional

import cloudpickle
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

warnings.filterwarnings("ignore")

# Resolve the model path. Defaults to the extended model shipped in ../../models.
DEFAULT_MODEL = (
    Path(__file__).resolve().parents[2]
    / "models"
    / "goodreads_rating_predictor_XGBoost_extended.pkl"
)
MODEL_PATH = Path(os.environ.get("MODEL_PATH", str(DEFAULT_MODEL)))

RAW_INPUT_COLUMNS = [
    "title",
    "authors",
    "language_code",
    "num_pages",
    "ratings_count",
    "text_reviews_count",
    "publication_date",
    "publisher",
]

app = FastAPI(title="Goodreads Rating Predictor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_predictor = None


def get_predictor():
    """Lazy-load the pickled predictor once and cache it in module state."""
    global _predictor
    if _predictor is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model artifact not found at {MODEL_PATH}")
        with MODEL_PATH.open("rb") as artifact_file:
            _predictor = cloudpickle.load(artifact_file)
    return _predictor


class BookFeatures(BaseModel):
    """Raw book attributes expected by the model."""

    title: str = Field(..., examples=["The Name of the Wind (The Kingkiller Chronicle #1)"])
    authors: str = Field(..., examples=["Patrick Rothfuss"])
    language_code: str = Field("eng", examples=["eng"])
    num_pages: int = Field(..., ge=0, examples=[662])
    ratings_count: int = Field(..., ge=0, examples=[500000])
    text_reviews_count: int = Field(..., ge=0, examples=[30000])
    publication_date: str = Field(..., examples=["3/27/2007"])
    publisher: str = Field("", examples=["DAW Books"])


class PredictionResponse(BaseModel):
    predicted_rating: float
    model_name: Optional[str] = None


@app.get("/health")
def health():
    try:
        predictor = get_predictor()
        return {
            "status": "ok",
            "model": predictor.metadata.get("model_name"),
            "target": predictor.metadata.get("target"),
            "training_rows": predictor.metadata.get("training_rows"),
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/predict", response_model=PredictionResponse)
def predict(features: BookFeatures):
    predictor = get_predictor()
    row = pd.DataFrame([{col: getattr(features, col) for col in RAW_INPUT_COLUMNS}])
    try:
        value = float(predictor.predict(row)[0])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Prediction failed: {exc}")
    return PredictionResponse(
        predicted_rating=round(value, 3),
        model_name=predictor.metadata.get("model_name"),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("ML_PORT", "8000")))
