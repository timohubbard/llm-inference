import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { and, desc, eq } from "drizzle-orm";
import { constructDefinitionSchema } from "@llmi/shared";
import { db } from "@/db/client";
import { constructs, projects } from "@/db/schema";

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

  const parsed = constructDefinitionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const [prev] = await db()
    .select({ version: constructs.version })
    .from(constructs)
    .where(and(eq(constructs.projectId, projectId), eq(constructs.name, parsed.data.name)))
    .orderBy(desc(constructs.version))
    .limit(1);

  const nextVersion = (prev?.version ?? 0) + 1;

  const [row] = await db()
    .insert(constructs)
    .values({
      projectId,
      version: nextVersion,
      name: parsed.data.name,
      definition: parsed.data.definition,
      scaleMin: parsed.data.scaleMin,
      scaleMax: parsed.data.scaleMax,
      anchors: parsed.data.anchors,
      citations: parsed.data.citations,
    })
    .returning();
  return NextResponse.json({ id: row!.id, version: nextVersion });
}
