"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STEPS, stepHref, type StepKey } from "@/lib/steps";

/**
 * Shown when a step has just been marked complete. Displays a green confirmation
 * and auto-advances to the next step after `delayMs`. User can cancel or click
 * "Continue now" to jump immediately.
 */
export function StepCompleteBanner({
  projectId,
  currentKey,
  delayMs = 2500,
}: {
  projectId: string;
  currentKey: StepKey;
  delayMs?: number;
}) {
  const router = useRouter();
  const [cancelled, setCancelled] = useState(false);

  const idx = STEPS.findIndex((s) => s.key === currentKey);
  const next = idx >= 0 && idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
  const nextHref = next ? stepHref(projectId, next.slug) : null;

  useEffect(() => {
    if (cancelled || !nextHref) return;
    const t = setTimeout(() => router.push(nextHref), delayMs);
    return () => clearTimeout(t);
  }, [cancelled, nextHref, delayMs, router]);

  if (!next || !nextHref) {
    return (
      <div className="mt-6 flex items-center gap-2 rounded-md border border-green-600/30 bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-200">
        <CheckIcon />
        <span>All steps complete.</span>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-600/30 bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-200">
      <div className="flex items-center gap-2">
        <CheckIcon />
        <span>
          Step complete. Continuing to Step {next.n} — {next.label}
          {cancelled ? " (paused)" : "…"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {!cancelled ? (
          <button
            onClick={() => setCancelled(true)}
            className="rounded border border-green-700/40 px-2 py-1 text-xs hover:bg-green-100 dark:hover:bg-green-900/40"
          >
            Stay here
          </button>
        ) : null}
        <Link
          href={nextHref}
          className="rounded bg-green-700 px-3 py-1 text-xs font-medium text-white hover:bg-green-800"
        >
          Continue now →
        </Link>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-green-700" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414L8.5 12.086l6.793-6.793a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
