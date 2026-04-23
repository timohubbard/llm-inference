"""Shared logic for the Vercel Python functions.

Files whose name begins with `_` are not deployed as endpoints but are
importable from sibling handlers. Each handler (`dictionary.py`,
`regression.py`) imports from this module.
"""

from __future__ import annotations

import hashlib
import math
import os
import re
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np
import regex as regex_lib


SIDECAR_VERSION = "0.3.0"


# --- Statistical helpers (numpy + stdlib only) ---


def _norm_sf_abs(z: np.ndarray) -> np.ndarray:
    """Two-sided tail for the standard normal: P(|Z| > |z|) = erfc(|z|/sqrt(2))."""
    out = np.empty_like(z, dtype=float)
    sqrt2 = math.sqrt(2.0)
    for i, v in enumerate(z):
        vf = float(v)
        out[i] = math.erfc(abs(vf) / sqrt2) if math.isfinite(vf) else float("nan")
    return out


def _betacf(a: float, b: float, x: float, max_iter: int = 200, eps: float = 3e-7) -> float:
    """Continued-fraction expansion for the incomplete beta (Numerical Recipes §6.4)."""
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < 1e-30:
        d = 1e-30
    d = 1.0 / d
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-30:
            d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-30:
            d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < eps:
            return h
    return h


