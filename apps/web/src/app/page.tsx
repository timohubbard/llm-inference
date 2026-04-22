import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

const STEPS = [
  { n: 1, title: "Articulate theory", body: "Define constructs, scale anchors, hypotheses; register them." },
  { n: 2, title: "Curate data", body: "Load a corpus and inspect validity (coverage, duplicates, encoding)." },
  { n: 3, title: "Traditional analysis", body: "Dictionary word-counting (LMD, LIWC, custom) as the primary textual measure." },
  { n: 4, title: "LLM micro-inference", body: "Score the construct with an LLM; review a subsample; triangulate against Step 3." },
  { n: 5, title: "LLM macro-inference", body: "Inductively surface novel signals and promote them to variables." },
  { n: 6, title: "Integration & reporting", body: "Combined regressions, reflexivity notes, export bundle." },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold">LLM Inference Tool</Link>
          <nav className="flex items-center gap-4 text-sm">
            <a href="https://github.com/" className="text-muted-foreground hover:text-foreground">GitHub</a>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="rounded bg-primary px-3 py-1.5 text-primary-foreground">Sign in</button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <Link href="/projects" className="rounded bg-primary px-3 py-1.5 text-primary-foreground">Projects</Link>
              <UserButton />
            </SignedIn>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Triangulate textual measurement with LLM inference</h1>
        <p className="mt-4 text-muted-foreground">
          Companion software for the JMS methods paper. Construct scoring, deviation analysis, and macro-signal discovery
          — side-by-side with traditional dictionary methods. Your data never leaves the run: uploads are processed in
          memory and results are streamed to you as a downloadable bundle.
        </p>
        <div className="mt-6 flex gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded bg-primary px-4 py-2 text-primary-foreground">Get started</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href="/projects" className="rounded bg-primary px-4 py-2 text-primary-foreground">Open a project</Link>
          </SignedIn>
          <Link href="/reviewer" className="rounded border px-4 py-2">I&apos;m a JMS reviewer</Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="text-xl font-semibold">The 6-step workflow</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-lg border p-4">
              <div className="text-xs font-medium uppercase text-muted-foreground">Step {s.n}</div>
              <div className="mt-1 font-medium">{s.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
