import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { reviewerConfig, startReviewerSession, endReviewerSession, currentReviewerSession } from "@/lib/reviewer";

const body = z.object({ password: z.string().min(1) });

export async function GET() {
  const session = await currentReviewerSession();
  return NextResponse.json(session);
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const cfg = reviewerConfig();
  if (!cfg.password) {
    return NextResponse.json({ error: "Reviewer access is not configured on this deployment." }, { status: 503 });
  }
  if (parsed.data.password !== cfg.password) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  if (!cfg.apiKey) {
    return NextResponse.json(
      { error: "Reviewer Anthropic key is not set on this deployment." },
      { status: 503 },
    );
  }

  const sessionId = await startReviewerSession(userId);
  return NextResponse.json({ sessionId, capUsd: cfg.capUsd });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await endReviewerSession(userId);
  return NextResponse.json({ ok: true });
}
