import { spawn } from "node:child_process";
import { once } from "node:events";
import { parentPort, workerData } from "node:worker_threads";
import type { TimedPlan } from "@chalkline/engine";
import { RawAviStream } from "./aviStream";
import { encoderArgs, type EncoderKind } from "./encoder";
import { ffmpegPath } from "./ffmpegPath";
import { createFrameDrawer } from "./frameDrawer";

export interface WorkerInput {
  plan: TimedPlan;
  /** Absolute frame range [from, to) this worker renders. */
  from: number;
  to: number;
  /** Video-only mp4 segment this worker produces. */
  segPath: string;
  /** Chosen by the parent once (VAAPI probe) — all segments must match. */
  encoder: EncoderKind;
}

/** Message posted to the parent after every encoded frame (progress). */
export type WorkerMessage = { type: "frame" };

/**
 * One segment: draw frames [from, to) with the shared frame drawer and pipe
 * them as a raw-RGBA AVI stream into a dedicated ffmpeg producing a
 * video-only h264 segment. Segments are later concatenated with -c copy, so
 * every worker MUST use identical codec parameters.
 */
async function run(): Promise<void> {
  const { plan, from, to, segPath, encoder } = workerData as WorkerInput;
  const drawer = createFrameDrawer(plan);
  const avi = new RawAviStream(plan.width, plan.height, plan.fps, to - from);
  const enc = encoderArgs(encoder);

  const proc = spawn(
    ffmpegPath(),
    [
      "-hide_banner",
      "-loglevel", "error",
      ...enc.pre,
      "-f", "avi",
      "-i", "pipe:0",
      ...enc.post,
      "-y", segPath,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });
  const exited = new Promise<number>((resolve) => {
    proc.on("close", (code) => resolve(code ?? -1));
  });
  // ffmpeg dying mid-stream surfaces as a non-zero exit below, not an EPIPE crash.
  proc.stdin.on("error", () => {});

  proc.stdin.write(avi.header());
  let lastChunk: Buffer | null = null;
  for (let frame = from; frame < to; frame++) {
    // Unchanged frames skip rasterization AND readback: resend the previous
    // chunk's bytes (x264 turns identical frames into skip blocks).
    if (drawer.renderFrame(frame) || lastChunk === null) {
      lastChunk = avi.frame(drawer.pixels());
    }
    if (!proc.stdin.write(lastChunk)) {
      await Promise.race([once(proc.stdin, "drain").catch(() => {}), exited]);
      if (!proc.stdin.writable) break;
    }
    parentPort!.postMessage({ type: "frame" } satisfies WorkerMessage);
  }
  proc.stdin.end();
  const code = await exited;
  if (code !== 0) {
    throw new Error(
      `render: segment ffmpeg (frames ${from}-${to}) exited with code ${code}\n${stderr}`,
    );
  }
}

void run().then(
  () => process.exit(0),
  (err: unknown) => {
    // Rethrow async so the parent's "error" handler sees the real cause.
    setImmediate(() => {
      throw err;
    });
  },
);
