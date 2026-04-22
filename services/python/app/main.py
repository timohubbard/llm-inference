import os
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .dictionaries import score_documents
from .regression import fit_regression

SIDECAR_VERSION = os.environ.get("SIDECAR_VERSION", "0.1.0-dev")
SIDECAR_IMAGE_DIGEST = os.environ.get("SIDECAR_IMAGE_DIGEST") or None
SHARED_SECRET = os.environ.get("PYTHON_SIDECAR_SHARED_SECRET")

app = FastAPI(title="LLMI Python Sidecar", version=SIDECAR_VERSION)


def _check_secret(x_sidecar_secret: str | None) -> None:
    if SHARED_SECRET and x_sidecar_secret != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="bad shared secret")


class Doc(BaseModel):
    id: str
    text: str


class DictionaryScoreRequest(BaseModel):
    method: Literal["lmd", "liwc", "custom_dict"]
    params: dict | None = None
    dictionary: dict[str, list[str]] | None = None
    documents: list[Doc] = Field(min_length=1)


class DocScore(BaseModel):
    id: str
    categoryCounts: dict[str, int]
    tokenCount: int
    score: float | None = None


class DictionaryScoreResponse(BaseModel):
    method: str
    scores: list[DocScore]
    summary: dict
    sidecarVersion: str
    sidecarImageDigest: str | None


class RegressionRequest(BaseModel):
    formula: str
    data: list[dict]
    family: Literal["ols", "logit"] = "ols"


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "version": SIDECAR_VERSION,
        "imageDigest": SIDECAR_IMAGE_DIGEST,
    }


@app.post("/dictionary/score", response_model=DictionaryScoreResponse)
def dictionary_score(
    body: DictionaryScoreRequest,
    x_sidecar_secret: str | None = Header(default=None),
) -> DictionaryScoreResponse:
    _check_secret(x_sidecar_secret)
    result = score_documents(
        method=body.method,
        documents=[(d.id, d.text) for d in body.documents],
        user_dictionary=body.dictionary,
    )
    return DictionaryScoreResponse(
        method=body.method,
        scores=[DocScore(**s) for s in result["scores"]],
        summary=result["summary"],
        sidecarVersion=SIDECAR_VERSION,
        sidecarImageDigest=SIDECAR_IMAGE_DIGEST,
    )


@app.post("/regression/fit")
def regression_fit(
    body: RegressionRequest,
    x_sidecar_secret: str | None = Header(default=None),
) -> dict:
    _check_secret(x_sidecar_secret)
    return fit_regression(body.formula, body.data, family=body.family)
