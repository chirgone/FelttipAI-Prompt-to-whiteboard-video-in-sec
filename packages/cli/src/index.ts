import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  describeTimedPlan,
  ingest,
  narrate,
  newRunDir,
  plan,
  PlanOptionsSchema,
  resolveTimedPlan,
  ScenePlanSchema,
  SourceDocumentSchema,
  StageError,
  timed,
  writeArtifact,
  type PlanOptions,
  type TimedPlan,
} from "@felttip/engine";
import { renderVideo } from "@felttip/renderer";

const USAGE = `felttip — whiteboard explainer video engine

Usage:
  felttip ingest <file>                     file → source-document.json
  felttip ingest --prompt "<text>"          prompt → source-document.json
  felttip plan <source-document.json> [--duration 1|2|3|5] [--language en]
                 [--aspect 16:9|9:16|1:1] [--voice <name>]
  felttip narrate <sceneplan.json> [--voice <name>]   TTS + word timestamps
  felttip render <sceneplan.json|timedplan.json>   MP4 (silent for sceneplans)
  felttip run <file|--prompt "<text>"> [plan options]  full pipeline → out.mp4

Artifacts are written to runs/<timestamp>/.`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "ingest":
      await cmdIngest(rest);
      break;
    case "plan":
      await cmdPlan(rest);
      break;
    case "narrate":
      await cmdNarrate(rest);
      break;
    case "render":
      await cmdRender(rest);
      break;
    case "run":
      await cmdRun(rest);
      break;
    case undefined:
    case "help":
    case "--help":
      console.log(USAGE);
      break;
    default:
      console.error(`Unknown command "${command}"\n\n${USAGE}`);
      process.exitCode = 1;
  }
}

function planOptionsFrom(values: {
  duration?: string;
  language?: string;
  aspect?: string;
  voice?: string;
}): PlanOptions {
  return PlanOptionsSchema.parse({
    ...(values.duration ? { durationMin: Number(values.duration) } : {}),
    ...(values.language ? { language: values.language } : {}),
    ...(values.aspect ? { aspectRatio: values.aspect } : {}),
    ...(values.voice ? { voice: values.voice } : {}),
  });
}

async function cmdIngest(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { prompt: { type: "string" } },
    allowPositionals: true,
  });
  const runDir = newRunDir();
  const { result } = await timed("ingest", () =>
    ingest(
      values.prompt !== undefined
        ? { promptText: values.prompt }
        : { filePath: requirePositional(positionals, "file") },
    ),
  );
  writeArtifact(runDir, "source-document.json", result);
}

async function cmdPlan(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      duration: { type: "string" },
      language: { type: "string" },
      aspect: { type: "string" },
      voice: { type: "string" },
    },
    allowPositionals: true,
  });
  const docPath = requirePositional(positionals, "source-document.json");
  const doc = SourceDocumentSchema.parse(
    JSON.parse(readFileSync(docPath, "utf8")),
  );
  const options = planOptionsFrom(values);
  const runDir = newRunDir();
  const { result } = await timed("plan", () => plan(doc, options));
  writeArtifact(runDir, "sceneplan.json", result);
  console.log(
    `Planned "${result.title}": ${result.scenes.length} scenes, ` +
      `${result.scenes.reduce((n, s) => n + s.elements.length, 0)} elements`,
  );
}

async function cmdRender(argv: string[]): Promise<void> {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true });
  const planPath = requirePositional(positionals, "sceneplan.json|timedplan.json");
  const parsed: unknown = JSON.parse(readFileSync(planPath, "utf8"));
  // A TimedPlan already carries totalDurationMs; a ScenePlan needs timing resolved.
  const isTimed =
    typeof parsed === "object" && parsed !== null && "totalDurationMs" in parsed;
  const timedPlan: TimedPlan = isTimed
    ? (parsed as TimedPlan)
    : resolveTimedPlan(ScenePlanSchema.parse(parsed));
  // A narrated timedplan's audioFile paths are relative to its own run dir,
  // so render in place; a bare sceneplan gets a fresh run dir.
  const runDir = isTimed ? path.dirname(path.resolve(planPath)) : newRunDir();
  if (!isTimed) writeArtifact(runDir, "timedplan.json", timedPlan);
  console.log(`Rendering: ${describeTimedPlan(timedPlan)}`);
  const { result } = await timed("render", () => renderVideo(timedPlan, runDir));
  console.log(
    `  bundle ${(result.bundleMs / 1000).toFixed(1)}s, render ${(result.renderMs / 1000).toFixed(1)}s`,
  );
  console.log(`→ ${result.videoPath}`);
}

async function cmdNarrate(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { voice: { type: "string" } },
    allowPositionals: true,
  });
  const planPath = requirePositional(positionals, "sceneplan.json");
  const scenePlan = ScenePlanSchema.parse(JSON.parse(readFileSync(planPath, "utf8")));
  const voice = values.voice ?? PlanOptionsSchema.parse({}).voice;
  const runDir = newRunDir();
  const { result } = await timed("narrate", () => narrate(scenePlan, runDir, voice));
  writeArtifact(runDir, "timedplan.json", result);
  console.log(`Narrated: ${describeTimedPlan(result)}`);
}

/** The full pipeline. `pnpm demo` is this on fixtures/sample-pitch.md. */
async function cmdRun(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      prompt: { type: "string" },
      duration: { type: "string" },
      language: { type: "string" },
      aspect: { type: "string" },
      voice: { type: "string" },
    },
    allowPositionals: true,
  });
  const options = planOptionsFrom(values);
  const runDir = newRunDir();
  const stageMs: Record<string, number> = {};
  const total = Date.now();

  const ingested = await timed("ingest", () =>
    ingest(
      values.prompt !== undefined
        ? { promptText: values.prompt }
        : { filePath: requirePositional(positionals, "file") },
    ),
  );
  stageMs.ingest = ingested.ms;
  writeArtifact(runDir, "source-document.json", ingested.result);

  const planned = await timed("plan", () => plan(ingested.result, options));
  stageMs.plan = planned.ms;
  writeArtifact(runDir, "sceneplan.json", planned.result);

  const narrated = await timed("narrate", () =>
    narrate(planned.result, runDir, options.voice),
  );
  stageMs.narrate = narrated.ms;
  writeArtifact(runDir, "timedplan.json", narrated.result);

  const rendered = await timed("render", () => renderVideo(narrated.result, runDir));
  stageMs.render = rendered.ms;

  const totalMs = Date.now() - total;
  console.log(`\n"${planned.result.title}" — ${describeTimedPlan(narrated.result)}`);
  console.log("Timings (speed is a core metric):");
  for (const [stage, ms] of Object.entries(stageMs)) {
    console.log(`  ${stage.padEnd(8)} ${(ms / 1000).toFixed(1)}s`);
  }
  console.log(`  ${"total".padEnd(8)} ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`\n→ ${rendered.result.videoPath}`);
  console.log(`→ ${rendered.result.thumbnailPath}`);
}

function requirePositional(positionals: string[], what: string): string {
  const value = positionals[0];
  if (!value) {
    console.error(`Missing <${what}> argument\n\n${USAGE}`);
    process.exit(1);
  }
  return value;
}

main().catch((err: unknown) => {
  if (err instanceof StageError) {
    console.error(`✗ ${err.message}`);
    if (err.cause) console.error("  cause:", err.cause);
  } else {
    console.error(err);
  }
  process.exit(1);
});
