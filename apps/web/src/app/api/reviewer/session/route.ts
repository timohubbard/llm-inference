import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import {
  reviewerConfig,
  startReviewerSession,
  endReviewerSession,
  currentReviewerSession,
} from "@/lib/reviewer";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const body = z.object({ password: z.string().min(1) });

export async function GET() {
  const session = await currentReviewerSession();
  return NextResponse.json(session);
}

function constantTimeEqual(a: string, b: string): boolean {
  // Pad shorter to longer length to avoid leaking length, then verify length
  // matched separately. timingSafeEqual requires equal-length inputs.
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  const maxLen = Math.max(aBuf.length, bBuf.length, 1);
  const aPad = Buffer.alloc(maxLen);
  const bPad = Buffer.alloc(maxLen);
  aBuf.copy(aPad);
  bBuf.copy(bPad);
  const digestEq = timingSafeEqual(aPad, bPad);
  return digestEq && aBuf.length === bBuf.length;
}

export async function POST(req: Request) {
  // Rate limit BEFORE password validation so a wrong-password attempt costs
  // the attacker the same as a typo. 10 attempts per 15 minutes per IP is
  // generous for real reviewers (who activate once) and tight against
  // brute force.
  const ip = clientIp(req);
  const rl = await rateLimit("reviewer-activate", ip, 10, 15 * 60);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Too many activation attempts. Try again in ${Math.ceil(rl.resetSeconds / 60)} minute(s).`,
      },
      { status: 429, headers: { "Retry-After": String(rl.resetSeconds) } },
    );
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const cfg = reviewerConfig();
  if (!cfg.password) {
    return NextResponse.json(
      { error: "Reviewer access is not configured on this deployment." },
      { status: 503 },
    );
  }
  if (!constantTimeEqual(parsed.data.password, cfg.password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  if (cfg.availableProviders.length === 0) {
    return NextResponse.json(
      {
        error:
          "No reviewer provider keys are configured on this deployment (set REVIEWER_ANTHROPIC_KEY, REVIEWER_OPENAI_KEY, and/or REVIEWER_GOOGLE_KEY).",
      },
      { status: 503 },
    );
  }

  try {
    const sessionId = await startReviewerSession();
    return NextResponse.json({
      sessionId,
      capUsd: cfg.capUsd,
      dailyBudgetUsd: cfg.dailyBudgetUsd,
      availableProviders: cfg.availableProviders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}

export async function DELETE() {
  await endReviewerSession();
  return NextResponse.json({ ok: true });
}
