import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { constructs, corpora, projects } from "@/db/schema";
import { MacroPanel } from "./macro-panel";

export const dynamic = "force-dynamic";

export default async function MacroPage({ params }: { params: Promise<{ id: string }> }) {
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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Step 5 — LLM macro-inference</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Inductively surface candidate signals the LLM would use to recognize the construct — beyond the pre-specified
        dictionary or scale. Review each signal, then promote it into a keyword-based or presence-flag feature you can
        add to the combined regression in Step 6.
      </p>

      {!construct || !corpus ? (
        <p className="mt-6 rounded border border-destructive/30 bg-destructive/10 p-3 text-sm">
          Define a construct and load a corpus first.
        </p>
      ) : (
        <MacroPanel
          projectId={id}
          construct={{
            id: construct.id,
            name: construct.name,
            scaleMin: construct.scaleMin,
            scaleMax: construct.scaleMax,
          }}
        />
      )}
    </main>
  );
}
