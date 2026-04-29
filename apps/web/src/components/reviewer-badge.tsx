"use client";

import { useReviewerSession } from "@/lib/use-reviewer-session";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviewerBadge() {
  const session = useReviewerSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!session.active) return null;

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/reviewer/session", { method: "DELETE" });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const sessionRemaining = Math.max(0, session.capUsd - session.spentUsd);
  const dailyRemaining = Math.max(0, session.dailyCapUsd - session.dailySpentUsd);
  const showDaily = session.dailyCapUsd > 0;

  return (
    <div className="flex items-center gap-3 text-xs">
      <span
        className="rounded-full border border-green-500/40 bg-green-50 px-2 py-0.5 text-green-700 dark:bg-green-900/20 dark:text-green-400"
        title={
          showDaily
            ? `Per-session cap: $${session.capUsd.toFixed(2)} (${sessionRemaining.toFixed(2)} left).\nDeployment-wide daily budget: $${session.dailyCapUsd.toFixed(2)} (${dailyRemaining.toFixed(2)} left, refreshes UTC midnight).`
            : undefined
        }
      >
        Reviewer · ${sessionRemaining.toFixed(2)} session
        {showDaily ? <> · ${dailyRemaining.toFixed(2)} today</> : null}
      </span>
      <button
        onClick={signOut}
        disabled={busy}
        className="text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        End session
      </button>
    </div>
  );
}
