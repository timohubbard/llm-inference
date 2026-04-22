"""Loughran-McDonald sentiment dictionary (stub for M1).

The authoritative LMD dictionary is distributed by the authors and should be
loaded from the researcher's local copy or a user-supplied CSV. This seed
list covers a small subset sufficient for M1's demo and unit tests; the
`score_documents` path accepts a user-supplied dictionary for real runs.
"""

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
    "perhaps", "possible", "possibility", "predict", "risk", "tentative",
    "uncertain", "uncertainty", "unclear", "unknown", "variable",
}

LMD_LITIGIOUS = {
    "allegation", "allegations", "court", "defendant", "indict",
    "indictment", "lawsuit", "litigation", "plaintiff", "settlement",
    "subpoena", "testimony", "tort", "verdict",
}

LMD_CATEGORIES: dict[str, set[str]] = {
    "positive": LMD_POSITIVE,
    "negative": LMD_NEGATIVE,
    "uncertainty": LMD_UNCERTAINTY,
    "litigious": LMD_LITIGIOUS,
}
