import { currentActor } from "@/lib/actor";
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { AppNav } from "@/components/nav";
import { NewProjectForm } from "./new-project-form";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/");

  const rows = await db()
    .select()
    .from(projects)
    .where(eq(projects.ownerId, actor.id))
    .orderBy(desc(projects.createdAt));

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-start justify-between gap-8">
          <div>
            <h1 className="text-2xl font-semibold">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each project corresponds to one research question — a construct, a corpus, and the triangulation between
              a traditional measure and an LLM measure.
            </p>
          </div>
          <NewProjectForm />
        </div>

        <ul className="mt-8 divide-y rounded-lg border">
          {rows.length === 0 ? (
            <li className="p-6 text-sm text-muted-foreground">
              No projects yet. Start one on the right — or load the bundled Warren Buffett demo.
            </li>
          ) : (
            rows.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.researchQuestion ? (
                    <p className="mt-1 text-sm text-muted-foreground">{p.researchQuestion}</p>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {p.createdAt.toLocaleDateString()}
                </span>
              </li>
            ))
          )}
        </ul>
      </main>
    </>
  );
}
