# Contributing

Thanks for considering a contribution. This tool supports a published methods paper, so correctness, reproducibility,
and transparency take precedence over feature velocity.

## Coding standards

- TypeScript in strict mode. No `any` without a comment explaining why.
- Python 3.12+. `ruff` for linting, `pytest` for tests.
- Tests required for anything that affects a score, a regression, or a manifest.

## PR checklist

- [ ] `pnpm typecheck` and `pnpm test` pass locally.
- [ ] `pytest` passes in `services/python`.
- [ ] If you added a new LLM provider, it implements the full `LlmProvider` interface, including `listModels` and
      `estimateCost`, and includes a unit test with a mocked client.
- [ ] If you added a new traditional method, it lives in `methods/` (or `services/python/app/dictionaries/` for M1)
      and is exercised by an integration test on a small seeded corpus.
- [ ] Manifest fields updated in `packages/shared/src/schemas/manifest.ts` if your change affects reproducibility.
- [ ] CHANGELOG updated.

## Adding a new `LlmProvider`

1. Create `packages/shared/src/llm/providers/<name>.ts` implementing `LlmProvider`.
2. Register it in `packages/shared/src/llm/registry.ts`.
3. Add it to the `provider` enum in `apps/web/src/app/api/providers/models/route.ts` and the provider dropdown.
4. Write a unit test that mocks the SDK client and verifies `listModels`, `validateKey`, `complete`, and
   `estimateCost` behavior.

## Adding a new `TraditionalMethod`

For M1 this is still concentrated in `services/python/app/dictionaries/`. From M3 onward, new methods should drop into
`methods/<name>/` with a manifest describing inputs, outputs, and reproducibility fields. A method is expected to:

- Be deterministic given the same inputs.
- Expose a Python callable with signature `(documents: list[tuple[str, str]], params: dict) -> dict`.
- Return per-document results plus a summary and a version string that is recorded in every run manifest.

## Commit style

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`). Semver is driven from the changelog.
