"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { STEPS, sessionDoneKey, stepHref, type StepKey } from "@/lib/steps";

export function StepSidebar({
  projectId,
  serverDone,
}: {
  projectId: string;
  serverDone: Partial<Record<StepKey, boolean>>;
}) {
  const pathname = usePathname();
  const [sessionDone, setSessionDone] = useState<Partial<Record<StepKey, boolean>>>({});

  useEffect(() => {
    function read() {
      const next: Partial<Record<StepKey, boolean>> = {};
      for (const s of STEPS) {
        try {
          next[s.key] = sessionStorage.getItem(sessionDoneKey(s.key, projectId)) === "1";
        } catch {
          /* SSR / unavailable */
        }
      }
      setSessionDone(next);
    }
    read();
    // Re-read when focus returns (e.g. navigating back after completing a step)
    const onFocus = () => read();
    const onStorage = () => read();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [projectId, pathname]);

  return (
    <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r bg-muted/20">
      <nav className="px-3 py-4">
        <Link
          href={`/projects/${projectId}`}
          className={`mb-2 block rounded px-3 py-2 text-sm ${
            pathname === `/projects/${projectId}` ? "bg-accent font-medium" : "hover:bg-accent/50"
          }`}
        >
          Overview
        </Link>
        <div className="mb-1 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Steps
        </div>
        <ol className="space-y-0.5">
          {STEPS.map((s) => {
            const href = stepHref(projectId, s.slug);
            const isActive = pathname === href;
            const done = Boolean(serverDone[s.key]) || Boolean(sessionDone[s.key]);
            return (
              <li key={s.key}>
                <Link
                  href={href}
                  className={`flex items-start gap-2 rounded px-3 py-2 text-sm leading-snug ${
                    isActive ? "bg-accent font-medium" : "hover:bg-accent/50"
                  }`}
                >
                  <span className="mt-0.5 w-4 shrink-0 text-center">
                    {done ? <CheckIcon /> : <span className="text-muted-foreground">{s.n}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                      Step {s.n}
                    </span>
                    <span className="block">{s.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="inline h-4 w-4 text-green-600"
      fill="currentColor"
      aria-label="complete"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414L8.5 12.086l6.793-6.793a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
