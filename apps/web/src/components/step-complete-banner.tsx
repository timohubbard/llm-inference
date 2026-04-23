"use client";

import Link from "next/link";
import { STEPS, stepHref, type StepKey } from "@/lib/steps";

/**
 * Shown at the bottom of a step once it's been marked complete. Confirms the
 * step is done and offers an explicit button to move to the next step. Does
 * NOT auto-advance — the user decides when to move on.
 */
export function StepCompleteBanner({
  projectId,
  currentKey,
  message,
}: {
  projectId: string;
  currentKey: StepKey;
  message?: string;
}) {
  const idx = STEPS.findIndex((s) => s.key === currentKey);
  const current = idx >= 0 ? STEPS[idx] : null;
  const next = idx >= 0 && idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
  const nextHref = next ? stepHref(projectId, next.slug) : null;

  const label = message ?? (current ? `Step ${current.n} complete.` : "Step complete.");

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-600/30 bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-200">
      <div className="flex items-center gap-2">
        <CheckIcon />
        <span>{label}</span>
      </div>
      {next && nextHref ? (
        <Link
          href={nextHref}
          className="rounded bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
        >
          Continue to Step {next.n} — {next.label} →
        </Link>
      ) : (
        <span className="text-xs">All steps complete.</span>
      )}
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
