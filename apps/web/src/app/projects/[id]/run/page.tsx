import { currentActor } from "@/lib/actor";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { constructs, corpora, projects } from "@/db/schema";
import { StepGuide } from "@/components/step-guide";
import { RunPanel } from "./run-panel";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect("/");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, actor.id)))
  )[0];
  if (!project) notFound();

  const [construct] = await db().select().from(constructs).where(eq(constructs.projectId, id));
  const [corpus] = await db().select().from(corpora).where(eq(corpora.projectId, id));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Steps 3 & 4 — Traditional + LLM micro-inference</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Step 3 runs the dictionary measure locally via the Python sidecar. Step 4 scores the corpus with an LLM —
        first a small subsample you review by hand, then (on your confirmation) the full corpus with a cost estimate.
      </p>
      <StepGuide
        what="Step 3 applies the Loughran–McDonald dictionary locally — fast, deterministic, no API key. Step 4 scores each document with an LLM against your construct definition, one call per document."
        todo="Run the dictionary first. Then paste an LLM API key (or use the reviewer session), load the model list, run a small subsample to review the scores and rationales, and confirm the cost estimate to score the full corpus."
        next="A triangulation view (Pearson/Spearman + scatter + top disagreements) appears below once both passes are done."
      />
      {!construct || !corpus ? (
        <p className="mt-6 text-sm text-destructive">
          Define a construct and load a corpus first.
        </p>
      ) : (
        <RunPanel projectId={id} construct={construct} corpus={corpus} />
      )}
    </main>
  );
}
