/**
 * Capture real LLM scores for the /demo snapshot using the same prompt + provider
 * the live tool ships, then re-run the Python script to recompute triangulation
 * and regression on top of the real scores.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm tsx scripts/capture_llm_scores.ts
 *
 * Optional env:
 *   DEMO_MODEL=claude-sonnet-4-5    (default — cheap + fast)
 *   DEMO_TEMPERATURE=0              (default; deterministic)
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import {
  buildConstructScoreSystemPrompt,
  buildConstructScoreUserPrompt,
  completeWithRetry,
  getProvider,
  makeBoundedScoreSchema,
} from "@llmi/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAPSHOT = path.join(ROOT, "apps/web/public/demo/snapshot.json");
const CORPUS_DIR = path.join(ROOT, "apps/web/public/demo/buffett");
const INDEX = path.join(CORPUS_DIR, "index.json");

const MODEL = process.env.DEMO_MODEL ?? "claude-sonnet-4-5";
const TEMPERATURE = Number(process.env.DEMO_TEMPERATURE ?? "0");

interface Snapshot {
  construct: {
    name: string;
    definition: string;
    scaleMin: number;
    scaleMax: number;
    anchors: Record<string, string>;
    citations: string[];
  };
  llm: {
    provider: string;
    model: string;
    modelVersion: string | null;
    promptVersion: string;
    temperature: number;
    totalTokensIn: number;
    totalTokensOut: number;
    scores: Array<{ id: string; score: number | null; rationale: string }>;
  };
  [k: string]: unknown;
}

interface IndexEntry {
  id: string;
  file: string;
  year: number;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY env var is required.");
    console.error("Usage: ANTHROPIC_API_KEY=sk-ant-... pnpm tsx scripts/capture_llm_scores.ts");
    process.exit(1);
  }

  const snapshot: Snapshot = JSON.parse(await fs.readFile(SNAPSHOT, "utf8"));
  const indexRaw = JSON.parse(await fs.readFile(INDEX, "utf8")) as { documents: IndexEntry[] };
  const docs = await Promise.all(
    indexRaw.documents.map(async (entry) => ({
      id: entry.id,
      text: await fs.readFile(path.join(CORPUS_DIR, entry.file), "utf8"),
    })),
  );
  console.log(`Loaded ${docs.length} corpus docs`);

  const provider = getProvider("anthropic");
  const schema = makeBoundedScoreSchema(snapshot.construct.scaleMin, snapshot.construct.scaleMax);
  const system = buildConstructScoreSystemPrompt();

  const scores: Array<{ id: string; score: number | null; rationale: string }> = [];
  let totalIn = 0;
  let totalOut = 0;
  let modelVersion: string | null = null;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;
    process.stdout.write(`[${i + 1}/${docs.length}] ${doc.id}… `);
    const userPrompt = buildConstructScoreUserPrompt({
      construct: {
        name: snapshot.construct.name,
        definition: snapshot.construct.definition,
        scaleMin: snapshot.construct.scaleMin,
        scaleMax: snapshot.construct.scaleMax,
        anchors: snapshot.construct.anchors,
        citations: snapshot.construct.citations,
      },
      document: { id: doc.id, text: doc.text },
    });

    try {
      const { result } = await completeWithRetry<{ score: number; rationale: string }>(provider, {
        apiKey,
        model: MODEL,
        system,
        messages: [{ role: "user", content: userPrompt }],
        responseSchema: schema,
        temperature: TEMPERATURE,
        maxTokens: 400,
      });
      totalIn += result.tokensIn;
      totalOut += result.tokensOut;
      if (!modelVersion && result.modelVersion) modelVersion = result.modelVersion;
      scores.push({
        id: doc.id,
        score: result.content.score,
        rationale: result.content.rationale,
      });
      console.log(`score=${result.content.score} (${result.tokensIn}+${result.tokensOut} tokens)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg}`);
      scores.push({ id: doc.id, score: null, rationale: `error: ${msg}` });
    }
  }

  snapshot.llm = {
    provider: "anthropic",
    model: MODEL,
    modelVersion: modelVersion ?? MODEL,
    promptVersion: "construct-scoring@1.0",
    temperature: TEMPERATURE,
    totalTokensIn: totalIn,
    totalTokensOut: totalOut,
    scores,
  };

  await fs.writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`\nWrote LLM scores to ${SNAPSHOT}`);
  console.log(`Total: ${totalIn} input + ${totalOut} output tokens`);

  // Re-run the Python builder to recompute LMD + triangulation + regression
  // against the new LLM scores (kept by the script when it sees them).
  console.log("\nRunning Python builder to recompute triangulation + regression…");
  const py = path.join(ROOT, "apps/web/.venv-test/bin/python3");
  const script = path.join(ROOT, "scripts/build_demo_snapshot.py");
  execSync(`"${py}" "${script}"`, { stdio: "inherit", cwd: ROOT, shell: "/bin/sh" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
