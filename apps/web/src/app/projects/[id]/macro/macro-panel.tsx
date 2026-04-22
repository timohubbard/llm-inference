"use client";

import { useEffect, useMemo, useState } from "react";

interface Construct {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
}

type Doc = { id: string; text: string };

interface Signal {
  signal: string;
  signalType: "lexical" | "phrasal" | "syntactic" | "semantic" | "structural";
  rationale: string;
  suggestedOperationalization: string;
}

interface PromotedFeature {
  name: string;
  kind: "keyword" | "presence";
  pattern: string;
  signal: string;
  perDoc: Array<{ id: string; value: number }>;
}

export function MacroPanel({ projectId, construct }: { projectId: string; construct: Construct }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [provider, setProvider] = useState<"anthropic" | "openai" | "google">("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [outcomeVariable, setOutcomeVariable] = useState("");
  const [sampleSize, setSampleSize] = useState(5);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(`corpus:${projectId}`);
    if (raw) setDocs(JSON.parse(raw) as Doc[]);
    const feats = sessionStorage.getItem(`features:${projectId}`);
    if (feats) setPromoted(JSON.parse(feats) as PromotedFeature[]);
  }, [projectId]);

  const [promoted, setPromoted] = useState<PromotedFeature[]>([]);

  const sample = useMemo(() => {
    if (!docs) return [];
    const shuffled = [...docs].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(sampleSize, docs.length));
  }, [docs, sampleSize]);

  async function runMacro() {
    if (!docs) return;
    setBusy(true);
    setErr(null);
    setSignals([]);
    setNotes(null);
    try {
      const res = await fetch("/api/llm/macro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          constructId: construct.id,
          provider,
          apiKey,
          model,
          outcomeVariable: outcomeVariable || undefined,
          sampleDocuments: sample,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "macro-inference failed");
      setSignals(body.signals as Signal[]);
      setNotes(body.notes ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function promoteKeyword(signal: Signal) {
    if (!docs) return;
    const pattern = window.prompt(
      `Keyword pattern for "${signal.signal}" (comma-separated words; regex via /.../ syntax)`,
      extractKeywords(signal.suggestedOperationalization),
    );
    if (!pattern) return;
    const name = window.prompt("Feature name (used as column in regression)", slugify(signal.signal));
    if (!name) return;
    const compiled = compilePattern(pattern);
    const perDoc = docs.map((d) => ({ id: d.id, value: countMatches(d.text, compiled) }));
    const feature: PromotedFeature = { name, kind: "keyword", pattern, signal: signal.signal, perDoc };
    const next = [...promoted.filter((p) => p.name !== name), feature];
    setPromoted(next);
    sessionStorage.setItem(`features:${projectId}`, JSON.stringify(next));
  }

  function promotePresence(signal: Signal) {
    if (!docs) return;
    const pattern = window.prompt(
      `Presence-flag pattern for "${signal.signal}"`,
      extractKeywords(signal.suggestedOperationalization),
    );
    if (!pattern) return;
    const name = window.prompt("Feature name", slugify(signal.signal) + "_present");
    if (!name) return;
    const compiled = compilePattern(pattern);
    const perDoc = docs.map((d) => ({ id: d.id, value: countMatches(d.text, compiled) > 0 ? 1 : 0 }));
    const feature: PromotedFeature = { name, kind: "presence", pattern, signal: signal.signal, perDoc };
    const next = [...promoted.filter((p) => p.name !== name), feature];
    setPromoted(next);
    sessionStorage.setItem(`features:${projectId}`, JSON.stringify(next));
  }

  function removeFeature(name: string) {
    const next = promoted.filter((p) => p.name !== name);
    setPromoted(next);
    sessionStorage.setItem(`features:${projectId}`, JSON.stringify(next));
  }

  return (
    <div className="mt-6 space-y-6">
      {!docs ? (
        <p className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm">
          Load a corpus first on the Corpus tab.
        </p>
      ) : null}

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">Inductive signal discovery</h2>
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
            Model
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>
          <label className="text-sm">
            API key (blank = reviewer session)
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>
          <label className="text-sm">
            Outcome variable (optional)
            <input
              value={outcomeVariable}
              onChange={(e) => setOutcomeVariable(e.target.value)}
              placeholder="e.g., future firm performance"
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>
          <label className="text-sm">
            Stratified sample size
            <input
              type="number"
              min={1}
              max={docs?.length ?? 1}
              value={sampleSize}
              onChange={(e) => setSampleSize(Number(e.target.value))}
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>
        </div>
        <button
          onClick={runMacro}
          disabled={!docs || busy}
          className="mt-3 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Surfacing…" : "Surface candidate signals"}
        </button>
      </section>

      {signals.length > 0 ? (
        <section className="rounded-lg border p-4">
          <h2 className="font-medium">Candidate signals</h2>
          {notes ? <p className="mt-2 text-sm text-muted-foreground">{notes}</p> : null}
          <ul className="mt-3 divide-y rounded border">
            {signals.map((s, i) => (
              <li key={i} className="p-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{s.signal}</span>
                  <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">{s.signalType}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{s.rationale}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <em>Operationalize:</em> {s.suggestedOperationalization}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => promoteKeyword(s)}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    Promote → keyword count
                  </button>
                  <button
                    onClick={() => promotePresence(s)}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    Promote → presence flag
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {promoted.length > 0 ? (
        <section className="rounded-lg border p-4">
          <h2 className="font-medium">Promoted features ({promoted.length})</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Stored in this browser session only. Available as covariates in Step 6 combined regression.
          </p>
          <ul className="mt-3 divide-y rounded border">
            {promoted.map((f) => (
              <li key={f.name} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-mono text-xs">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.kind} · pattern: <code>{f.pattern}</code> · from signal: {f.signal}
                  </div>
                </div>
                <button onClick={() => removeFeature(f.name)} className="rounded border px-2 py-1 text-xs">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {err ? <p className="text-sm text-destructive">{err}</p> : null}
    </div>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "").slice(0, 40) || "feature";
}

function extractKeywords(op: string): string {
  const m = op.match(/["']([^"']+)["']/g);
  if (m) return m.map((s) => s.slice(1, -1)).join(", ");
  return op.split(/[,;]/).slice(0, 3).map((s) => s.trim()).filter(Boolean).join(", ");
}

function compilePattern(raw: string): RegExp {
  const trimmed = raw.trim();
  if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
    const last = trimmed.lastIndexOf("/");
    const body = trimmed.slice(1, last);
    const flags = trimmed.slice(last + 1);
    return new RegExp(body, flags.includes("g") ? flags : flags + "g");
  }
  const words = trimmed.split(/[,]/).map((s) => s.trim()).filter(Boolean);
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi");
}

function countMatches(text: string, pattern: RegExp): number {
  const m = text.match(pattern);
  return m ? m.length : 0;
}
