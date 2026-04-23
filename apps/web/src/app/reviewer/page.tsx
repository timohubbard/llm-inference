"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewerPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/reviewer/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Activation failed");
      router.push("/projects");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Reviewer access</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        If you&apos;re a JMS reviewer evaluating this tool, enter the access password to unlock
        server-side API keys for any providers the deployment has configured (Anthropic, OpenAI,
        and/or Google). A per-session spend cap (default ~$2) applies across all providers. This
        lets you exercise the full workflow — including multi-model comparison — without bringing
        your own keys.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Reviewer password"
          className="w-full rounded border px-3 py-2"
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-primary py-2 text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Activating…" : "Activate"}
        </button>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
      </form>
    </main>
  );
}
