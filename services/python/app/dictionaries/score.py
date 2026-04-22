from __future__ import annotations

import regex as re
from typing import Iterable

from .lmd import LMD_CATEGORIES

_WORD_RE = re.compile(r"\p{L}+(?:'\p{L}+)?", re.UNICODE)


def _tokenize(text: str) -> list[str]:
    return [m.group(0).lower() for m in _WORD_RE.finditer(text)]


def _compile_dict(dictionary: dict[str, Iterable[str]]) -> dict[str, set[str]]:
    return {k: {t.lower() for t in v} for k, v in dictionary.items()}


def score_documents(
    *,
    method: str,
    documents: list[tuple[str, str]],
    user_dictionary: dict[str, list[str]] | None,
) -> dict:
    if method == "lmd":
        categories = LMD_CATEGORIES
    elif method == "custom_dict":
        if not user_dictionary:
            raise ValueError("custom_dict method requires `dictionary` payload")
        categories = _compile_dict(user_dictionary)
    elif method == "liwc":
        if not user_dictionary:
            raise ValueError(
                "liwc method requires a user-supplied dictionary — upload your licensed LIWC file.",
            )
        categories = _compile_dict(user_dictionary)
    else:
        raise ValueError(f"Unknown method: {method}")

    scores: list[dict] = []
    for doc_id, text in documents:
        tokens = _tokenize(text)
        counts: dict[str, int] = {cat: 0 for cat in categories}
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

    summary = {
        "docCount": len(documents),
        "categories": sorted(categories.keys()),
    }
    return {"scores": scores, "summary": summary}
