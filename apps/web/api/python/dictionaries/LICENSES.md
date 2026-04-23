# Bundled dictionaries — licensing and provenance

Each JSON file in this directory is a **curated seed** derived from a published
dictionary. Seeds are provided so the demo is usable without external downloads,
but reviewers running substantive analysis should replace them with the full
published word lists (instructions per-dict below) via the **Upload custom
dictionary** flow.

## `lmd.json` — Loughran–McDonald (LM) Master Dictionary

- **Full list**: ~2,700 words across 7 sentiment categories (negative, positive,
  uncertainty, litigious, strong_modal, weak_modal, constraining).
- **Source**: Notre Dame Software Repository for Accounting and Finance (SRAF),
  <https://sraf.nd.edu/loughranmcdonald-master-dictionary/>.
- **License**: "free to use for academic research"; attribution requested.
- **What is bundled**: a ~200-word seed of the most frequent entries per
  category. The seed reproduces directional patterns on the Buffett demo but
  should not be used for published research — upload the full CSV master list
  for any substantive analysis.
- **Cite**: Loughran, T. and McDonald, B. (2011), *When Is a Liability Not a
  Liability? Textual Analysis, Dictionaries, and 10-Ks*. Journal of Finance,
  66: 35–65.

## `mfd2.json` — Moral Foundations Dictionary 2.0 (Frimer et al. 2019)

- **Full list**: 10 categories (care, harm, fairness, cheating, loyalty,
  betrayal, authority, subversion, sanctity, degradation), ~2,000 entries total
  including stemmed forms.
- **Source**: Frimer, J. A. et al. (2019). Moral Foundations Dictionary 2.0.
  OSF, <https://osf.io/xakyw/>.
- **License**: CC-BY; attribute Frimer (2019).
- **What is bundled**: a ~40-word-per-foundation seed suitable for teaching and
  demo. Substantive analysis should use the full MFD 2.0 `.dic` file via the
  Upload flow.

## `emolex.json` — NRC Emotion Lexicon (EmoLex, English subset)

- **Full list**: 10 categories (anger, anticipation, disgust, fear, joy,
  sadness, surprise, trust, positive, negative), ~14,000 English unigrams.
- **Source**: Mohammad, S. and Turney, P. (2013). *Crowdsourcing a Word-Emotion
  Association Lexicon*. Computational Intelligence, 29(3): 436–465.
- **Homepage**: <https://saifmohammad.com/WebPages/NRC-Emotion-Lexicon.htm>.
- **License**: Free for research and education with attribution; commercial
  licensing via the author.
- **What is bundled**: a ~60-word-per-emotion curated seed. The full EmoLex TSV
  is too large (~14K entries) to bundle in a serverless function; download it
  from the homepage and upload via the custom-dictionary path for substantive
  work.

## `huliu.json` — Hu & Liu Opinion Lexicon

- **Full list**: ~6,800 words (~2,000 positive, ~4,800 negative).
- **Source**: Hu, M. and Liu, B. (2004). *Mining and Summarizing Customer
  Reviews*. KDD '04.
- **Homepage**:
  <https://www.cs.uic.edu/~liub/FBS/sentiment-analysis.html#lexicon>.
- **License**: Free for academic use.
- **What is bundled**: a ~300-word-per-polarity curated seed. The full lexicon
  fits easily in memory; replace this file with the complete word list for
  substantive analysis.

---

## Upgrading any bundled dictionary

Users running real analyses should either:

1. Replace the JSON file in place with the full published word list (keeping
   the `{category: [words]}` shape), and redeploy the sidecar, or
2. Upload the full dictionary through the **Upload custom dictionary** flow in
   the Run panel (supports LIWC `.dic`, CSV, and JSON). The uploaded dictionary
   is never stored server-side — it lives only in the current browser session.

The "What's bundled is a seed" note is surfaced in the UI so reviewers
understand what they're running against.
