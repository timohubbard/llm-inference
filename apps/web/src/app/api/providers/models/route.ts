import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { z } from "zod";
import { type ProviderId } from "@llmi/shared";
import { getProvider, resolveKey } from "@/lib/providers";

const body = z.object({
  provider: z.enum(["anthropic", "openai", "openai-compat", "google"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const key = await resolveKey(
      parsed.data.provider as ProviderId,
      parsed.data.apiKey && parsed.data.apiKey.length > 0 ? parsed.data.apiKey : undefined,
    );
    const provider = getProvider(parsed.data.provider as ProviderId);
    const models = await provider.listModels(key.apiKey, parsed.data.baseUrl);
    return NextResponse.json({ models, keyMode: key.mode });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "list failed" },
      { status: 400 },
    );
  }
}
