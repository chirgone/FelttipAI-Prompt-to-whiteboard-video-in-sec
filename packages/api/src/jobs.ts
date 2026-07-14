import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  ingest,
  narrate,
  newRunDir,
  plan,
  writeArtifact,
  type PlanOptions,
} from "@felttip/engine";
import { renderVideo } from "@felttip/renderer";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  /** Stage currently executing, when running. */
  stage?: string;
  /** Completed stages with wall-clock timings. */
  stages: { name: string; ms: number }[];
  runDir: string;
  videoPath?: string;
  thumbnailPath?: string;
  error?: string;
  createdAt: string;
}

export interface JobInput {
  promptText?: string;
  /** Uploaded file already persisted into the job's run directory. */
  filePath?: string;
  options: PlanOptions;
}

const jobs = new Map<string, Job>();
const queue: { job: Job; input: JobInput }[] = [];
let working = false;

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/**
 * One render at a time: enqueue and let the worker drain FIFO. The input
 * factory receives the job's run directory so uploads can be persisted into
 * it before the pipeline starts.
 */
export function submitJob(makeInput: (runDir: string) => JobInput): Job {
  const job: Job = {
    id: randomUUID(),
    status: "queued",
    stages: [],
    runDir: newRunDir(),
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  queue.push({ job, input: makeInput(job.runDir) });
  void drain();
  return job;
}

/** Persist an upload into the job's run dir so ingest can read it by path. */
export function persistUpload(runDir: string, filename: string, data: Buffer): string {
  const safe = path.basename(filename);
  const filePath = path.join(runDir, safe);
  writeFileSync(filePath, data);
  return filePath;
}

async function drain(): Promise<void> {
  if (working) return;
  working = true;
  try {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await runJob(next.job, next.input);
    }
  } finally {
    working = false;
  }
}

async function runJob(job: Job, input: JobInput): Promise<void> {
  job.status = "running";
  const stage = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    job.stage = name;
    const start = Date.now();
    const result = await fn();
    job.stages.push({ name, ms: Date.now() - start });
    return result;
  };
  try {
    const doc = await stage("ingest", () =>
      ingest(
        input.promptText !== undefined
          ? { promptText: input.promptText }
          : { filePath: input.filePath! },
      ),
    );
    writeArtifact(job.runDir, "source-document.json", doc);

    const scenePlan = await stage("plan", () => plan(doc, input.options));
    writeArtifact(job.runDir, "sceneplan.json", scenePlan);

    const timedPlan = await stage("narrate", () =>
      narrate(scenePlan, job.runDir, input.options.voice),
    );
    writeArtifact(job.runDir, "timedplan.json", timedPlan);

    const rendered = await stage("render", () => renderVideo(timedPlan, job.runDir));
    job.videoPath = rendered.videoPath;
    job.thumbnailPath = rendered.thumbnailPath;
    job.status = "done";
    delete job.stage;
  } catch (err) {
    job.status = "error";
    job.error = err instanceof Error ? err.message : String(err);
    delete job.stage;
    console.error(`job ${job.id} failed:`, err);
  }
}
