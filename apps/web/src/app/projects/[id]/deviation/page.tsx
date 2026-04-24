import { currentActor } from "@/lib/actor";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { DeviationView } from "./deviation-view";

export const dynamic = "force-dynamic";

export default async function DeviationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect("/");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, actor.id)))
  )[0];
  if (!project) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Deviation analysis</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Triangulate the LLM score against the traditional dictionary measure. Pearson and Spearman correlations,
        scatterplot, and the top-5 largest-disagreement documents are computed in your browser from the scores held
        in this session — they don&apos;t leave your machine.
      </p>
      <DeviationView projectId={id} />
    </main>
  );
}
