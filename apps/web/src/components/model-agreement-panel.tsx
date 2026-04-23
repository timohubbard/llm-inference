"use client";

import { useMemo } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { LlmScoreRow } from "@/lib/llm-runs";
import { icc21, pearson, spearman, topDisagreements } from "@/lib/stats";

interface ModelRun {
  runId: string;
  model: string;
  label: string;
  scores: LlmScoreRow[];
}

export function ModelAgreementPanel({
  a,
  b,
  canonicalRunId,
  onSelectCanonical,
}: {
  a: ModelRun;
  b: ModelRun;
  canonicalRunId: string | null;
  onSelectCanonical: (runId: string, otherRunId: string, stats: AgreementStats) => void;
}) {
  const stats = useMemo<AgreementStats>(() => {
    const byIdA = new Map(a.scores.map((s) => [s.id, s]));
    const byIdB = new Map(b.scores.map((s) => [s.id, s]));
    const rows: Array<{ id: string; a: number; b: number; rA: string; rB: string }> = [];
    for (const [id, sa] of byIdA) {
      const sb = byIdB.get(id);
      if (!sb || sa.score === null || sb.score === null) continue;
      rows.push({ id, a: sa.score, b: sb.score, rA: sa.rationale ?? "", rB: sb.rationale ?? "" });
    }
    const xs = rows.map((r) => r.a);
    const ys = rows.map((r) => r.b);
    const r = pearson(xs, ys);
    const rho = spearman(xs, ys);
    const icc = icc21(xs, ys);
    const mad = rows.length > 0 ? rows.reduce((s, r2) => s + Math.abs(r2.a - r2.b), 0) / rows.length : null;
    const top = topDisagreements(rows, (r2) => r2.a, (r2) => r2.b, 5);
    return { rows, pearson: r, spearman: rho, icc, mad, top, n: rows.length };
  }, [a, b]);

  if (stats.n === 0) {
    return <p className="text-sm text-muted-foreground">No overlapping scored documents across the two runs yet.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="n" value={stats.n.toString()} />
        <Stat label="Pearson r" value={fmt(stats.pearson)} />
        <Stat label="ICC(2,1)" value={fmt(stats.icc)} />
        <Stat label="mean |Δ|" value={fmt(stats.mad)} />
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-medium">
            {a.label} (x) vs. {b.label} (y)
          </h3>
          <span className="text-xs text-muted-foreground">45° line = perfect agreement</span>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="a" name={a.label} />
              <YAxis type="number" dataKey="b" name={b.label} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <ReferenceLine segment={refSegment(stats.rows)} stroke="#94a3b8" strokeDasharray="4 4" />
              <Scatter data={stats.rows} fill="#3b82f6" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <CanonicalCard
          run={a}
          other={b}
          canonicalRunId={canonicalRunId}
          onSelect={() => onSelectCanonical(a.runId, b.runId, stats)}
        />
        <CanonicalCard
          run={b}
          other={a}
          canonicalRunId={canonicalRunId}
          onSelect={() => onSelectCanonical(b.runId, a.runId, stats)}
        />
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-medium">Top-5 disagreements</h3>
        <ul className="mt-3 divide-y">
          {stats.top.map(({ item, delta }) => (
            <li key={item.id} className="py-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                <span className="tabular-nums">
                  {a.label}: {item.a} · {b.label}: {item.b} · Δ {delta.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <Rationale label={a.label} text={item.rA} />
                <Rationale label={b.label} text={item.rB} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface AgreementStats {
  rows: Array<{ id: string; a: number; b: number; rA: string; rB: string }>;
  pearson: number | null;
  spearman: number | null;
  icc: number | null;
  mad: number | null;
  top: Array<{ item: { id: string; a: number; b: number; rA: string; rB: string }; delta: number }>;
  n: number;
}

function CanonicalCard({
  run,
  other,
  canonicalRunId,
  onSelect,
}: {
  run: ModelRun;
  other: ModelRun;
  canonicalRunId: string | null;
  onSelect: () => void;
}) {
  const selected = canonicalRunId === run.runId;
  return (
    <div className={`rounded-lg border p-4 text-sm ${selected ? "border-green-500 bg-green-50/50 dark:bg-green-900/20" : ""}`}>
      <div className="font-medium">{run.label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{run.scores.length} documents scored</div>
      <button
        onClick={onSelect}
        disabled={selected}
        className="mt-3 w-full rounded border px-3 py-1.5 text-sm disabled:cursor-default disabled:border-green-600 disabled:text-green-700 dark:disabled:text-green-400"
      >
        {selected ? "✓ Canonical for downstream steps" : `Use ${run.label} downstream`}
      </button>
      {!selected ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Selecting auto-logs a reflexivity entry documenting the comparison against {other.label}.
        </p>
      ) : null}
    </div>
  );
}

function Rationale({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-0.5 text-xs">{text || <span className="text-muted-foreground">(no rationale)</span>}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function fmt(v: number | null): string {
  return v === null || !isFinite(v) ? "—" : v.toFixed(3);
}

function refSegment(rows: Array<{ a: number; b: number }>): Array<{ x: number; y: number }> {
  if (rows.length === 0) return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const all = rows.flatMap((r) => [r.a, r.b]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return [
    { x: lo, y: lo },
    { x: hi, y: hi },
  ];
}
