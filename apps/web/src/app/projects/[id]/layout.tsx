import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  constructs,
  corpora,
  llmRuns,
  projects,
  reflexivityNotes,
  traditionalRuns,
} from "@/db/schema";
import { AppNav } from "@/components/nav";
import { StepSidebar } from "@/components/step-sidebar";
import type { StepKey } from "@/lib/steps";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
  )[0];
  if (!project) notFound();

  const [construct] = await db().select().from(constructs).where(eq(constructs.projectId, id));
  const [corpus] = await db().select().from(corpora).where(eq(corpora.projectId, id));
  const tradRuns = corpus
    ? await db().select().from(traditionalRuns).where(eq(traditionalRuns.corpusId, corpus.id))
    : [];
  const llmCompletedRuns = corpus
    ? await db().select().from(llmRuns).where(eq(llmRuns.corpusId, corpus.id))
    : [];
  const [reflexNote] = await db()
    .select()
    .from(reflexivityNotes)
    .where(eq(reflexivityNotes.projectId, id));

  const serverDone: Partial<Record<StepKey, boolean>> = {
    construct: Boolean(construct),
    corpus: Boolean(corpus),
    traditional: tradRuns.length > 0,
    llm: llmCompletedRuns.some((r) => r.status === "completed"),
    reflexivity: Boolean(reflexNote),
  };

  return (
    <div className="min-h-screen">
      <AppNav projectId={id} />
      <div className="flex">
        <StepSidebar projectId={id} serverDone={serverDone} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
