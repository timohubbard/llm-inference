import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { projects, reflexivityNotes } from "@/db/schema";

const createBody = z.object({
  body: z.string().min(1).max(10_000),
  linkedRunId: z.string().uuid().optional(),
});

async function ensureOwner(projectId: string, actorId: string) {
  const row = (
    await db()
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, actorId)))
  )[0];
  return !!row;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ensureOwner(id, actor.id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const notes = await db()
    .select()
    .from(reflexivityNotes)
    .where(eq(reflexivityNotes.projectId, id))
    .orderBy(desc(reflexivityNotes.createdAt));
  return NextResponse.json({ notes });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ensureOwner(id, actor.id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = createBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const [row] = await db()
    .insert(reflexivityNotes)
    .values({
      projectId: id,
      authorId: actor.id,
      body: parsed.data.body,
      linkedRunId: parsed.data.linkedRunId ?? null,
    })
    .returning();
  return NextResponse.json({ note: row }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ensureOwner(id, actor.id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const noteId = searchParams.get("noteId");
  if (!noteId) return NextResponse.json({ error: "noteId required" }, { status: 400 });

  await db()
    .delete(reflexivityNotes)
    .where(and(eq(reflexivityNotes.id, noteId), eq(reflexivityNotes.projectId, id)));
  return NextResponse.json({ ok: true });
}
