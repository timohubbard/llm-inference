import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { StepGuide } from "@/components/step-guide";
import { IntegrationView } from "./integration-view";

export const dynamic = "force-dynamic";

export default async function IntegratePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
  )[0];
  if (!project) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Step 6 — Integration & combined regression</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Fit the primary (traditional) measure, the LLM measure, and a combined specification side-by-side. Per-document
        scores are pulled from this browser session; nothing is sent to our server beyond the join-and-fit request.
      </p>
      <StepGuide
        what="Three regressions side-by-side: outcome ~ dictionary, outcome ~ LLM, outcome ~ dictionary + LLM + promoted features. Compare coefficients and R² to see whether the LLM measure adds signal beyond the traditional one."
        todo="Upload an outcome CSV (columns: id,outcome) or click 'Load Buffett demo outcome' for a bundled example. Pick OLS or logistic, then fit."
        next="Step 7 — write up the judgment calls you made along the way in the reflexivity log."
      />
      <IntegrationView projectId={id} />
    </main>
  );
}
