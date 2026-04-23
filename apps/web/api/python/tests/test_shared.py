import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..")))

from _shared import fit_regression, score_documents, tokenize  # noqa: E402


def test_tokenize_handles_unicode_and_apostrophes():
    toks = tokenize("Firm's growth was strong; 2024 numbers — naïve!")
    assert "firm's" in toks
    assert "growth" in toks
    assert "naïve" in toks
    assert "2024" not in toks  # regex matches \p{L}+ only


def test_lmd_counts_positive_and_negative():
    docs = [
        {"id": "d1", "text": "Our growth was strong and profitable this year with great improvement."},
        {"id": "d2", "text": "The losses were severe; the decline was disappointing and poor."},
        {"id": "d3", "text": "Nothing happening here."},
    ]
    out = score_documents(method="lmd", documents=docs)
    scores = {s["id"]: s for s in out["scores"]}
    assert scores["d1"]["categoryCounts"]["positive"] > scores["d1"]["categoryCounts"]["negative"]
    assert scores["d2"]["categoryCounts"]["negative"] > scores["d2"]["categoryCounts"]["positive"]
    assert "score" not in scores["d1"]  # primary measure now computed client-side
    assert out["meta"]["id"] == "lmd"
    assert "positive" in out["meta"]["categories"]
    assert out["sidecarVersion"].startswith("0.")


def test_bundled_dictionaries_load():
    from _shared import BUNDLED_DICTS  # noqa: WPS433
    for expected in ("lmd", "mfd2", "emolex", "huliu"):
        assert expected in BUNDLED_DICTS, f"missing bundled dict: {expected}"
        entry = BUNDLED_DICTS[expected]
        assert entry["categories"], f"{expected} has no category word lists"
        assert entry["meta"].get("id") == expected


def test_mfd2_routes_virtue_and_vice():
    docs = [
        {"id": "virtue", "text": "Their compassion and kindness protected the vulnerable with empathy."},
        {"id": "vice", "text": "The cruelty and harm inflicted violent torture on innocent victims."},
    ]
    out = score_documents(method="mfd2", documents=docs)
    by_id = {s["id"]: s for s in out["scores"]}
    assert by_id["virtue"]["categoryCounts"]["care"] > 0
    assert by_id["vice"]["categoryCounts"]["harm"] > 0


def test_custom_dictionary():
    docs = [{"id": "d1", "text": "Brand equity drove margin expansion and customer delight."}]
    out = score_documents(
        method="custom_dict",
        documents=docs,
        user_dictionary={"brand": ["brand", "margin"], "customer": ["customer", "delight"]},
    )
    counts = out["scores"][0]["categoryCounts"]
    assert counts["brand"] == 2
    assert counts["customer"] == 2


def test_ols_recovers_known_coefficients():
    rng = np.random.default_rng(42)
    x = rng.normal(size=200)
    y = 1.5 + 2.0 * x + rng.normal(scale=0.5, size=200)
    data = [{"y": float(y[i]), "x": float(x[i])} for i in range(len(x))]
    out = fit_regression("y ~ x", data, family="ols")
    assert out["fit"]["n"] == 200
    assert abs(out["coefficients"]["Intercept"]["estimate"] - 1.5) < 0.15
    assert abs(out["coefficients"]["x"]["estimate"] - 2.0) < 0.15
    assert out["coefficients"]["x"]["pValue"] < 1e-6
    assert 0.9 < out["fit"]["rSquared"] < 1.0


def test_ols_multiple_regressors():
    rng = np.random.default_rng(7)
    n = 150
    x1 = rng.normal(size=n)
    x2 = rng.normal(size=n)
    y = 0.5 + 1.0 * x1 - 0.5 * x2 + rng.normal(scale=0.3, size=n)
    data = [{"y": float(y[i]), "x1": float(x1[i]), "x2": float(x2[i])} for i in range(n)]
    out = fit_regression("y ~ x1 + x2", data, family="ols")
    assert abs(out["coefficients"]["x1"]["estimate"] - 1.0) < 0.1
    assert abs(out["coefficients"]["x2"]["estimate"] - (-0.5)) < 0.1


def test_logit_recovers_sign():
    rng = np.random.default_rng(3)
    n = 500
    x = rng.normal(size=n)
    logits = -0.3 + 1.4 * x
    p = 1 / (1 + np.exp(-logits))
    y = (rng.random(n) < p).astype(int)
    data = [{"y": int(y[i]), "x": float(x[i])} for i in range(n)]
    out = fit_regression("y ~ x", data, family="logit")
    assert out["coefficients"]["x"]["estimate"] > 0.5
    assert out["coefficients"]["x"]["pValue"] < 1e-6


def test_rejects_malformed_formula():
    with pytest.raises(ValueError):
        fit_regression("no tilde here", [{"y": 1, "x": 2}, {"y": 2, "x": 3}, {"y": 3, "x": 4}])
