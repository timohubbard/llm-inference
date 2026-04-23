import { ReactNode } from "react";

export function StepGuide({
  what,
  todo,
  next,
}: {
  what: ReactNode;
  todo: ReactNode;
  next?: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border bg-muted/40 p-4 text-sm">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What&apos;s happening
          </div>
          <div className="mt-1 text-foreground">{what}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What to do
          </div>
          <div className="mt-1 text-foreground">{todo}</div>
        </div>
        {next ? (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Up next
            </div>
            <div className="mt-1 text-foreground">{next}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
