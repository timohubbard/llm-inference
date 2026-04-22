import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { scoreDictionary } from "@/lib/sidecar";

const body = z.object({
  method: z.enum(["lmd", "liwc", "custom_dict"]),
  corpusId: z.string().uuid(),
  dictionary: z.record(z.array(z.string())).optional(),
  documents: z.array(z.object({ id: z.string(), text: z.string() })).min(1),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const result = await scoreDictionary({
      method: parsed.data.method,
      dictionary: parsed.data.dictionary,
      documents: parsed.data.documents,
    });
    const scores = result.scores.map((s) => ({
      id: s.id,
      score:
        s.score ??
        (s.categoryCounts.positive !== undefined && s.categoryCounts.negative !== undefined
          ? (s.categoryCounts.positive - s.categoryCounts.negative) / Math.max(1, s.tokenCount)
          : 0),
    }));
    return NextResponse.json({ scores, summary: result.summary, sidecar: {
      version: result.sidecarVersion,
      imageDigest: result.sidecarImageDigest,
    } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sidecar call failed" },
      { status: 502 },
    );
  }
}
