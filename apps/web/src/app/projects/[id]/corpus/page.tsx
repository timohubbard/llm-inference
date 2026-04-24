import { currentActor } from "@/lib/actor";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpora, projects } from "@/db/schema";
import { StepGuide } from "@/components/step-guide";
import { CorpusLoader } from "./corpus-loader";

export const dynamic = "force-dynamic";

export default async function CorpusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await currentActor();
  if (!actor) redirect("/");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, actor.id)))
  )[0];
  if (!project) notFound();

  const [existing] = await db().select().from(corpora).where(eq(corpora.projectId, id));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Step 2 — Corpus</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload documents as CSV or JSONL, or load the bundled Warren Buffett shareholder-letters demo. Documents are
        processed in memory — we store only the descriptor (name, doc count, content checksum) and never the text
        itself.
      </p>
      <StepGuide
        what="The documents you score. Text stays in your browser — only a descriptor (name, doc count, content checksum) is saved server-side. CSV needs columns id,text; JSONL needs one {id,text} object per line."
        todo="Click 'Load Buffett demo' for the bundled 44-year shareholder-letter corpus, or upload your own file. You'll see a doc count and checksum once it's loaded."
        next="Step 3 & 4 — run the dictionary and LLM measures on the corpus."
      />
      <CorpusLoader projectId={id} existing={existing ?? null} />
    </main>
  );
}
