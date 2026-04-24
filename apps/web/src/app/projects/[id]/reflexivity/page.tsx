import { currentActor } from "@/lib/actor";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { StepGuide } from "@/components/step-guide";
import { ReflexivityLog } from "./reflexivity-log";

export const dynamic = "force-dynamic";

export default async function ReflexivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect("/");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, actor.id)))
  )[0];
  if (!project) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Step 7 — Reflexivity log</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Keep a running record of judgment calls, disagreements you investigated, prompt edits, and decisions you made
        about which measure to trust. Entries are persisted and exported with the methods appendix.
      </p>
      <StepGuide
        what="An auditable record of the interpretive decisions you made: which disagreements you investigated, prompt edits, why you trust (or don't trust) the combined measure. This is what turns LLM scoring into defensible qualitative-plus-quantitative research."
        todo="Add a note for each non-trivial judgment call. Link to a run when the note is about a specific scoring pass. Entries are versioned and included in the export bundle."
        next="Step 8 — download the full reproducibility bundle."
      />
      <ReflexivityLog projectId={id} />
    </main>
  );
}
