import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export function AppNav({ projectId }: { projectId?: string }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/projects" className="font-semibold">LLM Inference Tool</Link>
          {projectId ? (
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link href={`/projects/${projectId}`}>Overview</Link>
              <Link href={`/projects/${projectId}/construct`}>Construct</Link>
              <Link href={`/projects/${projectId}/corpus`}>Corpus</Link>
              <Link href={`/projects/${projectId}/run`}>Run</Link>
              <Link href={`/projects/${projectId}/deviation`}>Deviation</Link>
              <Link href={`/projects/${projectId}/macro`}>Macro</Link>
              <Link href={`/projects/${projectId}/integrate`}>Integrate</Link>
              <Link href={`/projects/${projectId}/reflexivity`}>Reflexivity</Link>
              <Link href={`/projects/${projectId}/export`}>Export</Link>
            </nav>
          ) : null}
        </div>
        <UserButton />
      </div>
    </header>
  );
}
