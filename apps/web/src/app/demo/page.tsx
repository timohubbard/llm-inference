import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";

export const dynamic = "force-static";
export const revalidate = false;

interface Snapshot {
  capturedAt: string;
  capturedBy: string;
  note: string;
  construct: {
    name: string;
    version: number;
    definition: string;
    scaleMin: number;
    scaleMax: number;
    anchors: Record<string, string>;
    citations: string[];
  };
  corpus: { name: string; docCount: number; checksumSha256: string; source: string };
  dict: {
    method: string;
    name: string;
    primaryMeasureLabel: string;
    categories: string[];
    scores: Array<{
      id: string;
      score: number;
      tokenCount: number;
      categoryCounts: Record<string, number>;
    }>;
  };
  llm: {
    provider: string;
    model: string;
    modelVersion: string;
    promptVersion: string;
    temperature: number;
    totalTokensIn: number;
    totalTokensOut: number;
    scores: Array<{ id: string; score: number; rationale: string }>;
  };
  triangulation: {
    n: number;
    pearson: number;
    spearman: number;
    topDisagreements: Array<{
      id: string;
      dictScore: number;
      llmScore: number;
      delta: number;
      note: string;
    }>;
  };
  outcome: {
    name: string;
    note: string;
    values: Array<{ id: string; outcome: number }>;
  };
  regression: {
    family: string;
    models: Array<{
      name: string;
      n: number;
      rSquared: number;
      adjRSquared: number;
      coefs: Array<{ term: string; estimate: number; stdErr: number; pValue: number }>;
    }>;
    interpretation: string;
  };
  macro: {
    sampleSize: number;
    signals: Array<{
      signal: string;
      signalType: string;
      rationale: string;
      suggestedOperationalization: string;
    }>;
    promotedFeatures: Array<{
      name: string;
      kind: string;
      pattern: string;
      perDocSummary: string;
    }>;
  };
  reflexivity: Array<{ id: string; createdAt: string; body: string }>;
  manifest: {
    promptVersion: string;
    models: Record<string, string>;
    seeds: Record<string, string>;
    corpusChecksum: string;
    promptCheckpoints: string[];
  };
}

