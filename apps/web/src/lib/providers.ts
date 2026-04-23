import { getProvider, type ProviderId } from "@llmi/shared";
import { currentReviewerSession, getReviewerKey, type ReviewerProviderId } from "./reviewer";

export interface ResolvedKey {
  apiKey: string;
  mode: "byok" | "reviewer";
  sessionId?: string;
}

function isReviewerProvider(id: ProviderId): id is ReviewerProviderId {
  return id === "anthropic" || id === "openai" || id === "google";
}

export async function resolveKey(providerId: ProviderId, userSuppliedKey?: string): Promise<ResolvedKey> {
  if (userSuppliedKey) return { apiKey: userSuppliedKey, mode: "byok" };

  if (isReviewerProvider(providerId)) {
    const session = await currentReviewerSession();
    const serverKey = getReviewerKey(providerId);
    if (session.active && serverKey) {
      return {
        apiKey: serverKey,
        mode: "reviewer",
        sessionId: session.sessionId,
      };
    }
  }

  throw new Error(
    "No API key available. Paste your provider key, or activate a reviewer session if the deployment has one configured for this provider.",
  );
}

export { getProvider };
