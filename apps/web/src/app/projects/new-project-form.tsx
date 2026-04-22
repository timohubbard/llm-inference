"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [researchQuestion, setRQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(opts: { seedDemo?: boolean }) {
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: opts.seedDemo ? "Buffett shareholder letters demo" : name,
          researchQuestion: opts.seedDemo
            ? "Does promotion-focus language in Buffett's shareholder letters co-move with subsequent returns?"
            : researchQuestion,
          seedDemo: opts.seedDemo ?? false,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      router.push(`/projects/${body.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-80 shrink-0 rounded-lg border p-4">
      <h2 className="text-sm font-medium">New project</h2>
      <div className="mt-3 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <textarea
          value={researchQuestion}
          onChange={(e) => setRQ(e.target.value)}
          placeholder="Research question"
          rows={3}
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <button
          onClick={() => create({})}
          disabled={busy || !name.trim()}
          className="w-full rounded bg-primary py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          Create
        </button>
      </div>
      <div className="mt-4 border-t pt-4">
        <button
          onClick={() => create({ seedDemo: true })}
          disabled={busy}
          className="w-full rounded border py-1.5 text-sm disabled:opacity-60"
        >
          Load Buffett demo project
        </button>
      </div>
    </div>
  );
}
