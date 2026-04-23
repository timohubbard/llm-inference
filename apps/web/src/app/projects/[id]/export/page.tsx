import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { StepGuide } from "@/components/step-guide";
import { ExportBundle } from "./export-bundle";

export const dynamic = "force-dynamic";

export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
  )[0];
  if (!project) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Step 8 — Export bundle</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Downloads everything from this browser session: scores CSV, prompt+response archive, methods appendix, and a
        reproducibility manifest. After download, these artefacts exist only on your machine.
      </p>
      <StepGuide
        what="A zip containing scores.csv (per-doc dictionary + LLM scores), prompts.jsonl (full prompt/response archive for this run), methods_appendix.md (a drop-in appendix for your paper), and manifest.json (model versions, seeds, checksums for reproducibility)."
        todo="Click download. The bundle is assembled in your browser from session state and never touches our server."
      />
      <ExportBundle projectId={id} projectName={project.name} />
    </main>
  );
}
