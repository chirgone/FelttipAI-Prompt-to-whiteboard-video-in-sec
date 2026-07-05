import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  ingest,
  newRunDir,
  plan,
  PlanOptionsSchema,
  SourceDocumentSchema,
  StageError,
  timed,
  writeArtifact,
  type PlanOptions,
} from "@chalkline/engine";

const USAGE = `chalkline — whiteboard explainer video engine

Usage:
  chalkline ingest <file>                     file → source-document.json
  chalkline ingest --prompt "<text>"          prompt → source-document.json
  chalkline plan <source-document.json> [--duration 1|2|3|5] [--language en]
                 [--aspect 16:9|9:16|1:1] [--voice <name>]
  chalkline run <file|--prompt "<text>">      full pipeline (stages land in M5)

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
