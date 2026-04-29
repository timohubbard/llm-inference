"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeviationView } from "@/app/projects/[id]/deviation/deviation-view";
import { ModelAgreementPanel } from "@/components/model-agreement-panel";
import { StepCompleteBanner } from "@/components/step-complete-banner";
import { parseDictionaryFile } from "@/lib/dict-parsers";
import {
  getCanonicalRunId,
  listLlmRuns,
  setCanonicalRunId,
  storeLlmScores,
  upsertLlmRun,
  type LlmRunMeta,
  type LlmScoreRow,
} from "@/lib/llm-runs";
import { markSessionStepDone } from "@/lib/steps";
import { reviewerCoversProvider, useReviewerSession } from "@/lib/use-reviewer-session";

interface Construct {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
}
interface Corpus { id: string; docCount: number }

type Doc = { id: string; text: string };
type ProviderId = "anthropic" | "openai" | "google";

type DictBundledMethod = "regfocus" | "lmd" | "mfd2" | "emolex" | "huliu";
type DictMethod = DictBundledMethod | "custom";

const BUNDLED_DICTS: Array<{ id: DictBundledMethod; label: string; description: string }> = [
  { id: "regfocus", label: "Regulatory Focus (Gamache et al. 2015)", description: "promotion / prevention" },
  { id: "lmd", label: "Loughran–McDonald (finance)", description: "7 sentiment categories" },
  { id: "mfd2", label: "Moral Foundations 2.0", description: "5 foundations × virtue/vice" },
  { id: "emolex", label: "NRC EmoLex", description: "8 emotions + pos/neg" },
  { id: "huliu", label: "Hu & Liu opinion lexicon", description: "positive / negative" },
];

type DictMeta = {
  id: string;
  name?: string;
  note?: string;
  categories: string[];
  primaryCategory: string | null;
  primaryMeasure?: { label: string } | null;
};

type DictResult = {
  scores: Array<{ id: string; score: number; tokenCount: number; categoryCounts: Record<string, number> }>;
  meta: DictMeta;
};

interface ModelRunState {
  runId: string | null;
  model: string;
  provider: ProviderId;
  apiKey: string;
  models: Array<{ id: string; displayName: string }>;
  phase: "idle" | "sample" | "full";
  sample: LlmScoreRow[];
  full: LlmScoreRow[];
  error?: string;
  estCost?: number;
}

function emptySlot(): ModelRunState {
  return {
    runId: null,
    model: "",
    provider: "anthropic",
    apiKey: "",
    models: [],
    phase: "idle",
    sample: [],
    full: [],
  };
}

