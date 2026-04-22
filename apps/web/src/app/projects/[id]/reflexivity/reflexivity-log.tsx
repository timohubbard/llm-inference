"use client";

import { useEffect, useState } from "react";

interface Note {
  id: string;
  body: string;
  linkedRunId: string | null;
  createdAt: string;
}

export function ReflexivityLog({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [linkedRunId, setLinkedRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch(`/api/projects/${projectId}/reflexivity`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "load failed");
      setNotes(body.notes as Note[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refresh();
  }, [projectId]);

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reflexivity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: draft,
          linkedRunId: linkedRunId.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "save failed");
      setDraft("");
      setLinkedRunId("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(noteId: string) {
    if (!confirm("Delete this note?")) return;
    const res = await fetch(`/api/projects/${projectId}/reflexivity?noteId=${noteId}`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">New entry</h2>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder="What did you decide, and why? Which measure did you trust on which document, and what evidence drove the call?"
          className="mt-2 w-full rounded border p-2 text-sm"
        />
        <label className="mt-2 block text-xs text-muted-foreground">
          Linked run ID (optional)
          <input
            value={linkedRunId}
            onChange={(e) => setLinkedRunId(e.target.value)}
            placeholder="uuid of an llmRun this note relates to"
            className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
          />
        </label>
        <button
          onClick={submit}
          disabled={busy || !draft.trim()}
          className="mt-3 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save entry"}
        </button>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Log ({notes.length})</h2>
        {notes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {notes.map((n) => (
              <li key={n.id} className="py-3 text-sm">
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>{new Date(n.createdAt).toLocaleString()}</span>
                  <button onClick={() => remove(n.id)} className="underline-offset-2 hover:underline">
                    Delete
                  </button>
                </div>
                {n.linkedRunId ? (
                  <div className="mt-1 font-mono text-xs text-muted-foreground">run: {n.linkedRunId}</div>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {err ? <p className="text-sm text-destructive">{err}</p> : null}
    </div>
  );
}
