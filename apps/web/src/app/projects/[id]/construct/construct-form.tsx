"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Initial {
  id: string;
  name: string;
  definition: string;
  scaleMin: number;
  scaleMax: number;
  anchors: Record<string, string>;
  citations: string[];
  version: number;
}

export function ConstructForm({ projectId, initial }: { projectId: string; initial: Initial | null }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "Promotion Focus");
  const [definition, setDefinition] = useState(
    initial?.definition ??
      "Regulatory focus oriented toward gains, aspirations, and advancement opportunities (Higgins, 1997).",
  );
  const [scaleMin, setScaleMin] = useState(initial?.scaleMin ?? 1);
  const [scaleMax, setScaleMax] = useState(initial?.scaleMax ?? 7);
  const [anchorsText, setAnchorsText] = useState(
    initial
      ? Object.entries(initial.anchors).sort(([a], [b]) => Number(a) - Number(b)).map(([k, v]) => `${k}: ${v}`).join("\n")
      : "1: strongly prevention-focused (loss, obligation, security)\n4: balanced\n7: strongly promotion-focused (gain, aspiration, advancement)",
  );
  const [citationsText, setCitationsText] = useState(
    initial ? initial.citations.join("\n") : "Higgins (1997). Beyond pleasure and pain. American Psychologist, 52, 1280-1300.",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const anchors: Record<string, string> = {};
      for (const line of anchorsText.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const [k, ...rest] = line.split(":");
        if (!k || rest.length === 0) throw new Error(`Malformed anchor line: ${line}`);
        anchors[k.trim()] = rest.join(":").trim();
      }
      const res = await fetch(`/api/projects/${projectId}/constructs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          definition,
          scaleMin,
          scaleMax,
          anchors,
          citations: citationsText.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-3 py-2" />
      </Field>
      <Field label="Definition">
        <textarea
          value={definition}
          onChange={(e) => setDefinition(e.target.value)}
          rows={4}
          className="w-full rounded border px-3 py-2"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Scale min">
          <input
            type="number"
            value={scaleMin}
            onChange={(e) => setScaleMin(Number(e.target.value))}
            className="w-full rounded border px-3 py-2"
          />
        </Field>
        <Field label="Scale max">
          <input
            type="number"
            value={scaleMax}
            onChange={(e) => setScaleMax(Number(e.target.value))}
            className="w-full rounded border px-3 py-2"
          />
        </Field>
      </div>
      <Field label="Anchors (one per line: number: descriptor)">
        <textarea
          value={anchorsText}
          onChange={(e) => setAnchorsText(e.target.value)}
          rows={5}
          className="w-full rounded border px-3 py-2 font-mono text-sm"
        />
      </Field>
      <Field label="Citations (one per line)">
        <textarea
          value={citationsText}
          onChange={(e) => setCitationsText(e.target.value)}
          rows={3}
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </Field>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      <button
        onClick={save}
        disabled={busy}
        className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Saving…" : initial ? "Save new version" : "Save construct"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium">{label}</div>
      {children}
    </label>
  );
}
