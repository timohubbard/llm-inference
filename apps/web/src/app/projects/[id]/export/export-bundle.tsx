"use client";

import { useState } from "react";
import {
  getCanonicalRunId,
  listLlmRuns,
  loadLlmScores,
  type LlmScoreRow,
} from "@/lib/llm-runs";
import { markSessionStepDone } from "@/lib/steps";

export function ExportBundle({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function downloadCsv() {
    setBusy(true);
    setErr(null);
    try {
      const dictRaw = sessionStorage.getItem(`scores:dict:${projectId}`);
      const dictMetaRaw = sessionStorage.getItem(`scores:dict:meta:${projectId}`);
      const runs = listLlmRuns(projectId);
      const canonical = getCanonicalRunId(projectId);

      const dict = new Map(
        dictRaw ? (JSON.parse(dictRaw) as Array<{ id: string; score: number }>).map((r) => [r.id, r.score]) : [],
      );

      const perRun = new Map<string, Map<string, LlmScoreRow>>();
      const runsToExport = runs.length > 0 ? runs : [];
      for (const r of runsToExport) {
        const scores = loadLlmScores(projectId, r.runId);
        if (scores) perRun.set(r.runId, new Map(scores.map((s) => [s.id, s])));
      }
      // Back-compat: a single legacy run with no DB runId
      if (runsToExport.length === 0) {
        const legacy = loadLlmScores(projectId);
        if (legacy) perRun.set("legacy", new Map(legacy.map((s) => [s.id, s])));
      }

      const runIds = Array.from(perRun.keys());
      const ids = new Set<string>(dict.keys());
      for (const m of perRun.values()) for (const id of m.keys()) ids.add(id);

      // scores.csv — wide: id, dict_score, <model>_score, <model>_rationale for each run
      const runLabelFor = (runId: string) => {
        const meta = runsToExport.find((r) => r.runId === runId);
        return meta ? slug(meta.model) : runId;
      };
      const header = ["id", "dict_score"];
      for (const runId of runIds) {
        const label = runLabelFor(runId);
        header.push(`${label}_score`, `${label}_rationale`);
      }
      if (canonical && runIds.includes(canonical)) header.push("canonical_score");

      const rows: string[] = [header.join(",")];
      for (const id of ids) {
        const cells: string[] = [id, String(dict.get(id) ?? "")];
        for (const runId of runIds) {
          const r = perRun.get(runId)?.get(id);
          cells.push(String(r?.score ?? ""));
          cells.push(JSON.stringify((r?.rationale ?? "").replaceAll("\n", " ")));
        }
        if (canonical && runIds.includes(canonical)) {
          const cr = perRun.get(canonical)?.get(id);
          cells.push(String(cr?.score ?? ""));
        }
        rows.push(cells.map((c, i) => (i === 0 || i === 1 || c.startsWith('"') ? c : JSON.stringify(c))).join(","));
      }
      downloadBlob(`${slug(projectName)}-scores.csv`, rows.join("\n"), "text/csv");

      // Per-run prompts.jsonl
      for (const runId of runIds) {
        const label = runLabelFor(runId);
        const m = perRun.get(runId)!;
        const lines = Array.from(m.values()).map((r) =>
          JSON.stringify({ id: r.id, score: r.score, rationale: r.rationale, error: r.error ?? null }),
        );
        downloadBlob(`${slug(projectName)}-prompts_${label}.jsonl`, lines.join("\n"), "application/x-ndjson");
      }

      // manifest.json
      const manifest = {
        projectId,
        projectName,
        generatedAt: new Date().toISOString(),
        documentCount: ids.size,
        dictionary: dictMetaRaw ? JSON.parse(dictMetaRaw) : null,
        llmRuns: runsToExport.map((r) => ({ runId: r.runId, model: r.model, provider: r.provider, createdAt: r.createdAt })),
        canonicalModelRunId: canonical,
      };
      downloadBlob(`${slug(projectName)}-manifest.json`, JSON.stringify(manifest, null, 2), "application/json");

      // Reflexivity + methods appendix
      let reflexivity = "";
      try {
        const res = await fetch(`/api/projects/${projectId}/reflexivity`);
        if (res.ok) {
          const body = (await res.json()) as { notes: Array<{ body: string; createdAt: string; linkedRunId: string | null }> };
          reflexivity = body.notes
            .map((n) => `- **${new Date(n.createdAt).toISOString()}**${n.linkedRunId ? ` (run ${n.linkedRunId})` : ""}\n  ${n.body.replace(/\n/g, "\n  ")}`)
            .join("\n");
        }
      } catch {
        // reflexivity is optional for export
      }

      const featuresRaw = sessionStorage.getItem(`features:${projectId}`);
      const features: Array<{ name: string; kind: string; pattern: string; signal: string }> = featuresRaw
        ? JSON.parse(featuresRaw)
        : [];

      const appendix = renderMethodsAppendix({
        projectId,
        projectName,
        n: ids.size,
        reflexivity,
        features,
        runs: runsToExport,
        canonical,
        dictMetaRaw,
      });
      downloadBlob(`${slug(projectName)}-methods-appendix.md`, appendix, "text/markdown");
      setDownloaded(true);
      markSessionStepDone("export", projectId, true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        onClick={downloadCsv}
        disabled={busy}
        className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Preparing…" : "Download scores + methods appendix"}
      </button>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      {downloaded ? (
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414L8.5 12.086l6.793-6.793a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Bundle downloaded. Analysis complete.
        </p>
      ) : null}
    </div>
  );
}

function renderMethodsAppendix({
  projectId,
  projectName,
  n,
  reflexivity,
  features,
  runs,
  canonical,
  dictMetaRaw,
}: {
  projectId: string;
  projectName: string;
  n: number;
  reflexivity: string;
  features: Array<{ name: string; kind: string; pattern: string; signal: string }>;
  runs: Array<{ runId: string; model: string; provider: string }>;
  canonical: string | null;
  dictMetaRaw: string | null;
}): string {
  const featureSection = features.length
    ? ["## Promoted macro features", "", ...features.map((f) => `- \`${f.name}\` (${f.kind}) — pattern \`${f.pattern}\`; signal: ${f.signal}`), ""].join("\n")
    : "";
  const reflexivitySection = reflexivity
    ? ["## Reflexivity log", "", reflexivity, ""].join("\n")
    : "";
  const runsSection = runs.length
    ? [
        "## LLM runs",
        "",
        ...runs.map(
          (r) =>
            `- \`${r.provider}/${r.model}\` (run \`${r.runId}\`)${canonical === r.runId ? " — **canonical** (used for Step 5 deviation and Step 6 regression)" : ""}`,
        ),
        "",
      ].join("\n")
    : "";
  const dictSection = dictMetaRaw
    ? [
        "## Dictionary",
        "",
        `- \`${(JSON.parse(dictMetaRaw) as { id: string; name?: string }).name ?? (JSON.parse(dictMetaRaw) as { id: string }).id}\``,
        "",
      ].join("\n")
    : "";
  return [
    `# Methods appendix — ${projectName}`,
    "",
    `_Generated by the LLM Inference Tool on ${new Date().toISOString()}._`,
    "",
    `**Project ID:** ${projectId}`,
    `**Documents scored:** ${n}`,
    "",
    "## Procedure",
    "",
    "1. Constructs and scale anchors were pre-registered before any LLM scoring.",
    "2. A traditional dictionary measure was computed first; the dictionary and version are embedded in the run's reproducibility manifest.",
    "3. LLM construct scoring was performed using the provider and model(s) recorded in the manifest with a two-stage protocol: a small randomly-sampled subsample was reviewed by the researcher before the full-corpus pass was initiated. When multiple models were scored, one was explicitly selected as canonical; the selection is logged in the reflexivity log along with the inter-model agreement statistics.",
    "4. Deviation analysis (Pearson / Spearman correlation, top-disagreement inspection) triangulated the canonical LLM measure against the dictionary measure.",
    "5. (Optional) Macro-inference was used to inductively surface candidate signals, which were operationalized as keyword or presence features and added to the combined regression spec.",
    "6. (Optional) Primary / LLM-only / combined regression specifications were fit in-tool via the pinned Python sidecar.",
    "",
    dictSection,
    runsSection,
    featureSection,
    reflexivitySection,
    "## Disclosures",
    "",
    "- **LLM-assisted measurement.** The construct score was produced by large language model(s) against the construct definition and scale anchors supplied above. LLM outputs are probabilistic; inter-run and inter-model agreement should be reported in any publication.",
    "- **Known limitations.** LLM scoring can be sensitive to prompt wording, negation, and directional framing. The combined-regression specification and the top-disagreement inspection in this tool are provided as partial mitigations.",
    "- **Reproducibility.** The manifest records the exact model version string returned by the provider, prompt version, temperature, and seed (where supported by the provider). Data uploaded to this tool is not persisted server-side.",
  ].join("\n");
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function downloadBlob(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
