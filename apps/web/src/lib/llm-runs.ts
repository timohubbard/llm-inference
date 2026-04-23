// Helpers for tracking multiple LLM runs per project in sessionStorage.
// Keys:
//   scores:llm:<projectId>              — legacy single-run scores (back-compat)
//   scores:llm:<projectId>:<runId>      — per-run scores (M2+)
//   runs:llm:<projectId>                — JSON array of { runId, model, label }
//   canonical:llm:<projectId>           — runId picked for downstream steps

export type LlmScoreRow = {
  id: string;
  score: number | null;
  rationale: string;
  error?: string;
};

export type LlmRunMeta = {
  runId: string;
  model: string;
  provider: string;
  label?: string;
  createdAt: string;
};

const SCORES_KEY = (projectId: string, runId?: string) =>
  runId ? `scores:llm:${projectId}:${runId}` : `scores:llm:${projectId}`;
const RUNS_KEY = (projectId: string) => `runs:llm:${projectId}`;
const CANONICAL_KEY = (projectId: string) => `canonical:llm:${projectId}`;

export function listLlmRuns(projectId: string): LlmRunMeta[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(RUNS_KEY(projectId));
  return raw ? (JSON.parse(raw) as LlmRunMeta[]) : [];
}

export function upsertLlmRun(projectId: string, meta: LlmRunMeta): void {
  const runs = listLlmRuns(projectId).filter((r) => r.runId !== meta.runId);
  runs.push(meta);
  window.sessionStorage.setItem(RUNS_KEY(projectId), JSON.stringify(runs));
}

export function storeLlmScores(projectId: string, runId: string, scores: LlmScoreRow[]): void {
  window.sessionStorage.setItem(SCORES_KEY(projectId, runId), JSON.stringify(scores));
  // Keep legacy key in sync with the most recent run so old components don't break.
  window.sessionStorage.setItem(SCORES_KEY(projectId), JSON.stringify(scores));
}

export function loadLlmScores(projectId: string, runId?: string): LlmScoreRow[] | null {
  if (typeof window === "undefined") return null;
  if (runId) {
    const raw = window.sessionStorage.getItem(SCORES_KEY(projectId, runId));
    if (raw) return JSON.parse(raw) as LlmScoreRow[];
  }
  const legacy = window.sessionStorage.getItem(SCORES_KEY(projectId));
  return legacy ? (JSON.parse(legacy) as LlmScoreRow[]) : null;
}

export function getCanonicalRunId(projectId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(CANONICAL_KEY(projectId));
}

export function setCanonicalRunId(projectId: string, runId: string): void {
  window.sessionStorage.setItem(CANONICAL_KEY(projectId), runId);
}

/** Resolve scores to use downstream: explicit canonical → first run → legacy key. */
export function resolveCanonicalScores(projectId: string): {
  runId: string | null;
  scores: LlmScoreRow[] | null;
} {
  const canonical = getCanonicalRunId(projectId);
  if (canonical) {
    const s = loadLlmScores(projectId, canonical);
    if (s) return { runId: canonical, scores: s };
  }
  const runs = listLlmRuns(projectId);
  if (runs.length > 0) {
    const first = runs[0]!;
    const s = loadLlmScores(projectId, first.runId);
    if (s) return { runId: first.runId, scores: s };
  }
  return { runId: null, scores: loadLlmScores(projectId) };
}
