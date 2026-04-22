# Changelog

All notable changes to this project will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions use [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Monorepo scaffold (`apps/web`, `packages/shared`, `services/python`).
- `LlmProvider` interface with Anthropic, OpenAI / OpenAI-compatible, and Google Gemini adapters.
- Construct-scoring prompt template + Zod-validated output with retry-on-parse-fail.
- Drizzle schema for projects, constructs, hypotheses, corpora (descriptors only — no document bodies), LLM prompts,
  traditional runs, LLM runs, reflexivity notes, and audit events.
- Clerk auth middleware; reviewer-access flow with Upstash-backed spend cap.
- FastAPI sidecar with Loughran–McDonald dictionary scoring and statsmodels regression harness.
- Streaming NDJSON API for LLM construct scoring; client-side deviation analysis with Pearson/Spearman and
  top-disagreement inspection.
- Export bundle (scores CSV + methods appendix Markdown) generated in the browser.
- GitHub Actions CI (typecheck, Vitest, pytest, sidecar Docker build).
