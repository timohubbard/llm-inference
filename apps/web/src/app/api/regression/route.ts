import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { z } from "zod";
import { runRegression } from "@/lib/sidecar";

const body = z.object({
  formula: z.string().min(3),
  data: z.array(z.record(z.union([z.number(), z.string(), z.null()]))).min(3),
  family: z.enum(["ols", "logit"]).optional(),
});

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  try {
    const result = await runRegression(parsed.data, req);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sidecar call failed" },
      { status: 502 },
    );
  }
}
