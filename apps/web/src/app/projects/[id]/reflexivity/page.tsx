import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { AppNav } from "@/components/nav";
import { ReflexivityLog } from "./reflexivity-log";

export const dynamic = "force-dynamic";

export default async function ReflexivityPage({ params }: { params: Promise<{ id: string }> }) {
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
        <h1 className="text-2xl font-semibold">Reflexivity log</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Keep a running record of judgment calls, disagreements you investigated, prompt edits, and decisions you made
          about which measure to trust. Entries are persisted and exported with the methods appendix.
        </p>
        <ReflexivityLog projectId={id} />
      </main>
    </>
  );
}