export function RunPanel({ projectId, construct, corpus }: { projectId: string; construct: Construct; corpus: Corpus }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [slotA, setSlotA] = useState<ModelRunState>(() => emptySlot());
  const [slotB, setSlotB] = useState<ModelRunState>(() => emptySlot());
  const [useSecondModel, setUseSecondModel] = useState(false);
  const [sampleSize, setSampleSize] = useState(5);

  const [dictMethod, setDictMethod] = useState<DictMethod>("regfocus");
  const [primaryCategory, setPrimaryCategory] = useState<string>("");
  const [dictBusy, setDictBusy] = useState(false);
  const [dictErr, setDictErr] = useState<string | null>(null);
  const [dictResult, setDictResult] = useState<DictResult | null>(null);
  const [customDict, setCustomDict] = useState<{ name: string; dict: Record<string, string[]> } | null>(null);

  const [canonicalRunId, setCanonicalRunIdState] = useState<string | null>(null);
  const [totalCostEst, setTotalCostEst] = useState<number | null>(null);
  const [globalErr, setGlobalErr] = useState<string | null>(null);
  const reviewer = useReviewerSession();

  useEffect(() => {
    const raw = sessionStorage.getItem(`corpus:${projectId}`);
    if (raw) setDocs(JSON.parse(raw) as Doc[]);
    setCanonicalRunIdState(getCanonicalRunId(projectId));
  }, [projectId]);

  const sample = useMemo(() => {
    if (!docs) return [];
    const shuffled = [...docs].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(sampleSize, docs.length));
  }, [docs, sampleSize]);

  // -------- Dictionary scoring --------

  async function loadCustomDict(file: File) {
    setDictErr(null);
    try {
      const text = await file.text();
      const dict = parseDictionaryFile(file.name, text);
      setCustomDict({ name: file.name, dict });
      setDictMethod("custom");
    } catch (e) {
      setDictErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function runDictionary() {
    if (!docs) return;
    setDictBusy(true);
    setDictErr(null);
    try {
      const payload: {
        method: string;
        corpusId: string;
        documents: Doc[];
        dictionary?: Record<string, string[]>;
        primaryCategory?: string;
      } = {
        method: dictMethod === "custom" ? "custom_dict" : dictMethod,
        corpusId: corpus.id,
        documents: docs,
      };
      if (dictMethod === "custom") {
        if (!customDict) throw new Error("Upload a dictionary file first.");
        payload.dictionary = customDict.dict;
      }
      if (primaryCategory) payload.primaryCategory = primaryCategory;
      const res = await fetch(`/api/traditional/dictionary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Dictionary scoring failed");
      setDictResult({ scores: body.scores, meta: body.meta });
      sessionStorage.setItem(
        `scores:dict:${projectId}`,
        JSON.stringify(body.scores.map((s: { id: string; score: number }) => ({ id: s.id, score: s.score }))),
      );
      sessionStorage.setItem(`scores:dict:meta:${projectId}`, JSON.stringify(body.meta));
      markSessionStepDone("traditional", projectId, true);
    } catch (e) {
      setDictErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDictBusy(false);
    }
  }

  // -------- LLM run helpers --------

  async function listModels(which: "A" | "B") {
    const slot = which === "A" ? slotA : slotB;
    const setSlot = which === "A" ? setSlotA : setSlotB;
    setGlobalErr(null);
    try {
      const res = await fetch("/api/providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: slot.provider, apiKey: slot.apiKey }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Key validation failed");
      setSlot({ ...slot, models: body.models, model: body.models[0]?.id ?? slot.model });
    } catch (e) {
      setGlobalErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function streamRun(
    input: Doc[],
    slot: ModelRunState,
    onRow: (rows: LlmScoreRow[]) => void,
  ): Promise<{ rows: LlmScoreRow[]; runId: string | null }> {
    const res = await fetch(`/api/llm/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        constructId: construct.id,
        corpusId: corpus.id,
        provider: slot.provider,
        apiKey: slot.apiKey,
        model: slot.model,
        documents: input,
      }),
    });
    if (!res.ok || !res.body) throw new Error(await res.text());
    const runId = res.headers.get("X-Run-Id");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const rows: LlmScoreRow[] = [];
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        rows.push(JSON.parse(line) as LlmScoreRow);
        onRow([...rows]);
      }
    }
    return { rows, runId };
  }

  const slotLabel = useCallback((slot: ModelRunState, which: "A" | "B") => {
    if (slot.model) return slot.model;
    return which === "A" ? "Model A" : "Model B";
  }, []);

  async function runSubsample() {
    if (!docs) return;
    const which: Array<{ slot: ModelRunState; set: typeof setSlotA; key: "A" | "B" }> = [
      { slot: slotA, set: setSlotA, key: "A" },
    ];
    if (useSecondModel) which.push({ slot: slotB, set: setSlotB, key: "B" });
    // mark sample phase + clear
    for (const w of which) w.set({ ...w.slot, phase: "sample", sample: [], error: undefined });
    setGlobalErr(null);

    await Promise.all(
      which.map(async (w) => {
        try {
          const { rows } = await streamRun(sample, w.slot, (partial) => {
            w.set((prev) => ({ ...prev, sample: partial }));
          });
          w.set((prev) => ({ ...prev, sample: rows, phase: "idle" }));
        } catch (e) {
          w.set((prev) => ({ ...prev, phase: "idle", error: e instanceof Error ? e.message : String(e) }));
        }
      }),
    );

    // Cost estimate per model
    try {
      const provider = slotA.provider; // single provider for now if using second model on same provider
      const models = which.map((w) => w.slot.model).filter(Boolean);
      if (models.length === 0) return;
      const provs = new Set(which.map((w) => w.slot.provider));
      if (provs.size === 1) {
        const est = await fetch("/api/llm/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, models, docsSample: sample, totalDocs: docs.length }),
        }).then((r) => r.json());
        if (est.estimates) {
          const byModel = new Map<string, number>(est.estimates.map((e: { model: string; estimatedUsd: number }) => [e.model, e.estimatedUsd]));
          setSlotA((p) => ({ ...p, estCost: byModel.get(p.model) }));
          if (useSecondModel) setSlotB((p) => ({ ...p, estCost: byModel.get(p.model) }));
          setTotalCostEst(est.totalUsd);
        }
      } else {
        // Fall back: per-provider round-trip
        for (const w of which) {
          const res = await fetch("/api/llm/estimate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: w.slot.provider, model: w.slot.model, docsSample: sample, totalDocs: docs.length }),
          }).then((r) => r.json());
          w.set((prev) => ({ ...prev, estCost: res.estimatedUsd ?? res.totalUsd ?? null }));
        }
        setTotalCostEst(null);
      }
    } catch {
      // estimate is best-effort
    }
  }

  async function runFull() {
    if (!docs) return;
    const which: Array<{ slot: ModelRunState; set: typeof setSlotA; key: "A" | "B" }> = [
      { slot: slotA, set: setSlotA, key: "A" },
    ];
    if (useSecondModel) which.push({ slot: slotB, set: setSlotB, key: "B" });

    for (const w of which) w.set({ ...w.slot, phase: "full", full: [], error: undefined });
    setGlobalErr(null);

    await Promise.all(
      which.map(async (w) => {
        try {
          const { rows, runId } = await streamRun(docs, w.slot, (partial) => {
            w.set((prev) => ({ ...prev, full: partial }));
          });
          if (runId) {
            storeLlmScores(projectId, runId, rows);
            const meta: LlmRunMeta = {
              runId,
              model: w.slot.model,
              provider: w.slot.provider,
              label: w.slot.model,
              createdAt: new Date().toISOString(),
            };
            upsertLlmRun(projectId, meta);
            w.set((prev) => ({ ...prev, full: rows, runId, phase: "idle" }));
          } else {
            w.set((prev) => ({ ...prev, full: rows, phase: "idle" }));
          }
        } catch (e) {
          w.set((prev) => ({ ...prev, phase: "idle", error: e instanceof Error ? e.message : String(e) }));
        }
      }),
    );

    // If only one run, auto-pick canonical. If two, leave for user selection.
    const runs = listLlmRuns(projectId);
    if (runs.length === 1) {
      setCanonicalRunId(projectId, runs[0]!.runId);
      setCanonicalRunIdState(runs[0]!.runId);
    }
    markSessionStepDone("llm", projectId, true);
  }

  async function selectCanonical(runId: string, otherRunId: string, stats: {
    pearson: number | null;
    icc: number | null;
    mad: number | null;
    n: number;
  }) {
    setCanonicalRunId(projectId, runId);
    setCanonicalRunIdState(runId);
    const runs = listLlmRuns(projectId);
    const chosen = runs.find((r) => r.runId === runId);
    const other = runs.find((r) => r.runId === otherRunId);
    if (!chosen || !other) return;
    const body = `Selected ${chosen.model} as the canonical LLM measure after comparing against ${other.model}. n=${stats.n}, Pearson r=${fmtStat(stats.pearson)}, ICC(2,1)=${fmtStat(stats.icc)}, mean |Δ|=${fmtStat(stats.mad)}.`;
    try {
      await fetch(`/api/projects/${projectId}/reflexivity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, linkedRunId: runId }),
      });
    } catch {
      // non-fatal — reflexivity log can be edited manually later
    }
  }

  // -------- Render helpers --------

  const dictCategories = useMemo(() => {
    if (!dictResult) return [] as string[];
    return dictResult.meta.categories;
  }, [dictResult]);

  const dictAverages = useMemo(() => {
    if (!dictResult) return [];
    const sums: Record<string, number> = {};
    let totalTokens = 0;
    for (const s of dictResult.scores) {
      totalTokens += s.tokenCount;
      for (const [k, v] of Object.entries(s.categoryCounts)) sums[k] = (sums[k] ?? 0) + v;
    }
    return Object.entries(sums)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ category: k, count: v, rate: totalTokens > 0 ? v / totalTokens : 0 }));
  }, [dictResult]);

  const bothFullDone = slotA.full.length > 0 && (!useSecondModel || slotB.full.length > 0);
  const fullInFlight = slotA.phase === "full" || slotB.phase === "full";

  return (
    <div className="mt-6 space-y-8">
      {!docs ? (
        <p className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm">
          No documents loaded into this browser session. Revisit{" "}
          <Link href={`/projects/${projectId}/corpus`} className="underline">
            Step 2 — Corpus
          </Link>{" "}
          and load the demo or upload a file.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {docs.length} documents loaded in this session. Construct: <b>{construct.name}</b> (scale {construct.scaleMin}–{construct.scaleMax}).
        </p>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Step 3 — Traditional analysis (dictionary)</h2>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Dictionary
            <select
              value={dictMethod}
              onChange={(e) => {
                const next = e.target.value as DictMethod;
                setDictMethod(next);
                setPrimaryCategory("");
              }}
              className="mt-1 w-full rounded border px-2 py-1"
            >
              {BUNDLED_DICTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} — {d.description}
                </option>
              ))}
              <option value="custom">Upload custom dictionary…</option>
            </select>
          </label>
          {dictMethod === "custom" ? (
            <CustomDictUpload current={customDict} onUpload={loadCustomDict} />
          ) : (
            <div className="text-xs text-muted-foreground">
              Bundled seed — see the bottom of Step 6 export for citations and notes on replacing with the full list.
            </div>
          )}
        </div>

        {dictCategories.length > 0 && dictCategories.length > 2 ? (
          <label className="mt-3 block text-sm">
            Primary measure
            <select
              value={primaryCategory}
              onChange={(e) => setPrimaryCategory(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 md:w-80"
            >
              <option value="">
                {dictResult?.meta.primaryMeasure?.label ?? "default (per-dictionary)"}
              </option>
              {dictCategories.map((c) => (
                <option key={c} value={c}>
                  {c} (count / tokens)
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              Controls which single number flows into Step 5 deviation and Step 6 regression. Per-category counts are always exported.
            </span>
          </label>
        ) : null}

        <button
          onClick={runDictionary}
          disabled={!docs || dictBusy || (dictMethod === "custom" && !customDict)}
          className="mt-3 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {dictBusy ? "Scoring…" : "Run dictionary scoring"}
        </button>
        {dictErr ? <p className="mt-2 text-sm text-destructive">{dictErr}</p> : null}

        {dictResult ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Scored {dictResult.scores.length} documents with <b>{dictResult.meta.name ?? dictResult.meta.id}</b>.
              Mean primary score: {(dictResult.scores.reduce((a, b) => a + b.score, 0) / dictResult.scores.length).toFixed(3)}.
            </p>
            {dictAverages.length > 0 ? (
              <div className="rounded border p-3">
                <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Per-category totals (corpus-wide)</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-3">
                  {dictAverages.map((c) => (
                    <div key={c.category} className="flex justify-between tabular-nums">
                      <span className="font-mono">{c.category}</span>
                      <span>{c.count} ({(c.rate * 100).toFixed(2)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {dictResult.meta.note ? <p className="text-xs text-muted-foreground">{dictResult.meta.note}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Step 4 — LLM micro-inference</h2>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useSecondModel}
            onChange={(e) => setUseSecondModel(e.target.checked)}
          />
          Score with a second model for comparison (dual-rater triangulation)
        </label>

        <div className={`mt-3 grid gap-4 ${useSecondModel ? "md:grid-cols-2" : ""}`}>
          <ModelSlot
            label="Model A"
            slot={slotA}
            onChange={setSlotA}
            onLoadModels={() => listModels("A")}
            reviewerCovers={reviewerCoversProvider(reviewer, slotA.provider)}
          />
          {useSecondModel ? (
            <ModelSlot
              label="Model B"
              slot={slotB}
              onChange={setSlotB}
              onLoadModels={() => listModels("B")}
              reviewerCovers={reviewerCoversProvider(reviewer, slotB.provider)}
            />
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm">
            Subsample size
            <input
              type="number"
              min={1}
              max={docs?.length ?? 1}
              value={sampleSize}
              onChange={(e) => setSampleSize(Number(e.target.value))}
              className="ml-2 w-20 rounded border px-2 py-1"
            />
          </label>
          <button
            onClick={runSubsample}
            disabled={!docs || slotA.phase !== "idle" || slotB.phase !== "idle" || !slotA.model || (useSecondModel && !slotB.model)}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
          >
            {slotA.phase === "sample" || slotB.phase === "sample" ? "Scoring subsample…" : "Run subsample"}
          </button>
        </div>

        {(slotA.sample.length > 0 || slotB.sample.length > 0) ? (
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-medium">Subsample review</h3>
            <SubsampleTable slotA={slotA} slotB={useSecondModel ? slotB : null} />
            <div className="rounded border p-3 text-sm">
              {useSecondModel && totalCostEst !== null ? (
                <p>
                  Estimated full-corpus cost: <b>${totalCostEst.toFixed(2)}</b> across both models
                  ({slotA.estCost !== undefined ? `A ≈ $${slotA.estCost.toFixed(2)}` : "A: —"}
                  {slotB.estCost !== undefined ? `, B ≈ $${slotB.estCost.toFixed(2)}` : ""})
                  for {docs?.length ?? 0} documents.
                </p>
              ) : slotA.estCost !== undefined ? (
                <p>
                  Estimated full-corpus cost: <b>${slotA.estCost.toFixed(2)}</b> for {docs?.length ?? 0} documents.
                </p>
              ) : null}
            </div>
            <button
              onClick={runFull}
              disabled={fullInFlight}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
            >
              {fullInFlight
                ? `Scoring… A: ${slotA.full.length}/${docs?.length ?? 0}${useSecondModel ? `, B: ${slotB.full.length}/${docs?.length ?? 0}` : ""}`
                : "Confirm & run full corpus"}
            </button>
          </div>
        ) : null}

        {slotA.error ? <p className="mt-3 text-sm text-destructive">Model A: {slotA.error}</p> : null}
        {useSecondModel && slotB.error ? <p className="mt-1 text-sm text-destructive">Model B: {slotB.error}</p> : null}
      </section>

      {bothFullDone && useSecondModel && slotA.runId && slotB.runId ? (
        <section className="rounded-lg border p-4">
          <h2 className="font-medium">Model agreement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Inter-model reliability across the full corpus. Pick one run as canonical — Step 5 deviation, Step 6
            regression, and the export bundle will use that model&apos;s scores. Switching canonical is reversible and
            re-logs a reflexivity entry each time.
          </p>
          <div className="mt-4">
            <ModelAgreementPanel
              a={{ runId: slotA.runId, model: slotA.model, label: slotA.model, scores: slotA.full }}
              b={{ runId: slotB.runId, model: slotB.model, label: slotB.model, scores: slotB.full }}
              canonicalRunId={canonicalRunId}
              onSelectCanonical={selectCanonical}
            />
          </div>
        </section>
      ) : null}

      {bothFullDone && dictResult ? (
        <section className="rounded-lg border p-4">
          <h2 className="font-medium">Triangulation — dictionary vs. LLM</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pearson/Spearman correlations, scatter plot, and the top disagreement documents between the canonical LLM
            measure and the dictionary measure.
          </p>
          <DeviationView projectId={projectId} />
        </section>
      ) : null}

      {bothFullDone ? <StepCompleteBanner projectId={projectId} currentKey="llm" /> : null}

      {globalErr ? <p className="text-sm text-destructive">{globalErr}</p> : null}
    </div>
  );
}

function ModelSlot({
  label,
  slot,
  onChange,
  onLoadModels,
  reviewerCovers,
}: {
  label: string;
  slot: ModelRunState;
  onChange: (s: ModelRunState) => void;
  onLoadModels: () => void;
  reviewerCovers: boolean;
}) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className={`mt-2 grid gap-2 ${reviewerCovers ? "grid-cols-1" : "grid-cols-2"}`}>
        <label className="text-sm">
          Provider
          <select
            value={slot.provider}
            onChange={(e) => onChange({ ...slot, provider: e.target.value as ProviderId })}
            className="mt-1 w-full rounded border px-2 py-1"
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google Gemini</option>
          </select>
        </label>
        {reviewerCovers ? null : (
          <label className="text-sm">
            API key
            <input
              type="password"
              value={slot.apiKey}
              onChange={(e) => onChange({ ...slot, apiKey: e.target.value })}
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>
        )}
      </div>
      {reviewerCovers ? (
        <p className="mt-2 text-xs text-green-700 dark:text-green-400">
          ✓ Reviewer session — using the server-side {slot.provider} key (subject to the session spend cap).
        </p>
      ) : null}
      <button onClick={onLoadModels} className="mt-2 rounded border px-3 py-1 text-xs">
        Load models
      </button>
      {slot.models.length > 0 ? (
        <label className="mt-2 block text-sm">
          Model
          <select
            value={slot.model}
            onChange={(e) => onChange({ ...slot, model: e.target.value })}
            className="mt-1 w-full rounded border px-2 py-1"
          >
            {slot.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function CustomDictUpload({
  current,
  onUpload,
}: {
  current: { name: string; dict: Record<string, string[]> } | null;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="text-sm">
      <label>
        Upload dictionary file
        <input
          ref={inputRef}
          type="file"
          accept=".dic,.csv,.json,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
          className="mt-1 block w-full text-xs"
        />
      </label>
      {current ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Loaded <b>{current.name}</b> — {Object.keys(current.dict).length} categories,{" "}
          {Object.values(current.dict).reduce((a, b) => a + b.length, 0)} words. File is parsed locally and never stored.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Accepts LIWC <code>.dic</code>, CSV (<code>category,word</code>), or JSON <code>{`{category:[words]}`}</code>.</p>
      )}
    </div>
  );
}

function SubsampleTable({ slotA, slotB }: { slotA: ModelRunState; slotB: ModelRunState | null }) {
  const ids = new Set<string>([...slotA.sample.map((r) => r.id), ...(slotB?.sample ?? []).map((r) => r.id)]);
  const byIdA = new Map(slotA.sample.map((r) => [r.id, r]));
  const byIdB = slotB ? new Map(slotB.sample.map((r) => [r.id, r])) : null;
  return (
    <ul className="divide-y rounded border">
      {Array.from(ids).map((id) => {
        const a = byIdA.get(id);
        const b = byIdB?.get(id);
        return (
          <li key={id} className="p-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs text-muted-foreground">{id}</span>
              <span className="tabular-nums">
                A: {a?.score ?? "—"}{b ? ` · B: ${b.score ?? "—"}` : null}
              </span>
            </div>
            <div className={`mt-1 grid gap-2 ${b ? "md:grid-cols-2" : ""}`}>
              {a ? (
                <div className="rounded border bg-muted/30 p-2 text-xs">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{slotA.model}</div>
                  <p>{a.rationale || a.error || "(no rationale)"}</p>
                </div>
              ) : null}
              {b ? (
                <div className="rounded border bg-muted/30 p-2 text-xs">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{slotB?.model}</div>
                  <p>{b.rationale || b.error || "(no rationale)"}</p>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function fmtStat(v: number | null): string {
  return v === null || !isFinite(v) ? "—" : v.toFixed(3);
}
