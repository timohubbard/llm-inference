"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { listLlmRuns, resolveCanonicalScores, type LlmScoreRow } from "@/lib/llm-runs";
import { pearson, spearman, topDisagreements } from "@/lib/stats";

interface JoinedScore {
  id: string;
  dict: number;
  llm: number | null;
  rationale?: string;
  text?: string;
}

export function DeviationView({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<JoinedScore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const dictRaw = sessionStorage.getItem(`scores:dict:${projectId}`);
      const { scores: llmScores } = resolveCanonicalScores(projectId);
      const runs = listLlmRuns(projectId);
      const canonical = window.sessionStorage.getItem(`canonical:llm:${projectId}`);
      if (runs.length > 1 && !canonical) {
        setNotice("Multiple LLM runs detected — pick one as canonical in Step 4 to continue.");
      }
      const corpusRaw = sessionStorage.getItem(`corpus:${projectId}`);
      if (!dictRaw || !llmScores) {
        setError("Run the dictionary pass and the LLM pass first.");
        return;
      }
      const dict = new Map((JSON.parse(dictRaw) as Array<{ id: string; score: number }>).map((r) => [r.id, r.score]));
      const llm = new Map<string, LlmScoreRow>((llmScores as LlmScoreRow[]).map((r) => [r.id, r]));
      const texts = new Map(
        corpusRaw
          ? (JSON.parse(corpusRaw) as Array<{ id: string; text: string }>).map((d) => [d.id, d.text])
          : [],
      );
      const joined: JoinedScore[] = [];
      for (const [id, d] of dict) {
        const l = llm.get(id);
        if (!l || l.score === null) continue;
        joined.push({ id, dict: d, llm: l.score, rationale: l.rationale, text: texts.get(id) });
      }
      setRows(joined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId]);

  const stats = useMemo(() => {
    if (!rows || rows.length < 2) return null;
    const xs = rows.map((r) => r.dict);
    const ys = rows.map((r) => r.llm as number);
    return {
      pearson: pearson(xs, ys),
      spearman: spearman(xs, ys),
      n: rows.length,
      top: topDisagreements(rows, (r) => r.dict, (r) => r.llm as number, 5),
    };
  }, [rows]);

  if (error) return <p className="mt-4 text-sm text-destructive">{error}</p>;
  if (notice && !rows) return <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">{notice}</p>;
  if (!rows) return <p className="mt-4 text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) return <p className="mt-4 text-sm text-muted-foreground">No overlapping scores yet.</p>;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="n" value={stats?.n.toString() ?? "—"} />
        <Stat label="Pearson r" value={stats?.pearson?.toFixed(3) ?? "—"} />
        <Stat label="Spearman ρ" value={stats?.spearman?.toFixed(3) ?? "—"} />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-medium">Dictionary (x) vs. LLM (y)</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="dict" name="Dictionary" />
              <YAxis type="number" dataKey="llm" name="LLM" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter name="Documents" data={rows} fill="#3b82f6" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Top-5 disagreement documents</h2>
        <ul className="mt-3 divide-y">
          {stats?.top.map(({ item, delta }) => (
            <li key={item.id} className="py-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                <span>dict: {item.dict.toFixed(2)} · llm: {item.llm} · Δ: {delta.toFixed(2)}</span>
              </div>
              {item.rationale ? (
                <p className="mt-1 text-muted-foreground">{item.rationale}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
