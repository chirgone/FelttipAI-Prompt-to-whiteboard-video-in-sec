export type StageName =
  | "ingest"
  | "plan"
  | "assets"
  | "narrate"
  | "animate"
  | "render";

/** Fail loudly with stage name + cause — never swallow. */
export class StageError extends Error {
  constructor(
    public readonly stage: StageName,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`[${stage}] ${message}`, options);
    this.name = "StageError";
  }
}

export function warn(stage: StageName, message: string): void {
  console.warn(`⚠ [${stage}] ${message}`);
}
