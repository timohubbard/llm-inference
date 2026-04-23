"use client";

import { useEffect, useState } from "react";

export type ReviewerProviderId = "anthropic" | "openai" | "google";

export type ReviewerSession =
  | { active: false; loading: false }
  | {
      active: true;
      loading: false;
      sessionId: string;
      spentUsd: number;
      capUsd: number;
      availableProviders: ReviewerProviderId[];
    }
  | { active: false; loading: true };

export function useReviewerSession(): ReviewerSession {
  const [state, setState] = useState<ReviewerSession>({ active: false, loading: true });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/reviewer/session")
      .then((r) => (r.ok ? r.json() : { active: false }))
      .then((body) => {
        if (cancelled) return;
        if (body?.active) {
          setState({
            active: true,
            loading: false,
            sessionId: body.sessionId,
            spentUsd: body.spentUsd ?? 0,
            capUsd: body.capUsd ?? 0,
            availableProviders: body.availableProviders ?? [],
          });
        } else {
          setState({ active: false, loading: false });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ active: false, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function reviewerCoversProvider(
  session: ReviewerSession,
  provider: string,
): boolean {
  if (!session.active) return false;
  return (session.availableProviders as string[]).includes(provider);
}
