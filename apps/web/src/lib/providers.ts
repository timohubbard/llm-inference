import { getProvider, type ProviderId } from "@llmi/shared";
import { currentReviewerSession } from "./reviewer";

export interface ResolvedKey {
  apiKey: string;
  mode: "byok" | "reviewer";
  sessionId?: string;
}

export async function resolveKey(providerId: ProviderId, userSuppliedKey?: string): Promise<ResolvedKey> {
  if (userSuppliedKey) return { apiKey: userSuppliedKey, mode: "byok" };

  if (providerId === "anthropic") {
    const session = await currentReviewerSession();
    if (session.active && process.env.REVIEWER_ANTHROPIC_KEY) {
      return {
        apiKey: process.env.REVIEWER_ANTHROPIC_KEY,
        mode: "reviewer",
        sessionId: session.sessionId,
      };
    }
  }

  throw new Error(
    "No API key available. Paste your provider key in Settings or activate a reviewer session.",
  );
}

export { getProvider };
