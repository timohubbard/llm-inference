#!/usr/bin/env python3
"""Build apps/web/public/demo/snapshot.json with REAL values for everything
that doesn't require an LLM API call.

Computes:
- LMD per-doc scores + category counts (real, deterministic)
- Triangulation stats (Pearson/Spearman + top disagreements) once LLM scores exist
- OLS regressions (Outcome ~ Dict, Outcome ~ LLM, Outcome ~ Dict + LLM) once LLM scores + outcomes exist

Usage:
    python3 scripts/build_demo_snapshot.py [--keep-llm]

If --keep-llm is passed, LLM scores already in snapshot.json are preserved.
Otherwise, LLM scores remain whatever was previously saved.

Stats and regression are recomputed from whatever LLM scores are present.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

# Use the existing sidecar venv
ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web"
PYTHON = WEB / ".venv-test" / "bin" / "python3"

# When invoked under that venv, we'll have regex + numpy.
sys.path.insert(0, str(WEB / "api" / "python"))

import _shared  # type: ignore
import numpy as np  # type: ignore


CORPUS_DIR = WEB / "public" / "demo" / "buffett"
SNAPSHOT = WEB / "public" / "demo" / "snapshot.json"
INDEX = CORPUS_DIR / "index.json"


def load_corpus() -> list[dict]:
    """Returns [{id, text}] for all Buffett letters."""
    with open(INDEX) as f:
        idx = json.load(f)
    docs = []
    for entry in idx["documents"]:
        with open(CORPUS_DIR / entry["file"]) as f:
            docs.append({"id": entry["id"], "text": f.read()})
    return docs


def compute_lmd(docs: list[dict]) -> dict:
    """Run real LMD scoring via the same code path the production sidecar uses."""
    out = _shared.score_documents(method="lmd", documents=docs)
    # Compute primary score per doc: (positive - negative) / tokenCount
    scored = []
    for s in out["scores"]:
        cc = s["categoryCounts"]
        tc = max(1, s["tokenCount"])
        score = (cc.get("positive", 0) - cc.get("negative", 0)) / tc
        scored.append({
            "id": s["id"],
            "score": round(score, 6),
            "tokenCount": s["tokenCount"],
            "categoryCounts": cc,
        })
    return {
        "method": "lmd",
        "name": out["meta"].get("name", "Loughran–McDonald (full)"),
        "primaryMeasureLabel": "(positive − negative) / token count",
        "categories": out["meta"]["categories"],
        "scores": scored,
    }


def pearson(a: list[float], b: list[float]) -> float:
    a = np.array(a, dtype=float)
    b = np.array(b, dtype=float)
    if a.size < 2:
        return float("nan")
    am = a - a.mean()
    bm = b - b.mean()
    denom = math.sqrt(float((am ** 2).sum()) * float((bm ** 2).sum()))
    return float((am * bm).sum() / denom) if denom > 0 else float("nan")


def rank(arr: list[float]) -> list[float]:
    """Average ranks, handling ties."""
    n = len(arr)
    indexed = sorted(range(n), key=lambda i: arr[i])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and arr[indexed[j + 1]] == arr[indexed[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1
        for k in range(i, j + 1):
            ranks[indexed[k]] = avg
        i = j + 1
    return ranks


def spearman(a: list[float], b: list[float]) -> float:
    return pearson(rank(a), rank(b))


def standardize(arr: list[float]) -> list[float]:
    a = np.array(arr, dtype=float)
    sd = a.std(ddof=1)
    if sd == 0:
        return [0.0] * len(arr)
    return ((a - a.mean()) / sd).tolist()


def compute_triangulation(snapshot: dict) -> dict | None:
    llm_scores = {s["id"]: s["score"] for s in snapshot["llm"]["scores"] if s.get("score") is not None}
    dict_scores = {s["id"]: s["score"] for s in snapshot["dict"]["scores"]}
    ids = sorted(set(llm_scores) & set(dict_scores))
    if len(ids) < 3:
        return None
    d = [dict_scores[i] for i in ids]
    l = [llm_scores[i] for i in ids]
    r = pearson(d, l)
    rho = spearman(d, l)

    # Top disagreements: standardize both, rank by |z_dict - z_llm|
    dz = standardize(d)
    lz = standardize(l)
    deltas = sorted(
        [
            {"id": ids[i], "dictScore": d[i], "llmScore": l[i], "delta": round(abs(dz[i] - lz[i]), 3)}
            for i in range(len(ids))
        ],
        key=lambda x: -x["delta"],
    )[:5]
    return {
        "n": len(ids),
        "pearson": round(r, 3),
        "spearman": round(rho, 3),
        "topDisagreements": deltas,
    }


def ols(X: np.ndarray, y: np.ndarray) -> dict:
    """OLS with numpy. Returns {coefs:[{estimate,stdErr,tValue,pValue}], rSquared, adjRSquared, n, df}.

    X has shape (n, k) including intercept column. Term names assigned by caller.
    """
    n, k = X.shape
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    y_hat = X @ beta
    resid = y - y_hat
    rss = float((resid ** 2).sum())
    tss = float(((y - y.mean()) ** 2).sum())
    r2 = 1.0 - rss / tss if tss > 0 else float("nan")
    df = n - k
    sigma2 = rss / df if df > 0 else float("nan")
    cov = sigma2 * np.linalg.pinv(X.T @ X)
    se = np.sqrt(np.diag(cov))
    t_stat = beta / se
    # Two-sided Student-t p-value via the regularized incomplete beta:
    # p(|T|>|t|) = I_{df/(df+t²)}(df/2, 1/2)
    p = []
    for t in t_stat:
        if df <= 0 or not np.isfinite(t):
            p.append(float("nan"))
            continue
        x = df / (df + float(t) ** 2)
        p.append(_shared._betai(df / 2.0, 0.5, x))
    adj_r2 = 1.0 - (1.0 - r2) * (n - 1) / df if df > 0 else float("nan")
    return {
        "n": n,
        "rSquared": round(r2, 3),
        "adjRSquared": round(adj_r2, 3),
        "coefs": [
            {"estimate": round(float(beta[i]), 4), "stdErr": round(float(se[i]), 4), "pValue": round(p[i], 4)}
            for i in range(k)
        ],
    }


def compute_regression(snapshot: dict) -> dict | None:
    llm_scores = {s["id"]: s["score"] for s in snapshot["llm"]["scores"] if s.get("score") is not None}
    dict_scores = {s["id"]: s["score"] for s in snapshot["dict"]["scores"]}
    outcome = {o["id"]: o["outcome"] for o in snapshot["outcome"]["values"]}
    ids = sorted(set(llm_scores) & set(dict_scores) & set(outcome))
    if len(ids) < 4:
        return None

    y = np.array([outcome[i] for i in ids])
    d = np.array([dict_scores[i] for i in ids])
    l = np.array([llm_scores[i] for i in ids])
    n = len(ids)
    intercept = np.ones((n, 1))

    m1 = ols(np.column_stack([intercept, d]), y)
    m2 = ols(np.column_stack([intercept, l]), y)
    m3 = ols(np.column_stack([intercept, d, l]), y)

    def label(m, names):
        return {"name": "", "n": m["n"], "rSquared": m["rSquared"], "adjRSquared": m["adjRSquared"],
                "coefs": [{"term": names[i], **m["coefs"][i]} for i in range(len(names))]}

    return {
        "family": "ols",
        "models": [
            {**label(m1, ["intercept", "dict_score"]), "name": "Outcome ~ Dict"},
            {**label(m2, ["intercept", "llm_score"]), "name": "Outcome ~ LLM"},
            {**label(m3, ["intercept", "dict_score", "llm_score"]), "name": "Outcome ~ Dict + LLM"},
        ],
        "interpretation": (
            "Coefficients computed by OLS over the joined per-doc dataset (n="
            f"{n}). Compare R² across the three models to assess whether the "
            "LLM measure adds explanatory power beyond the dictionary; check "
            "p-values to see which terms remain significant when entered jointly."
        ),
    }


def main() -> int:
    if not SNAPSHOT.exists():
        print(f"snapshot.json not found at {SNAPSHOT}", file=sys.stderr)
        return 1
    with open(SNAPSHOT) as f:
        snapshot = json.load(f)

    docs = load_corpus()
    print(f"Loaded {len(docs)} corpus docs")

    # 1. Real LMD scoring
    snapshot["dict"] = compute_lmd(docs)
    print(f"Computed LMD scores for {len(snapshot['dict']['scores'])} docs")

    # 2. Triangulation (only if LLM scores present and non-null)
    tri = compute_triangulation(snapshot)
    if tri is not None:
        # Build per-row notes that pull the LLM rationale for context, so the
        # commentary stays accurate even after re-runs.
        rationale_by_id = {s["id"]: s.get("rationale", "") for s in snapshot["llm"]["scores"]}
        snapshot["triangulation"] = {
            **tri,
            "topDisagreements": [
                {**row, "note": _build_note(row, rationale_by_id.get(row["id"], ""))}
                for row in tri["topDisagreements"]
            ],
        }
        print(f"Triangulation: r={tri['pearson']}, rho={tri['spearman']}, n={tri['n']}")
    else:
        print("Triangulation skipped (LLM scores not yet captured)")

    # 3. Regression
    reg = compute_regression(snapshot)
    if reg is not None:
        m_dict, m_llm, m_both = reg["models"]
        delta_r2 = m_llm["rSquared"] - m_dict["rSquared"]
        reg["interpretation"] = (
            f"OLS coefficients computed over n={m_dict['n']} joined per-doc rows. "
            f"Dictionary-only R² = {m_dict['rSquared']:.3f}; LLM-only R² = {m_llm['rSquared']:.3f}; "
            f"combined R² = {m_both['rSquared']:.3f}. The LLM measure adds Δ R² ≈ "
            f"{delta_r2:+.3f} over the dictionary alone. Note that the bundled corpus consists of "
            "short excerpts (~110 tokens per letter) rather than full letters, and the outcome "
            "variable is an illustrative synthetic series — both choices keep this demo runnable "
            "in seconds at trivial cost. Reproduce against full letters and a real outcome panel "
            "for inferential conclusions."
        )
        snapshot["regression"] = reg
        print(f"Regression: 3 models fitted, n={reg['models'][0]['n']}")
    else:
        print("Regression skipped (LLM scores not yet captured)")

    # Update corpus checksum (deterministic from concatenated sorted ids+text)
    h = _shared.hashlib.sha256()
    for d in sorted(docs, key=lambda x: x["id"]):
        h.update(d["id"].encode())
        h.update(d["text"].encode())
    snapshot["corpus"]["checksumSha256"] = "sha256:" + h.hexdigest()
    snapshot["manifest"]["corpusChecksum"] = snapshot["corpus"]["checksumSha256"]

    with open(SNAPSHOT, "w") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"Wrote {SNAPSHOT}")
    return 0


def _build_note(row: dict, rationale: str) -> str:
    """Compose a disagreement note from the row's stats + the LLM's rationale.

    The first sentence of the rationale (or first ~180 chars) is included so
    the reader can see why the LLM landed where it did relative to the
    sentiment-counts measure.
    """
    excerpt = rationale.strip().split(". ")[0]
    if len(excerpt) > 180:
        excerpt = excerpt[:177] + "…"
    return (
        f"|Δz| = {row['delta']:.2f}: dictionary score {row['dictScore']:.4f} vs. LLM "
        f"score {row['llmScore']}. {excerpt}."
    )


if __name__ == "__main__":
    sys.exit(main())
