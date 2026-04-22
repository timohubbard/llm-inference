"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { sha256Hex } from "@/lib/utils";

interface Existing {
  id: string;
  name: string;
  docCount: number;
  checksumSha256: string;
}

type Doc = { id: string; text: string };

function parseCsv(raw: string): Doc[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && raw[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  if (!header) throw new Error("CSV is empty");
  const idIdx = header.findIndex((h) => h.trim().toLowerCase() === "id");
  const textIdx = header.findIndex((h) => h.trim().toLowerCase() === "text");
  if (idIdx < 0 || textIdx < 0) {
    throw new Error("CSV must include 'id' and 'text' columns");
  }
  const docs: Doc[] = [];
  for (const r of rows) {
    if (r.every((cell) => cell.trim() === "")) continue;
    const id = (r[idIdx] ?? "").trim();
    const text = r[textIdx] ?? "";
    if (!id || !text.trim()) continue;
    docs.push({ id, text });
  }
  return docs;
}

function parseJsonl(raw: string): Doc[] {
  const docs: Doc[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const obj = JSON.parse(trimmed) as { id?: unknown; text?: unknown };
    if (typeof obj.id !== "string" || typeof obj.text !== "string") {
      throw new Error("each JSONL line must be {\"id\": string, \"text\": string}");
    }
    docs.push({ id: obj.id, text: obj.text });
  }
  return docs;
}

export function CorpusLoader({ projectId, existing }: { projectId: string; existing: Existing | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [corpusName, setCorpusName] = useState("Custom corpus");
  const fileRef = useRef<HTMLInputElement>(null);

  async function persistCorpus(docs: Doc[], name: string, source: string) {
    sessionStorage.setItem(`corpus:${projectId}`, JSON.stringify(docs));
    const checksum = await sha256Hex(
      docs.map((d) => `${d.id}\u0001${d.text}`).join("\u0002"),
    );
    const res = await fetch(`/api/projects/${projectId}/corpus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, source, docCount: docs.length, checksumSha256: checksum }),
    });
    if (!res.ok) throw new Error(await res.text());
    return checksum;
  }

  async function loadDemo() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const index = await fetch("/demo/buffett/index.json").then((r) => r.json());
      const docs: Doc[] = [];
      for (const entry of index.documents as Array<{ id: string; file: string }>) {
        const text = await fetch(`/demo/buffett/${entry.file}`).then((r) => r.text());
        docs.push({ id: entry.id, text });
      }
      const checksum = await persistCorpus(
        docs,
        "Warren Buffett shareholder letters (demo)",
        "berkshirehathaway.com/letters",
      );
      setInfo(`Loaded ${docs.length} letters into this browser session (checksum ${checksum.slice(0, 12)}…).`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const raw = await file.text();
      const isJsonl = file.name.toLowerCase().endsWith(".jsonl") || file.name.toLowerCase().endsWith(".ndjson");
      const docs = isJsonl ? parseJsonl(raw) : parseCsv(raw);
      if (docs.length === 0) throw new Error("no rows with id+text found");
      const seen = new Set<string>();
      for (const d of docs) {
        if (seen.has(d.id)) throw new Error(`duplicate id: ${d.id}`);
        seen.add(d.id);
      }
      const checksum = await persistCorpus(docs, corpusName || file.name, `upload:${file.name}`);
      setInfo(
        `Parsed ${docs.length} documents from ${file.name} (checksum ${checksum.slice(0, 12)}…). Text stays in this browser only.`,
      );
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {existing ? (
        <div className="rounded-lg border p-4">
          <div className="font-medium">{existing.name}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {existing.docCount} documents · checksum {existing.checksumSha256.slice(0, 16)}…
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Document text lives in this browser session only. If you close this tab, the corpus descriptor stays but the
            text must be reloaded before running a scoring pass.
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border p-4">
        <h2 className="font-medium">Bundled demo corpus</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Warren Buffett&apos;s annual letters to Berkshire Hathaway shareholders. The files bundled here are
          <b> short illustrative excerpts</b> (~100 words each) — enough to click through the workflow, not enough for
          substantive analysis. For a real run, fetch the full letters from{" "}
          <a className="underline" href="https://www.berkshirehathaway.com/letters/letters.html" target="_blank" rel="noreferrer">
            berkshirehathaway.com/letters
          </a>{" "}
          and upload them as a CSV below.
        </p>
        <button
          onClick={loadDemo}
          disabled={busy}
          className="mt-3 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Loading…" : "Load Buffett letters"}
        </button>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="font-medium">Upload your own corpus</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          CSV (with <code>id,text</code> columns) or JSONL/NDJSON (one <code>{"{ \"id\", \"text\" }"}</code> per line).
          Parsed in your browser; the raw text never touches our database — only a sha256 checksum and document count.
        </p>
        <label className="mt-3 block text-sm">
          Corpus name
          <input
            type="text"
            value={corpusName}
            onChange={(e) => setCorpusName(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
          />
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.jsonl,.ndjson,text/csv,application/json"
          onChange={onUpload}
          disabled={busy}
          className="mt-3 block text-sm"
        />
      </div>

      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
    </div>
  );
}
