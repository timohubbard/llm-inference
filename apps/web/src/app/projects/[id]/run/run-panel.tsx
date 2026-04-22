"use client";

import { useEffect, useMemo, useState } from "react";

interface Construct {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
}
interface Corpus { id: string; docCount: number }

type Doc = { id: string; text: string };
type ScoreRow = { id: string; score: number | null; rationale: string; error?: string };

export function RunPanel({ projectId, construct, corpus }: { projectId: string; construct: Construct; corpus: Corpus }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [provider, setProvider] = useState<"anthropic" | "openai" | "google">("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<Array<{ id: string; displayName: string }>>([]);
  const [model, setModel] = useState<string>("claude-sonnet-4-6");
  const [sampleSize, setSampleSize] = useState(5);
  const [sampleScores, setSampleScores] = useState<ScoreRow[]>([]);
  const [fullScores, setFullScores] = useState<ScoreRow[]>([]);
  const [dictScores, setDictScores] = useState<Array<{ id: string; score: number }>>([]);
  const [phase, setPhase] = useState<"idle" | "dict" | "sample" | "full" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [estCost, setEstCost] = useState<number | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(`corpus:${projectId}`);
    if (raw) setDocs(JSON.parse(raw) as Doc[]);
  }, [projectId]);

  async function listModels() {
    setErr(null);
    try {
      const res = await fetch("/api/providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Key validation failed");
      setModels(body.models);
      if (body.models[0]) setModel(body.models[0].id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function runDictionary() {
    if (!docs) return;
    setPhase("dict");
    setErr(null);
    try {
      const res = await fetch(`/api/traditional/dictionary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "lmd", corpusId: corpus.id, documents: docs }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Dictionary scoring failed");
      setDictScores(body.scores);
      sessionStorage.setItem(`scores:dict:${projectId}`, JSON.stringify(body.scores));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
    }
  }

  const sample = useMemo(() => {
    if (!docs) return [];
    const shuffled = [...docs].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(sampleSize, docs.length));
  }, [docs, sampleSize]);

  async function runSample() {
    if (!docs) return;
    setPhase("sample");
    setSampleScores([]);
    setErr(null);
    try {
      const rows = await streamScores(sample);
      setSampleScores(rows);
      const est = await fetch("/api/llm/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          docsSample: sample,
          totalDocs: docs.length,
        }),
      }).then((r) => r.json());
      setEstCost(est.estimatedUsd ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
    }
  }

  async function runFull() {
    if (!docs) return;
    setPhase("full");
    setFullScores([]);
    setErr(null);
    try {
      const rows = await streamScores(docs);
      setFullScores(rows);
      sessionStorage.setItem(`scores:llm:${projectId}`, JSON.stringify(rows));
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  async function streamScores(input: Doc[]): Promise<ScoreRow[]> {
    const res = await fetch(`/api/llm/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        constructId: construct.id,
        corpusId: corpus.id,
        provider,
        apiKey,
        model,
        documents: input,
      }),
    });
    if (!res.ok || !res.body) throw new Error(await res.text());
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const rows: ScoreRow[] = [];
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const row = JSON.parse(line) as ScoreRow;
        rows.push(row);
        setSampleScoresOrFull(rows);
      }
    }
    return rows;
  }

  function setSampleScoresOrFull(rows: ScoreRow[]) {
    if (phase === "sample") setSampleScores([...rows]);
    else if (phase === "full") setFullScores([...rows]);
  }

  return (
    <div className="mt-6 space-y-8">
      {!docs ? (
        <p className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm">
          No documents loaded into this browser session. Revisit the Corpus tab and load the demo or upload a file.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {docs.length} documents loaded in this session. Construct: <b>{construct.name}</b> (scale {construct.scaleMin}–{construct.scaleMax}).
        </p>
      )}

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Step 3 — Traditional analysis (Loughran–McDonald)</h2>
        <button
          onClick={runDictionary}
          disabled={!docs || phase !== "idle"}
          className="mt-3 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {phase === "dict" ? "Scoring…" : "Run dictionary scoring"}
        </button>
        {dictScores.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Scored {dictScores.length} documents. Mean net sentiment:{" "}
            {(dictScores.reduce((a, b) => a + b.score, 0) / dictScores.length).toFixed(3)}.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Step 4 — LLM micro-inference</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm">
            Provider
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
              className="mt-1 w-full rounded border px-2 py-1"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google Gemini</option>
            </select>
          </label>
          <label className="text-sm">
            API key (leave blank to use reviewer session)
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>
        </div>
        <button onClick={listModels} className="mt-3 rounded border px-3 py-1.5 text-sm">
          Load models
        </button>
        {models.length > 0 ? (
          <label className="mt-3 block text-sm">
            Model
            <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded border px-2 py-1">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
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
            onClick={runSample}
            disabled={!docs || phase !== "idle"}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
          >
            {phase === "sample" ? "Scoring…" : "Run subsample"}
          </button>
        </div>

        {sampleScores.length > 0 ? (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium">Subsample review</h3>
            <ul className="divide-y rounded border">
              {sampleScores.map((r) => (
                <li key={r.id} className="p-3 text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                    <span className="font-medium">score: {r.score ?? "—"}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{r.rationale || r.error}</p>
                </li>
              ))}
            </ul>

            {estCost !== null ? (
              <div className="rounded border p-3 text-sm">
                Estimated full-corpus cost: <b>${estCost.toFixed(2)}</b> for {docs?.length ?? 0} documents.
              </div>
            ) : null}

            <button
              onClick={runFull}
              disabled={phase !== "idle"}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
            >
              {phase === "full" ? `Scoring ${fullScores.length}/${docs?.length ?? 0}…` : "Confirm & run full corpus"}
            </button>
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="mt-6 rounded bg-muted p-3 text-sm">
            Done — {fullScores.length} documents scored. Head to the Deviation tab to triangulate against the
            dictionary measure.
          </div>
        ) : null}
      </section>

      {err ? <p className="text-sm text-destructive">{err}</p> : null}
    </div>
  );
}
