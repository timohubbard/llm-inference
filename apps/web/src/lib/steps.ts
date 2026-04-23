export type StepKey =
  | "construct"
  | "corpus"
  | "traditional"
  | "llm"
  | "macro"
  | "integrate"
  | "reflexivity"
  | "export";

export interface StepDef {
  n: number;
  key: StepKey;
  label: string;
  slug: string;
  /** How this step's completion is determined. */
  source: "db" | "session";
}

export const STEPS: readonly StepDef[] = [
  { n: 1, key: "construct", label: "Construct", slug: "construct", source: "db" },
  { n: 2, key: "corpus", label: "Corpus", slug: "corpus", source: "db" },
  { n: 3, key: "traditional", label: "Traditional analysis", slug: "run", source: "db" },
  { n: 4, key: "llm", label: "LLM micro-inference", slug: "run", source: "db" },
  { n: 5, key: "macro", label: "LLM macro-inference", slug: "macro", source: "session" },
  { n: 6, key: "integrate", label: "Integration & regression", slug: "integrate", source: "session" },
  { n: 7, key: "reflexivity", label: "Reflexivity log", slug: "reflexivity", source: "db" },
  { n: 8, key: "export", label: "Export bundle", slug: "export", source: "session" },
] as const;

export function stepHref(projectId: string, slug: string): string {
  return `/projects/${projectId}/${slug}`;
}

export function nextStepHref(projectId: string, currentKey: StepKey): string | null {
  const idx = STEPS.findIndex((s) => s.key === currentKey);
  if (idx < 0 || idx === STEPS.length - 1) return null;
  const next = STEPS[idx + 1];
  if (!next) return null;
  return stepHref(projectId, next.slug);
}

/** sessionStorage keys for ephemeral step completion. */
export function sessionDoneKey(key: StepKey, projectId: string): string {
  return `step:done:${key}:${projectId}`;
}

export function markSessionStepDone(key: StepKey, projectId: string, done = true): void {
  if (typeof window === "undefined") return;
  try {
    if (done) {
      sessionStorage.setItem(sessionDoneKey(key, projectId), "1");
    } else {
      sessionStorage.removeItem(sessionDoneKey(key, projectId));
    }
    // Nudge same-tab listeners (storage event only fires cross-tab).
    window.dispatchEvent(new StorageEvent("storage", { key: sessionDoneKey(key, projectId) }));
  } catch {
    /* ignore */
  }
}
