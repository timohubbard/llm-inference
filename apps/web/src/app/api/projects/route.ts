import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/db/client";
import { projects } from "@/db/schema";

const body = z.object({
  name: z.string().min(1).max(200),
  researchQuestion: z.string().max(2000).optional(),
  seedDemo: z.boolean().default(false),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const [row] = await db()
    .insert(projects)
    .values({
      ownerId: userId,
      name: parsed.data.name,
      researchQuestion: parsed.data.researchQuestion ?? null,
      unitOfAnalysis: parsed.data.seedDemo ? "shareholder letter × fiscal year" : null,
    })
    .returning();
  return NextResponse.json({ id: row!.id });
}
