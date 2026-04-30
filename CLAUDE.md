# CLAUDE.md — context for AI assistants

This file is read automatically by Claude Code when working in this repo. It
captures decisions, conventions, and operational notes that aren't obvious from
reading the code. Keep it accurate; update when you change anything below.

## What this is

Companion software for a Journal of Management Studies methods-special-issue
paper that operationalizes a 6-step framework for triangulating traditional
textual measurement (dictionaries) with LLM construct scoring. Two audiences:

1. **JMS editors / reviewers** — evaluate the tool via a password-protected
   reviewer flow against a bundled Buffett shareholder-letters demo. **Highest
   priority.** Friction here directly threatens the paper's reception.
2. **Management researchers** (BYOK) — fork or self-host, bring their own API
   keys, run on their own corpora. Currently the public-signup CTAs are
   **hidden** behind a feature flag (see "Feature flags" below); the tool is
   in pre-launch reviewer-only mode.

The user is **Tim Hubbard** (tim.hubbard@gmail.com), a management-science
researcher. He's the sole author/operator of this repo.

## Stack at a glance

- **Frontend / API**: Next.js 15 App Router + TS + Tailwind. Workspace at
  `apps/web/`.
- **Auth**: Clerk for BYOK users; cookie-based **anonymous reviewer sessions**
  for the JMS flow (Clerk is **not** required for reviewers — see "Actor
  pattern" below).
- **DB**: Neon Postgres + Drizzle. Stores project metadata, run summaries.
  **No document text** is ever persisted server-side — that's a hard rule
  (see "Ephemeral data").
- **Redis**: Upstash via Vercel Marketplace. Required for reviewer flow
  (spend caps + rate limiting). Accepts either `UPSTASH_REDIS_REST_*` or
  `KV_REST_API_*` env-var names.
- **LLM providers**: shared interface in `packages/shared/src/llm/`. Adapters
  for Anthropic, OpenAI, Google. Reviewer mode unlocks server-side keys for
  any of the three the deployment has configured.
- **Python sidecar**: not actually a separate Fly.io service in production —
  it ships as Vercel Python functions in `apps/web/api/python/`. Provides
  dictionary scoring + OLS regression. Local venv at `apps/web/.venv-test/`.
- **Hosting**: Vercel project at `llm-inference.app`, repo
  `github.com/timohubbard/llm-inference`.

## Threat model + design philosophy (READ THIS BEFORE SECURITY WORK)

Tim's explicit guidance: **"If there's a trade-off between usability and
security, focus on usability."** The reviewer pool is small and trusted. The
real adversary isn't a JMS editor — it's a leaked password reaching a
stranger, OR a real reviewer hitting friction and bailing.

Implications already baked in:

- Anonymous reviewer sessions (no forced Clerk signup) — hurts security
  posture marginally, removes a real friction wall.
- **Soft global cap** (deployment-wide daily budget, default $20) instead of
  hard per-session lockouts. A leaked password can't burn through more than
  $20/day; a real reviewer never hits it.
- No CSRF tokens, no HMAC-signed cookies — `SameSite=lax` + 2¹²⁸ session
  UUIDs is sufficient for this risk profile.
- Multi-model comparison stays available to reviewers (it's a headline
  feature; gating it would defeat the point).

Don't propose hard concurrent-session caps, per-IP active-session limits,
or "lock the reviewer out after one wrong password" defenses without a
specific reason to revisit Tim's call.

## Ephemeral data — hard rule

Document text **never** lands in Postgres or any persistent store. The
client uploads → request body → in-memory processing → SSE/NDJSON stream
back. The export bundle is assembled client-side from `sessionStorage`.

Only these things persist server-side:
- Project metadata (name, owner_id, research question)
- Construct definitions (versioned)
- Corpus *descriptors* (name, doc count, content checksum) — never the text
- Run summaries (token counts, status, model version) — not per-doc scores
- Reflexivity notes
- LLM prompt rows (template + version)

If you find yourself adding a `documents` table or storing per-doc scores
server-side, stop. Either the design is wrong or you've missed why this
constraint exists (legal redistribution risk on user-supplied corpora,
GDPR-friendliness, low cost).

## Actor pattern — the auth shim

Every protected route + page uses `currentActor()` (in
`apps/web/src/lib/actor.ts`), **not** Clerk's `auth()` directly. It returns:

- `{ id: clerkUserId, mode: "clerk" }` if signed into Clerk, **or**
- `{ id: "reviewer:<sessionId>", mode: "reviewer" }` if a valid reviewer
  cookie + Redis session exists, **or**
- `null` if neither.

`actor.id` is used as `ownerId` in DB queries. Reviewer projects are
isolated by their session ID prefix. When the reviewer cookie expires or
Redis TTL runs out, the projects orphan in Postgres — acceptable per the
ephemeral stance, but worth a future cleanup job.

**Never** add `await auth()` directly to a new route — use `currentActor()`.
Search for any existing direct `auth()` calls to see; there should be none
in route handlers.

## Reviewer flow — full picture

1. User visits `/reviewer` (no Clerk required).
2. POSTs password to `/api/reviewer/session`.
3. Route: rate-limited (10 attempts / 15 min / IP via `lib/rate-limit.ts`),
   constant-time password compare, then creates a Redis session
   (`reviewer:<uuid>:meta` + `:spent_cents`) and sets an HTTP-only cookie.
4. `currentReviewerSession()` reads cookie + Redis; returns active state
   including per-session spend, daily-budget spend, and which providers are
   covered (`REVIEWER_{ANTHROPIC,OPENAI,GOOGLE}_KEY`).
5. Every LLM call: `reserveReviewerSpend()` increments BOTH per-session
   counter AND the `reviewer:daily:YYYY-MM-DD:spent_cents` counter; if
   either exceeds its cap it rolls back and throws
   `ReviewerBudgetExhausted`. On LLM call failure, `refundReviewerSpend()`
   decrements both — reviewers don't pay budget for our errors.
6. The `ReviewerBadge` component shows `$X session · $Y today` in the nav.

If the reviewer flow seems broken, check:
- Is Upstash configured? (Both URL + token env vars present.)
  Without it, `currentReviewerSession()` returns `active: false` and
  `startReviewerSession()` throws a clear error.
- Is Vercel using `KV_REST_API_*` (Marketplace integration) or
  `UPSTASH_REDIS_REST_*` (legacy)? `lib/reviewer.ts` accepts either.

## Demo snapshot at `/demo`

`/demo` is a **read-only static page** rendering a real captured run of all
8 steps against the Buffett corpus. Reviewers consume zero tokens viewing
it. Source of truth: `apps/web/public/demo/snapshot.json`.

The data is **real**, not synthetic:
- Dictionary scores: deterministic LMD or regfocus output via the Python
  sidecar against the bundled corpus.
- LLM scores + rationales: real Anthropic `claude-sonnet-4-5-20250929`
  output at temperature 0 (~$0.05 / 20 docs).
- Triangulation r/ρ + OLS coefficients: real numpy + Student-t p-values.
- Outcome variable: still illustrative (synthetic forward-return series);
  noted as such in the regression interpretation.

To refresh:
```bash
# Recompute LMD/regfocus + triangulation + regression on existing LLM scores:
pnpm demo:rebuild

# Capture fresh LLM scores (requires real Anthropic key in env):
ANTHROPIC_API_KEY=sk-ant-... pnpm demo:capture
# This re-runs Anthropic against the 20 Buffett docs and chains rebuild.
```

The default dictionary for the snapshot is `regfocus` (Gamache et al. 2015).
Override with `DEMO_DICT_METHOD=lmd pnpm demo:rebuild` etc.

## Bundled dictionaries

In `apps/web/api/python/dictionaries/`, loaded at sidecar import time. Each
JSON has a `_meta` block with the primary-measure spec.

| ID | Source | Notes |
|---|---|---|
| `regfocus` | **Default.** Gamache et al. (2015) AMJ Table 1 verbatim — 27 promotion + 25 prevention stems with tense expansions. | Primary: `(promotion − prevention) / tokens`. Original paper uses each as a separate measure. |
| `lmd` | Loughran–McDonald (seed) | 7 sentiment categories. Bundled is ~200 words/cat; full LMD is ~2,700 words — upload via custom-dict for substantive analysis. |
| `mfd2` | Moral Foundations 2.0 (Frimer 2019) | 10 categories. |
| `emolex` | NRC EmoLex (English subset, seed) | 10 categories. |
| `huliu` | Hu & Liu opinion lexicon (seed) | 2 categories. |

`LICENSES.md` in that dir has full attribution. Tim has the full Gamache
PDF at `/Users/timothyhubbard/Desktop/H&M4 (CEO-COVID19)/files/5279/`.

## Buffett demo construct

After JMS reviewer feedback, the seeded construct is **unipolar Promotion
Focus** (1 = no promotion language, 7 = strongly promotion-focused). The
old bipolar `1: prevention-focused / 7: promotion-focused` was theoretically
inconsistent with Higgins (1997) — promotion and prevention are independent
dimensions, not poles of one scale. This decision is documented in:
- `apps/web/src/app/projects/[id]/construct/construct-form.tsx` (the seed
  values)
- `apps/web/public/demo/snapshot.json` (the rendered demo)
- The reflexivity log in the snapshot explains it for readers

## Feature flags

| Flag | Location | Default | What it controls |
|---|---|---|---|
| `SHOW_SIGNUP_CTAS` | `apps/web/src/app/page.tsx` (top of file) | `false` | Header "Sign in" + hero "Get started" / "Open a project" buttons. The reviewer + demo entrypoints stay visible regardless. Flip to `true` and redeploy to re-open public BYOK signup. |

## Environment variables (Vercel)

| Var | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | yes | Clerk auth for BYOK users (and reviewer page renders even without). |
| `DATABASE_URL` | yes | Neon Postgres. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` <br> *(or `KV_REST_API_URL` + `KV_REST_API_TOKEN`)* | yes | Reviewer session state, spend caps, rate limiting. **Reviewer flow refuses to activate without these.** |
| `REVIEWER_PASSWORD` | yes (for reviewer flow) | The shared password Tim distributes to JMS editors/reviewers. |
| `REVIEWER_ANTHROPIC_KEY` / `REVIEWER_OPENAI_KEY` / `REVIEWER_GOOGLE_KEY` | at least one | Server-side keys unlocked when a reviewer session is active. Tim has all three. |
| `REVIEWER_SPEND_CAP_USD` | optional, default `2` | Per-session cap. |
| `REVIEWER_DAILY_BUDGET_USD` | optional, default `20` | Deployment-wide daily cap. **Tim picked $20.** |
| `REVIEWER_SESSION_TTL_DAYS` | optional, default `7` | Cookie + Redis TTL. |
| `BLOB_READ_WRITE_TOKEN` | optional | Vercel Blob; not currently used. |
| `SENTRY_DSN` | optional | Not wired up yet. |

`apps/web/.env.example` documents these. Keep it in sync.

## Things you should NOT change without Tim's say-so

- The ephemeral-data rule (no per-doc scores in Postgres).
- The `currentActor()` pattern. New routes use it; don't add direct
  `auth()` calls.
- The reviewer-friendly defense posture (no hard concurrent-session caps,
  no per-IP active-session limits, etc.).
- The `/demo` page's data source — it's real, captured output. Don't replace
  it with synthetic numbers without re-running `pnpm demo:capture`.
- `regfocus` as the default Step 3 dictionary.
- The unipolar Promotion Focus seed in `construct-form.tsx`.
- The "JMS" wording — Tim explicitly removed it from button labels (kept it
  in the prose hero description, which is contextually about the paper).
- `SHOW_SIGNUP_CTAS = false` — Tim wants this hidden until he says otherwise.

## Useful commands

```bash
# Typecheck both workspaces
pnpm -r typecheck

# Refresh the demo snapshot
pnpm demo:rebuild                          # no API key needed; recomputes stats
ANTHROPIC_API_KEY=sk-... pnpm demo:capture # full re-capture; chains rebuild

# Local dev
pnpm dev                                   # apps/web
```

The Python sidecar tests live in `apps/web/api/python/tests/`. Run them
with the bundled venv:
```bash
apps/web/.venv-test/bin/python3 -m pytest apps/web/api/python/tests/
```

## Repo layout pointer

```
/
├── apps/web/                           Next.js app
│   ├── src/app/                        App Router routes
│   ├── src/app/api/reviewer/session/   Reviewer auth flow
│   ├── src/app/api/llm/                LLM run + macro + estimate
│   ├── src/app/api/traditional/        Dictionary scoring proxy
│   ├── src/app/demo/                   Read-only snapshot viewer
│   ├── src/lib/actor.ts                currentActor() — auth shim
│   ├── src/lib/reviewer.ts             Reviewer session + spend tracking
│   ├── src/lib/rate-limit.ts           Upstash fixed-window helper
│   ├── src/lib/use-reviewer-session.ts Client hook
│   ├── src/components/reviewer-badge.tsx Nav UI for active session
│   ├── api/python/                     Sidecar (deployed as Vercel Python fns)
│   │   ├── _shared.py                  Tokenize, dict registry, OLS
│   │   ├── dictionary.py               POST /api/python/dictionary
│   │   ├── regression.py               POST /api/python/regression
│   │   └── dictionaries/*.json         Bundled lexicons
│   ├── public/demo/buffett/            20 shareholder-letter excerpts
│   ├── public/demo/snapshot.json       Captured /demo data
│   └── .env.example                    All required env vars
├── packages/shared/                    Provider interface, prompts, schemas
├── scripts/
│   ├── build_demo_snapshot.py          LMD/regfocus + stats recompute
│   └── capture_llm_scores.ts           Anthropic batch capture
└── CLAUDE.md                           This file
```

## Recent work — last ~25 commits, newest first

- `4010c0f` chore: hide BYOK signup CTAs behind a feature flag
- `fc25a83` feat(dict): add Gamache et al. (2015) regulatory focus dictionary as default
- `8af4420` chore: drop "JMS" from reviewer-access labels
- `b0bdaeb` feat: harden reviewer flow with usability-first defenses
  *(daily budget, rate limit, refund-on-failure, drop bad model defaults)*
- `834a14c` feat(demo): replace synthetic snapshot with real LMD + Sonnet 4.5
- `7ee9f50` feat: reviewer feedback round 1 (copy, demo construct, /demo)
- `220061d` feat(macro): model picker UX matches Step 4
- `301f65d` feat(reviewer): anonymous reviewer sessions (no Clerk required)
- `269705f` feat(reviewer): server-side keys for all three providers
- `10d3212` feat(m2): multi-model LLM comparison + expanded dictionaries

Use `git log --oneline -30` for the rest.

## Open / future items (no commitment, no urgency)

- Cleanup job for orphaned anonymous reviewer projects in Postgres.
- Wire up Sentry for production error tracking.
- Make `estimateCost()` precise for OpenAI + Google (both currently return
  `null`); use real tokenizers (`tiktoken` etc.) instead of `chars/4`.
- Replace per-emotion / per-foundation seed dictionaries with the full
  published lists (the upload flow already supports the full files).
- The bundled Buffett corpus is paragraph excerpts (~110 tokens each), not
  full letters. Statistical power in the regression is illustrative; if a
  reviewer asks "why is R² so low?" the answer is "it's a teaching demo."
  Eventually consider shipping fuller text.
- Playwright E2E tests for the reviewer flow.