async function loadSnapshot(): Promise<Snapshot> {
  const file = path.join(process.cwd(), "public", "demo", "snapshot.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as Snapshot;
}

function fmt(n: number, digits = 3): string {
  if (!isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default async function DemoPage() {
  const snap = await loadSnapshot();
  const captured = new Date(snap.capturedAt);
  const dictById = new Map(snap.dict.scores.map((s) => [s.id, s.score]));
  const llmById = new Map(snap.llm.scores.map((s) => [s.id, s.score]));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="border-b pb-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to LLM Inference Tool
          </Link>
          <span className="rounded-full border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            Read-only demo · saved snapshot
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold">Completed Buffett demo — saved snapshot</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A fully populated walk-through of the eight-step framework on the bundled 20-letter
          Warren Buffett shareholder-letters corpus. This page reads pre-computed results and
          consumes zero tokens. The live tool reproduces this end-to-end — start a project from
          the home page or the reviewer flow.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Captured {captured.toUTCString()} · construct version {snap.construct.version} ·{" "}
          model {snap.llm.modelVersion}
        </p>
      </header>

      {/* Step 1 — Construct */}
      <section id="step-1" className="mt-10 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Step 1 — Construct</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Name</dt>
            <dd className="font-medium">{snap.construct.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Scale</dt>
            <dd>
              {snap.construct.scaleMin}–{snap.construct.scaleMax}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs uppercase text-muted-foreground">Definition</dt>
            <dd>{snap.construct.definition}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs uppercase text-muted-foreground">Anchors</dt>
            <dd>
              <ul className="mt-1 space-y-1 font-mono text-xs">
                {Object.entries(snap.construct.anchors)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([k, v]) => (
                    <li key={k}>
                      <span className="text-muted-foreground">{k}:</span> {v}
                    </li>
                  ))}
              </ul>
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs uppercase text-muted-foreground">Citations</dt>
            <dd className="text-xs">
              {snap.construct.citations.map((c, i) => (
                <p key={i}>{c}</p>
              ))}
            </dd>
          </div>
        </dl>
      </section>

      {/* Step 2 — Corpus */}
      <section id="step-2" className="mt-6 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Step 2 — Corpus</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {snap.corpus.docCount} shareholder letters from {snap.corpus.source}. The descriptor
          (name, doc count, content checksum) is the only thing persisted server-side; document
          text stays in the user&apos;s browser session.
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          checksum: {snap.corpus.checksumSha256}
        </p>
      </section>

      {/* Step 3 — Dictionary */}
      <section id="step-3" className="mt-6 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Step 3 — Traditional analysis (dictionary)</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {snap.dict.name}. Primary measure: <code>{snap.dict.primaryMeasureLabel}</code>.
        </p>
        <div className="mt-4 overflow-x-auto rounded border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">Doc id</th>
                <th className="p-2 text-right">Tokens</th>
                <th className="p-2 text-right">Score</th>
                {snap.dict.categories.map((c) => (
                  <th key={c} className="p-2 text-right capitalize">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {snap.dict.scores.map((s) => (
                <tr key={s.id}>
                  <td className="p-2 font-mono">{s.id}</td>
                  <td className="p-2 text-right tabular-nums">{s.tokenCount.toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(s.score, 4)}</td>
                  {snap.dict.categories.map((c) => (
                    <td key={c} className="p-2 text-right tabular-nums">
                      {s.categoryCounts[c] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Step 4 — LLM micro-inference */}
      <section id="step-4" className="mt-6 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Step 4 — LLM micro-inference</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {snap.llm.model} ({snap.llm.modelVersion}), temperature {snap.llm.temperature}, prompt
          version {snap.llm.promptVersion}. {snap.llm.totalTokensIn.toLocaleString()} input
          tokens / {snap.llm.totalTokensOut.toLocaleString()} output tokens across the corpus.
        </p>
        <ul className="mt-4 divide-y rounded border">
          {snap.llm.scores.map((s) => (
            <li key={s.id} className="p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-muted-foreground">{s.id}</span>
                <span className="tabular-nums">score: {s.score}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{s.rationale}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Step 5a — Triangulation (deviation analysis) */}
      <section id="step-5a" className="mt-6 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Triangulation — dictionary vs. LLM</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <Stat label="n" value={snap.triangulation.n.toString()} />
          <Stat label="Pearson r" value={fmt(snap.triangulation.pearson)} />
          <Stat label="Spearman ρ" value={fmt(snap.triangulation.spearman)} />
        </div>
        <h3 className="mt-6 text-sm font-medium">Top disagreement documents</h3>
        <ul className="mt-2 divide-y rounded border">
          {snap.triangulation.topDisagreements.map((d) => (
            <li key={d.id} className="p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-muted-foreground">{d.id}</span>
                <span className="tabular-nums text-xs">
                  dict: {fmt(d.dictScore, 4)} · LLM: {d.llmScore} · |Δz|: {fmt(d.delta, 2)}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{d.note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Step 5 — Macro inference */}
      <section id="step-5" className="mt-6 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Step 5 — LLM macro-inference</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The LLM read a stratified sample of {snap.macro.sampleSize} letters and proposed signals
          that may distinguish high-promotion from low-promotion letters.
        </p>
        <h3 className="mt-4 text-sm font-medium">Candidate signals</h3>
        <ul className="mt-2 divide-y rounded border">
          {snap.macro.signals.map((s, i) => (
            <li key={i} className="p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{s.signal}</span>
                <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">
                  {s.signalType}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{s.rationale}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                <em>Operationalize:</em> {s.suggestedOperationalization}
              </p>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-sm font-medium">Promoted features</h3>
        <ul className="mt-2 divide-y rounded border">
          {snap.macro.promotedFeatures.map((f) => (
            <li key={f.name} className="p-3 text-sm">
              <div className="font-mono text-xs">{f.name}</div>
              <div className="text-xs text-muted-foreground">
                {f.kind} · pattern: <code>{f.pattern}</code>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{f.perDocSummary}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* Step 6 — Integration & regression */}
      <section id="step-6" className="mt-6 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Step 6 — Integration &amp; combined regression</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Outcome: <strong>{snap.outcome.name}</strong>. {snap.outcome.note}
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {snap.regression.models.map((m) => (
            <div key={m.name} className="rounded border p-4 text-sm">
              <div className="text-xs uppercase text-muted-foreground">{m.name}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>n = {m.n}</div>
                <div>R² = {fmt(m.rSquared)}</div>
                <div className="col-span-2">Adj. R² = {fmt(m.adjRSquared)}</div>
              </div>
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th>term</th>
                    <th className="text-right">est.</th>
                    <th className="text-right">SE</th>
                    <th className="text-right">p</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {m.coefs.map((c) => (
                    <tr key={c.term}>
                      <td className="py-1 font-mono">{c.term}</td>
                      <td className="py-1 text-right tabular-nums">{fmt(c.estimate, 3)}</td>
                      <td className="py-1 text-right tabular-nums">{fmt(c.stdErr, 3)}</td>
                      <td
                        className={`py-1 text-right tabular-nums ${c.pValue < 0.05 ? "font-semibold" : "text-muted-foreground"}`}
                      >
                        {fmt(c.pValue, 3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded border bg-muted/30 p-3 text-sm">
          <em>Interpretation:</em> {snap.regression.interpretation}
        </p>

        <h3 className="mt-6 text-sm font-medium">Joined per-doc data</h3>
        <div className="mt-2 overflow-x-auto rounded border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">Doc id</th>
                <th className="p-2 text-right">Outcome</th>
                <th className="p-2 text-right">Dict score</th>
                <th className="p-2 text-right">LLM score</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {snap.outcome.values.map((o) => (
                <tr key={o.id}>
                  <td className="p-2 font-mono">{o.id}</td>
                  <td className="p-2 text-right tabular-nums">{fmtPct(o.outcome)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(dictById.get(o.id) ?? 0, 4)}</td>
                  <td className="p-2 text-right tabular-nums">{llmById.get(o.id) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Step 7 — Reflexivity log */}
      <section id="step-7" className="mt-6 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Step 7 — Reflexivity log</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Auditable record of judgment calls made along the way.
        </p>
        <ul className="mt-4 space-y-3">
          {snap.reflexivity.map((n) => (
            <li key={n.id} className="rounded border p-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {new Date(n.createdAt).toUTCString()}
              </div>
              <p className="mt-1">{n.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Step 8 — Manifest / export */}
      <section id="step-8" className="mt-6 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Step 8 — Reproducibility manifest</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The live tool ships the same fields as a JSON manifest in the export bundle, alongside
          a CSV of scores, a JSONL prompt + response archive, and a Markdown methods appendix.
        </p>
        <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Prompt version</dt>
            <dd className="font-mono text-xs">{snap.manifest.promptVersion}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Corpus checksum</dt>
            <dd className="font-mono text-xs">{snap.manifest.corpusChecksum}</dd>
          </div>
          {Object.entries(snap.manifest.models).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-muted-foreground">{k}</dt>
              <dd className="font-mono text-xs">{v}</dd>
            </div>
          ))}
          {Object.entries(snap.manifest.seeds).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-muted-foreground">seed: {k}</dt>
              <dd className="font-mono text-xs">{v}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 list-disc space-y-1 pl-6 text-xs text-muted-foreground">
          {snap.manifest.promptCheckpoints.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 border-t pt-6 text-xs text-muted-foreground">
        Want to reproduce this on your own corpus? Open a{" "}
        <Link href="/" className="underline">
          fresh project
        </Link>{" "}
        or{" "}
        <Link href="/reviewer" className="underline">
          activate a reviewer session
        </Link>{" "}
        to run all eight steps live.
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
