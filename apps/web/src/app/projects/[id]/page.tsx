import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { constructs, corpora, projects } from "@/db/schema";
import { STEPS, stepHref } from "@/lib/steps";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const project = (
    await db().select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
  )[0];
  if (!project) notFound();

  const [constructRow] = await db().select().from(constructs).where(eq(constructs.projectId, id));
  const [corpusRow] = await db().select().from(corpora).where(eq(corpora.projectId, id));

  const statusBySlug: Record<string, string | undefined> = {
    construct: constructRow ? `v${constructRow.version} saved` : undefined,
    corpus: corpusRow ? `${corpusRow.docCount} documents loaded` : undefined,
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      {project.researchQuestion ? (
        <p className="mt-2 text-sm text-muted-foreground">{project.researchQuestion}</p>
      ) : null}

      <ol className="mt-8 space-y-3">
        {STEPS.map((s) => (
          <li key={s.key} className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">Step {s.n}</div>
              <div className="mt-1 font-medium">{s.label}</div>
              {statusBySlug[s.slug] ? (
                <div className="mt-1 text-xs text-muted-foreground">{statusBySlug[s.slug]}</div>
              ) : null}
            </div>
            <Link
              href={stepHref(id, s.slug)}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            >
              Open
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
