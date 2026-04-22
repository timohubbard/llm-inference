# LLM Inference Tool

> Companion software for the Journal of Management Studies methods paper proposing **LLM inference** as a triangulation technique for quantitative textual research.

This tool operationalizes the paper's 6-step workflow:

1. **Articulate theory** — construct definitions with scale anchors, hypotheses, pre-registration metadata.
2. **Curate data** — upload or connect a corpus; validity dashboard for coverage, duplicates, encoding.
3. **Traditional analysis** — dictionary word-counting (Loughran-McDonald, LIWC-format, custom) as the primary textual measure.
4. **LLM micro-inference** — construct scoring against the rating scale, subsample review, full-corpus run, deviation analysis versus the Step-3 measure.
5. **LLM macro-inference** — inductive discovery of candidate signals; variable promotion into exploratory regressions.
6. **Integration & reporting** — combined-measure regressions, reflexivity log, export bundle (CSV / LaTeX / Markdown methods appendix / JSONL prompt archive / reproducibility manifest).

## Design principles

- **Ephemeral by default.** Uploaded corpora are processed in-memory and never persisted server-side. Per-document scores and raw LLM responses stream directly into a download bundle the researcher keeps.
- **BYOK by default.** Users paste their own API key; the tool calls the provider's list-models endpoint to populate the model dropdown. Reviewers testing the JMS demo can enter a password to unlock a server-side key capped at ~$2 of spend per session.
- **Reproducibility first.** Every run persists a manifest: provider, model alias + exact returned version string, temperature, seed, prompt version, construct version, Docker image digest for the Python sidecar.
- **Forkable.** MIT license, monorepo with a documented plugin directory for contributing new traditional analytic methods.

## Monorepo layout

```
apps/web/               Next.js 15 App Router frontend + API routes
packages/shared/        LlmProvider interface, prompt templates, Zod schemas
services/python/        FastAPI sidecar (dictionary scoring, statsmodels regressions)
methods/                Drop-in plugin directory for new TraditionalMethods (M3+)
```

## Quickstart (local dev)

Prerequisites: Node 20+, pnpm 9+, Python 3.12+, Docker (optional, for the sidecar).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in Clerk, Neon, etc.
pnpm db:migrate
pnpm dev                                        # Next.js on :3000

# In another terminal, start the Python sidecar:
cd services/python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Deploy

- **Next.js app** → Vercel. Environment variables listed in `apps/web/.env.example`.
- **Python sidecar** → Fly.io. `fly launch` from `services/python/` then `fly deploy`.
- **Database** → Neon Postgres, EU region for GDPR.

## Citing the underlying paper

```bibtex
@article{hubbard2026llminference,
  title  = {LLM Inference: Triangulating Textual Measurement in Management Research},
  author = {Hubbard, Tim and ...},
  journal = {Journal of Management Studies},
  year   = {2026},
  note   = {Methods Special Issue}
}
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Adding a new provider or traditional method only touches the plugin directory and the shared interface — the UI picks them up automatically.

## License

MIT. See [LICENSE](./LICENSE).
