import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getProvider, type ProviderId } from "@llmi/shared";

const body = z.object({
  provider: z.enum(["anthropic", "openai", "openai-compat", "google"]),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const provider = getProvider(parsed.data.provider as ProviderId);
    const models = await provider.listModels(parsed.data.apiKey, parsed.data.baseUrl);
    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "list failed" },
      { status: 400 },
    );
  }
}
