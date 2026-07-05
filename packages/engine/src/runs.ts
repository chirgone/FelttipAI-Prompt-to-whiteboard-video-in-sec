import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Create runs/<timestamp>/ under the current working directory. */
export function newRunDir(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_");
  const dir = path.resolve("runs", ts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeArtifact(
  runDir: string,
  name: string,
  data: unknown,
): string {
  const file = path.join(runDir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  const body =
    typeof data === "string" || data instanceof Uint8Array
      ? data
      : JSON.stringify(data, null, 2);
  writeFileSync(file, body);
  console.log(`  ↳ wrote ${path.relative(process.cwd(), file)}`);
  return file;
}

/** Measure a stage; speed is a core metric — always print it. */
export async function timed<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  console.log(`✓ ${label} — ${(ms / 1000).toFixed(1)}s`);
  return { result, ms };
}
