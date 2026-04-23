import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { constructs, projects } from "@/db/schema";
import { StepGuide } from "@/components/step-guide";
import { ConstructForm } from "./construct-form";

export const dynamic = "force-dynamic";

export default async function ConstructPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
  )[0];
  if (!project) notFound();

  const [existing] = await db().select().from(constructs).where(eq(constructs.projectId, id));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Step 1 — Construct</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Define the construct, scale, and per-point anchors. Each edit creates a new version — prior versions remain
        attached to any runs that used them.
      </p>
      <StepGuide
        what="A construct is the latent thing you want to measure (e.g., promotion focus, tone, uncertainty). The definition, scale, and anchors you write here are passed verbatim into every LLM scoring call."
        todo="Name the construct, write a 1–3 sentence definition, pick a numeric scale, and describe what each scale point means. Cite the literature the construct comes from."
        next="Step 2 — load the corpus of documents you want scored."
      />
      <ConstructForm projectId={id} initial={existing ?? null} />
    </main>
  );
}
