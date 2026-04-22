import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { constructs, corpora, projects } from "@/db/schema";
import { AppNav } from "@/components/nav";
import { RunPanel } from "./run-panel";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
  )[0];
  if (!project) notFound();

  const [construct] = await db().select().from(constructs).where(eq(constructs.projectId, id));
  const [corpus] = await db().select().from(corpora).where(eq(corpora.projectId, id));

  return (
    <>
      <AppNav projectId={id} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Run</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Step 3 runs the dictionary measure locally via the Python sidecar. Step 4 scores the corpus with an LLM —
          first a small subsample you review by hand, then (on your confirmation) the full corpus with a cost estimate.
        </p>
        {!construct || !corpus ? (
          <p className="mt-6 text-sm text-destructive">
            Define a construct and load a corpus first.
          </p>
        ) : (
          <RunPanel projectId={id} construct={construct} corpus={corpus} />
        )}
      </main>
    </>
  );
}
