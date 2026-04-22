"use client";

import { useEffect, useMemo, useState } from "react";

type Coef = { estimate: number; se: number; tValue: number; pValue: number };
type RegressionResult = {
  coefficients: Record<string, Coef>;
  fit: { rSquared?: number; adjRSquared?: number; llf?: number; aic?: number; bic?: number; n: number };
};

type ScoreRow = { id: string; score: number | null };
type DictRow = { id: string; score: number };
type Feature = { name: string; kind: "keyword" | "presence"; pattern: string; signal: string; perDoc: Array<{ id: string; value: number }> };

export function IntegrationView({ projectId }: { projectId: string }) {
  const [dict, setDict] = useState<DictRow[] | null>(null);
  const [llm, setLlm] = useState<ScoreRow[] | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [outcomeName, setOutcomeName] = useState("outcome");
  const [outcomeRows, setOutcomeRows] = useState<Record<string, number>>({});
  const [outcomeCsv, setOutcomeCsv] = useState("");
  const [primaryResult, setPrimaryResult] = useState<RegressionResult | null>(null);
  const [llmResult, setLlmResult] = useState<RegressionResult | null>(null);
  const [combinedResult, setCombinedResult] = useState<RegressionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [family, setFamily] = useState<"ols" | "logit">("ols");
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());

  useEffect(() => {
    const d = sessionStorage.getItem(`scores:dict:${projectId}`);
    const l = sessionStorage.getItem(`scores:llm:${projectId}`);
    const f = sessionStorage.getItem(`features:${projectId}`);
    if (d) setDict(JSON.parse(d) as DictRow[]);
    if (l) setLlm(JSON.parse(l) as ScoreRow[]);
    if (f) {
      const parsed = JSON.parse(f) as Feature[];
      setFeatures(parsed);
      setSelectedFeatures(new Set(parsed.map((x) => x.name)));
    }
    const savedOutcome = sessionStorage.getItem(`outcome:${projectId}`);
    if (savedOutcome) {
      const obj = JSON.parse(savedOutcome) as { name: string; rows: Record<string, number> };
      setOutcomeName(obj.name);
      setOutcomeRows(obj.rows);
    }
  }, [projectId]);

  function parseOutcomeCsv() {
    try {
      const lines = outcomeCsv.trim().split(/\r?\n/);
      const header = lines.shift()?.split(",").map((s) => s.trim()) ?? [];
      const idIdx = header.findIndex((h) => h.toLowerCase() === "id");
      const valIdx = header.findIndex((h) => h.toLowerCase() !== "id");
      if (idIdx < 0 || valIdx < 0) throw new Error("paste CSV with columns: id,<outcome>");
      const name = header[valIdx] || "outcome";
      const rows: Record<string, number> = {};
      for (const line of lines) {
        if (!line.trim()) continue;
        const cells = line.split(",");
        const id = (cells[idIdx] ?? "").trim();
        const v = Number(cells[valIdx]);
        if (id && Number.isFinite(v)) rows[id] = v;
      }
      setOutcomeName(name);
      setOutcomeRows(rows);
      sessionStorage.setItem(`outcome:${projectId}`, JSON.stringify({ name, rows }));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const joined = useMemo(() => {
    if (!dict || !llm) return [];
    const dMap = new Map(dict.map((r) => [r.id, r.score]));
    const lMap = new Map(llm.map((r) => [r.id, r.score]));
    const rows: Array<Record<string, number | string | null>> = [];
    const ids = new Set([...dMap.keys(), ...lMap.keys()]);
    for (const id of ids) {
      const y = outcomeRows[id];
      if (y === undefined) continue;
      const d = dMap.get(id);
      const l = lMap.get(id);
      if (d === undefined || l === null || l === undefined) continue;
      const row: Record<string, number | string | null> = {
        id,
        [outcomeName]: y,
        dict_score: d,
        llm_score: l,
      };
      for (const f of features) {
        if (!selectedFeatures.has(f.name)) continue;
        const cell = f.perDoc.find((p) => p.id === id);
        row[f.name] = cell?.value ?? 0;
      }
      rows.push(row);
    }
    return rows;
  }, [dict, llm, features, selectedFeatures, outcomeName, outcomeRows]);

  async function fitAll() {
    if (joined.length < 3) {
      setErr("Need at least 3 joined rows (docs with dict score, llm score, and outcome).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const extra = [...selectedFeatures].length ? " + " + [...selectedFeatures].join(" + ") : "";
      const primary = await fitOne(`${outcomeName} ~ dict_score${extra}`);
      const llmSpec = await fitOne(`${outcomeName} ~ llm_score${extra}`);
      const combined = await fitOne(`${outcomeName} ~ dict_score + llm_score${extra}`);
      setPrimaryResult(primary);
      setLlmResult(llmSpec);
      setCombinedResult(combined);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function fitOne(formula: string): Promise<RegressionResult> {
    const res = await fetch("/api/regression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formula, data: joined, family }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "regression failed");
    return body as RegressionResult;
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Outcome variable</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Paste CSV with columns <code>id,&lt;outcome&gt;</code> where <code>id</code> matches your corpus document IDs.
          Values stay in this browser session.
        </p>
        <textarea
          value={outcomeCsv}
          onChange={(e) => setOutcomeCsv(e.target.value)}
          rows={4}
          placeholder="id,future_roa&#10;brk-1999,0.14&#10;brk-2008,-0.03"
          className="mt-2 w-full rounded border p-2 font-mono text-xs"
        />
        <div className="mt-2 flex items-center gap-3">
          <button onClick={parseOutcomeCsv} className="rounded border px-3 py-1.5 text-sm">
            Load outcome
          </button>
          <span className="text-xs text-muted-foreground">
            {Object.keys(outcomeRows).length > 0
              ? `Loaded ${Object.keys(outcomeRows).length} outcome rows (${outcomeName}).`
              : "No outcome loaded."}
          </span>
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Specification</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="text-sm">
            Family
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value as "ols" | "logit")}
              className="ml-2 rounded border px-2 py-1"
            >
              <option value="ols">OLS</option>
              <option value="logit">Logit</option>
            </select>
          </label>
          <div className="text-xs text-muted-foreground">
            {joined.length} rows joinable across dict + llm + outcome.
          </div>
        </div>

        {features.length > 0 ? (
          <div className="mt-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Promoted macro features</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {features.map((f) => (
                <label key={f.name} className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.has(f.name)}
                    onChange={(e) => {
                      const next = new Set(selectedFeatures);
                      if (e.target.checked) next.add(f.name);
                      else next.delete(f.name);
                      setSelectedFeatures(next);
                    }}
                  />
                  <span className="font-mono">{f.name}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <button
          onClick={fitAll}
          disabled={busy || joined.length < 3}
          className="mt-4 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Fitting…" : "Fit primary / LLM / combined"}
        </button>
      </section>

      {primaryResult || llmResult || combinedResult ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ResultCard title="Primary (dictionary)" result={primaryResult} />
          <ResultCard title="LLM-only" result={llmResult} />
          <ResultCard title="Combined" result={combinedResult} />
        </section>
      ) : null}

      {err ? <p className="text-sm text-destructive">{err}</p> : null}
    </div>
  );
}

function ResultCard({ title, result }: { title: string; result: RegressionResult | null }) {
  if (!result) return <div className="rounded-lg border p-4 text-sm text-muted-foreground">{title}: —</div>;
  return (
    <div className="rounded-lg border p-4 text-sm">
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        n = {result.fit.n}
        {result.fit.rSquared !== undefined ? ` · R² = ${result.fit.rSquared.toFixed(3)}` : ""}
        {result.fit.adjRSquared !== undefined ? ` · adj-R² = ${result.fit.adjRSquared.toFixed(3)}` : ""}
        {result.fit.aic !== undefined ? ` · AIC = ${result.fit.aic.toFixed(1)}` : ""}
      </div>
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1">term</th>
            <th className="py-1 text-right">β</th>
            <th className="py-1 text-right">SE</th>
            <th className="py-1 text-right">p</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(result.coefficients).map(([term, c]) => (
            <tr key={term} className="border-t">
              <td className="py-1 font-mono">{term}</td>
              <td className="py-1 text-right">{c.estimate.toFixed(3)}</td>
              <td className="py-1 text-right">{c.se.toFixed(3)}</td>
              <td className="py-1 text-right">{formatP(c.pValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatP(p: number): string {
  if (p < 0.001) return "<0.001";
  return p.toFixed(3);
}
