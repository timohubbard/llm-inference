import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { corpora, projects } from "@/db/schema";

const body = z.object({
  name: z.string().min(1).max(200),
  source: z.string().max(500).optional(),
  docCount: z.number().int().nonnegative(),
  checksumSha256: z.string().min(32),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const owned = (
    await db()
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, actor.id)))
  )[0];
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const [row] = await db()
    .insert(corpora)
    .values({
      projectId,
      name: parsed.data.name,
      source: parsed.data.source ?? null,
      docCount: parsed.data.docCount,
      checksumSha256: parsed.data.checksumSha256,
    })
    .returning();
  return NextResponse.json({ id: row!.id });
}
