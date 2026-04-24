import { auth } from "@clerk/nextjs/server";
import { currentReviewerSession } from "./reviewer";

export type Actor =
  | { id: string; mode: "clerk"; clerkUserId: string }
  | { id: string; mode: "reviewer"; reviewerSessionId: string };

export async function currentActor(): Promise<Actor | null> {
  const { userId } = await auth();
  if (userId) return { id: userId, mode: "clerk", clerkUserId: userId };

  const reviewer = await currentReviewerSession();
  if (reviewer.active) {
    return {
      id: `reviewer:${reviewer.sessionId}`,
      mode: "reviewer",
      reviewerSessionId: reviewer.sessionId,
    };
  }
  return null;
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) {
    throw new UnauthorizedError();
  }
  return actor;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}
