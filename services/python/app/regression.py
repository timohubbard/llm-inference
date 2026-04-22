from __future__ import annotations

from typing import Literal

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf


def fit_regression(
    formula: str,
    data: list[dict],
    *,
    family: Literal["ols", "logit"] = "ols",
) -> dict:
    df = pd.DataFrame(data)
    if family == "ols":
        model = smf.ols(formula=formula, data=df).fit()
        fit = {
            "rSquared": float(model.rsquared),
            "adjRSquared": float(model.rsquared_adj),
            "llf": float(model.llf),
            "aic": float(model.aic),
            "bic": float(model.bic),
            "n": int(model.nobs),
        }
    elif family == "logit":
        model = smf.logit(formula=formula, data=df).fit(disp=False)
        fit = {
            "llf": float(model.llf),
            "aic": float(model.aic),
            "bic": float(model.bic),
            "n": int(model.nobs),
        }
    else:
        raise ValueError(f"Unknown family: {family}")

    coefs: dict[str, dict[str, float]] = {}
    for name in model.params.index:
        coefs[name] = {
            "estimate": float(model.params[name]),
            "se": float(model.bse[name]),
            "tValue": float(model.tvalues[name]),
            "pValue": float(model.pvalues[name]),
        }
    residuals = model.resid.tolist() if family == "ols" else None
    return {
        "coefficients": coefs,
        "fit": fit,
        "residuals": residuals,
    }


def _suppress(_: np.ndarray) -> None:
    # Placeholder so numpy import is retained for future ridge/lasso variants.
    return None


__all__ = ["fit_regression"]