def _betai(a: float, b: float, x: float) -> float:
    """Regularized incomplete beta I_x(a, b). Used for Student-t p-values."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    lnbt = (
        math.lgamma(a + b)
        - math.lgamma(a)
        - math.lgamma(b)
        + a * math.log(x)
        + b * math.log(1.0 - x)
    )
    bt = math.exp(lnbt)
    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def _t_sf_abs(t_stat: np.ndarray, df: float) -> np.ndarray:
    """Two-sided tail for Student-t: P(|T| > |t|) = I_{df/(df+t²)}(df/2, 1/2)."""
    out = np.empty_like(t_stat, dtype=float)
    a = df / 2.0
    for i, t in enumerate(t_stat):
        tf = float(t)
        if not math.isfinite(tf):
            out[i] = float("nan")
            continue
        x = df / (df + tf * tf)
        out[i] = _betai(a, 0.5, x)
    return out


def _requirements_hash() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    for candidate in (
        os.path.join(here, "..", "..", "requirements.txt"),
        os.path.join(here, "..", "requirements.txt"),
        os.path.join(here, "requirements.txt"),
    ):
        if os.path.exists(candidate):
            with open(candidate, "rb") as f:
                return hashlib.sha256(f.read()).hexdigest()
    return "unknown"


REQUIREMENTS_HASH = _requirements_hash()


# --- Loughran-McDonald stub word lists (small seed; full LMD available from
# https://sraf.nd.edu/loughranmcdonald-master-dictionary/). Users should upload
# their licensed copy via the custom_dict path for substantive work.
LMD_POSITIVE = {
    "able", "achieve", "achieved", "achieving", "advance", "advances",
    "benefit", "beneficial", "best", "better", "confidence", "confident",
    "delight", "delighted", "effective", "efficiency", "enhance", "enhanced",
    "excel", "excellent", "favorable", "gain", "gained", "great", "greater",
    "growth", "improve", "improved", "improvement", "innovation", "innovative",
    "leading", "opportunity", "opportunities", "outperform", "positive",
    "profitable", "progress", "progressing", "strength", "strong", "success",
    "successful", "surpass", "surpassed", "upturn", "win", "winning",
}
LMD_NEGATIVE = {
    "adverse", "adversely", "bankrupt", "bankruptcy", "breach", "breaches",
    "claim", "claims", "crisis", "critical", "damage", "damages",
    "decline", "declined", "declining", "default", "deteriorate",
    "deteriorated", "difficult", "difficulty", "disappointing", "disaster",
    "doubt", "downturn", "erosion", "failure", "failed", "fraud",
    "hurt", "hurting", "impair", "impairment", "impaired", "inadequate",
    "loss", "losses", "misstate", "negative", "negatively", "poor",
    "problem", "problems", "recession", "restructure", "restructuring",
    "risk", "risks", "shortfall", "shortage", "shortages", "struggle",
    "suffer", "suffered", "unfavorable", "unprofitable", "volatile",
    "volatility", "weak", "weakness", "worse", "worsened",
}
LMD_UNCERTAINTY = {
    "almost", "apparent", "approximate", "approximately", "assumption",
    "believe", "contingency", "depend", "depends", "may", "maybe", "might",
    "perhaps", "possible", "possibility", "predict", "tentative",
    "uncertain", "uncertainty", "unclear", "unknown", "variable",
}
LMD_LITIGIOUS = {
    "allegation", "allegations", "court", "defendant", "indict",
    "indictment", "lawsuit", "litigation", "plaintiff", "settlement",
    "subpoena", "testimony", "tort", "verdict",
}

LMD_CATEGORIES: Dict[str, set] = {
    "positive": LMD_POSITIVE,
    "negative": LMD_NEGATIVE,
    "uncertainty": LMD_UNCERTAINTY,
    "litigious": LMD_LITIGIOUS,
}


_WORD_RE = regex_lib.compile(r"\p{L}+(?:'\p{L}+)?", regex_lib.UNICODE)


def tokenize(text: str) -> List[str]:
    return [m.group(0).lower() for m in _WORD_RE.finditer(text or "")]


def _compile_dict(dictionary: Dict[str, Iterable[str]]) -> Dict[str, set]:
    return {k: {t.lower() for t in v} for k, v in dictionary.items()}


def score_documents(
    *,
    method: str,
    documents: List[Dict[str, str]],
    user_dictionary: Dict[str, List[str]] | None = None,
) -> Dict[str, Any]:
    if method == "lmd":
        categories: Dict[str, set] = LMD_CATEGORIES
    elif method == "custom_dict":
        if not user_dictionary:
            raise ValueError("custom_dict method requires a `dictionary` payload")
        categories = _compile_dict(user_dictionary)
    elif method == "liwc":
        if not user_dictionary:
            raise ValueError(
                "liwc method requires a user-supplied dictionary — upload your licensed LIWC file."
            )
        categories = _compile_dict(user_dictionary)
    else:
        raise ValueError(f"Unknown method: {method}")

    scores: List[Dict[str, Any]] = []
    for doc in documents:
        doc_id = doc.get("id")
        text = doc.get("text", "")
        if not isinstance(doc_id, str):
            raise ValueError("each document must have a string id")
        tokens = tokenize(text)
        counts: Dict[str, int] = {cat: 0 for cat in categories}
        for tok in tokens:
            for cat, lex in categories.items():
                if tok in lex:
                    counts[cat] += 1
        net = None
        if "positive" in counts and "negative" in counts:
            denom = max(1, len(tokens))
            net = (counts["positive"] - counts["negative"]) / denom
        scores.append(
            {
                "id": doc_id,
                "categoryCounts": counts,
                "tokenCount": len(tokens),
                "score": net,
            }
        )

    return {
        "method": method,
        "scores": scores,
        "summary": {
            "docCount": len(scores),
            "categories": sorted(categories.keys()),
        },
        "sidecarVersion": SIDECAR_VERSION,
        "sidecarImageDigest": None,
        "requirementsHash": REQUIREMENTS_HASH,
    }


# --- Regression (numpy + scipy.stats; no statsmodels/patsy) ---

_FORMULA_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*~\s*(.+?)\s*$")


def _parse_formula(
    formula: str, data: List[Dict[str, Any]]
) -> Tuple[np.ndarray, np.ndarray, List[str], str]:
    m = _FORMULA_RE.match(formula)
    if not m:
        raise ValueError(f"Could not parse formula: {formula!r} (expected 'y ~ x1 + x2')")
    y_name = m.group(1)
    rhs = m.group(2)
    terms: List[str] = []
    intercept = True
    for raw in rhs.split("+"):
        t = raw.strip()
        if not t:
            continue
        if t == "0":
            intercept = False
            continue
        if t == "1":
            intercept = True
            continue
        terms.append(t)

    n = len(data)
    if n == 0:
        raise ValueError("data is empty")
    y = np.empty(n, dtype=float)
    for i, row in enumerate(data):
        if y_name not in row or row[y_name] is None:
            raise ValueError(f"row {i} missing outcome {y_name!r}")
        y[i] = float(row[y_name])

    cols: List[np.ndarray] = []
    col_names: List[str] = []
    if intercept:
        cols.append(np.ones(n))
        col_names.append("Intercept")
    for t in terms:
        col_names.append(t)
        vec = np.empty(n, dtype=float)
        for i, row in enumerate(data):
            if t not in row or row[t] is None:
                raise ValueError(f"row {i} missing covariate {t!r}")
            vec[i] = float(row[t])
        cols.append(vec)
    X = np.column_stack(cols)
    return y, X, col_names, y_name


def _fit_ols(y: np.ndarray, X: np.ndarray, names: List[str]) -> Dict[str, Any]:
    n, k = X.shape
    if n <= k:
        raise ValueError(f"Need n > k (n={n}, k={k}) for OLS")
    try:
        XtX_inv = np.linalg.inv(X.T @ X)
    except np.linalg.LinAlgError:
        raise ValueError("Design matrix is singular — check for collinear covariates")
    beta = XtX_inv @ X.T @ y
    resid = y - X @ beta
    dof = n - k
    sigma2 = float((resid @ resid) / dof)
    se = np.sqrt(sigma2 * np.diag(XtX_inv))
    with np.errstate(divide="ignore", invalid="ignore"):
        t_stat = beta / se
    p = _t_sf_abs(t_stat, float(dof))
    ss_tot = float(((y - y.mean()) ** 2).sum())
    ss_res = float((resid ** 2).sum())
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    adj_r2 = 1 - (1 - r2) * (n - 1) / dof if ss_tot > 0 else float("nan")
    if ss_res > 0:
        log_lik = -0.5 * n * (np.log(2 * np.pi) + np.log(ss_res / n) + 1)
    else:
        log_lik = float("nan")
    aic = 2 * k - 2 * log_lik
    bic = k * np.log(n) - 2 * log_lik
    coefficients = {
        name: {
            "estimate": float(beta[i]),
            "se": float(se[i]),
            "tValue": float(t_stat[i]),
            "pValue": float(p[i]),
        }
        for i, name in enumerate(names)
    }
    return {
        "coefficients": coefficients,
        "fit": {
            "rSquared": float(r2),
            "adjRSquared": float(adj_r2),
            "llf": float(log_lik),
            "aic": float(aic),
            "bic": float(bic),
            "n": int(n),
        },
        "residuals": resid.tolist(),
    }


def _fit_logit(y: np.ndarray, X: np.ndarray, names: List[str]) -> Dict[str, Any]:
    n, k = X.shape
    if n <= k:
        raise ValueError(f"Need n > k (n={n}, k={k}) for logit")
    if not np.all((y == 0) | (y == 1)):
        raise ValueError("logit outcome must be binary 0/1")
    beta = np.zeros(k)
    for _ in range(100):
        z = X @ beta
        p = 1.0 / (1.0 + np.exp(-z))
        W = p * (1 - p)
        grad = X.T @ (y - p)
        hess = -(X.T * W) @ X
        try:
            step = np.linalg.solve(hess, grad)
        except np.linalg.LinAlgError:
            raise ValueError("Hessian singular — check for collinearity or separation")
        beta = beta - step
        if float(np.max(np.abs(step))) < 1e-8:
            break
    z = X @ beta
    p = 1.0 / (1.0 + np.exp(-z))
    eps = 1e-12
    log_lik = float(np.sum(y * np.log(p + eps) + (1 - y) * np.log(1 - p + eps)))
    W = p * (1 - p)
    try:
        cov = np.linalg.inv((X.T * W) @ X)
    except np.linalg.LinAlgError:
        raise ValueError("Fisher information singular — check convergence")
    se = np.sqrt(np.diag(cov))
    with np.errstate(divide="ignore", invalid="ignore"):
        z_stat = beta / se
    p_val = _norm_sf_abs(z_stat)
    aic = 2 * k - 2 * log_lik
    bic = k * np.log(n) - 2 * log_lik
    coefficients = {
        name: {
            "estimate": float(beta[i]),
            "se": float(se[i]),
            "tValue": float(z_stat[i]),
            "pValue": float(p_val[i]),
        }
        for i, name in enumerate(names)
    }
    return {
        "coefficients": coefficients,
        "fit": {
            "llf": float(log_lik),
            "aic": float(aic),
            "bic": float(bic),
            "n": int(n),
        },
    }


def fit_regression(
    formula: str, data: List[Dict[str, Any]], family: str = "ols"
) -> Dict[str, Any]:
    y, X, names, _ = _parse_formula(formula, data)
    if family == "ols":
        return _fit_ols(y, X, names)
    if family == "logit":
        return _fit_logit(y, X, names)
    raise ValueError(f"Unknown family: {family}")
