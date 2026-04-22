import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { AppNav } from "@/components/nav";
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
    <>
      <AppNav projectId={id} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Step 6 — Integration & combined regression</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Fit the primary (traditional) measure, the LLM measure, and a combined specification side-by-side. Per-document
          scores are pulled from this browser session; nothing is sent to our server beyond the join-and-fit request.
        </p>
        <IntegrationView projectId={id} />
      </main>
    </>
  );
}
