import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { constructs, corpora, projects } from "@/db/schema";
import { AppNav } from "@/components/nav";

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

  const steps = [
    {
      n: 1,
      title: "Articulate theory",
      done: Boolean(constructRow),
      href: `/projects/${id}/construct`,
      cta: constructRow ? "Edit construct" : "Define a construct",
    },
    {
      n: 2,
      title: "Curate data",
      done: Boolean(corpusRow),
      href: `/projects/${id}/corpus`,
      cta: corpusRow ? `${corpusRow.docCount} documents loaded` : "Load a corpus",
    },
    { n: 3, title: "Traditional analysis", done: false, href: `/projects/${id}/run`, cta: "Run dictionary scoring" },
    { n: 4, title: "LLM micro-inference", done: false, href: `/projects/${id}/run`, cta: "Score with an LLM" },
    { n: 5, title: "LLM macro-inference", done: false, href: `/projects/${id}/macro`, cta: "Surface candidate signals" },
    { n: 6, title: "Integration & combined regression", done: false, href: `/projects/${id}/integrate`, cta: "Fit primary / LLM / combined" },
    { n: 7, title: "Reflexivity log", done: false, href: `/projects/${id}/reflexivity`, cta: "Record judgment calls" },
    { n: 8, title: "Export bundle", done: false, href: `/projects/${id}/export`, cta: "Download scores + appendix" },
  ];

  return (
    <>
      <AppNav projectId={id} />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        {project.researchQuestion ? (
          <p className="mt-2 text-sm text-muted-foreground">{project.researchQuestion}</p>
        ) : null}

        <ol className="mt-8 space-y-3">
          {steps.map((s) => (
            <li key={s.n} className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Step {s.n}</div>
                <div className="mt-1 font-medium">{s.title}</div>
              </div>
              <Link
                href={s.href}
                className={
                  s.done
                    ? "rounded border px-3 py-1.5 text-sm"
                    : "rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                }
              >
                {s.cta}
              </Link>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
