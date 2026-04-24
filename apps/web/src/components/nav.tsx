import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ReviewerBadge } from "./reviewer-badge";

export function AppNav({ projectId: _projectId }: { projectId?: string } = {}) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background">
      <div className="flex h-14 items-center justify-between px-6">
        <Link href="/projects" className="font-semibold">
          LLM Inference Tool
        </Link>
        <div className="flex items-center gap-4">
          <ReviewerBadge />
          <UserButton />
        </div>
      </div>
    </header>
  );
}
