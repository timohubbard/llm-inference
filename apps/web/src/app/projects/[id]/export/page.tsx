import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { AppNav } from "@/components/nav";
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
    <>
      <AppNav projectId={id} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Export bundle</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Downloads everything from this browser session: scores CSV, prompt+response archive, methods appendix, and a
          reproducibility manifest. After download, these artefacts exist only on your machine.
        </p>
        <ExportBundle projectId={id} projectName={project.name} />
      </main>
    </>
  );
}
