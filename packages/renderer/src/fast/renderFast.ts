import { execFile } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";
import type { TimedPlan, TimedScene } from "@felttip/engine";
import type { RenderResult } from "../render";
import { detectEncoder } from "./encoder";
import { ffmpegPath } from "./ffmpegPath";
import { createFrameDrawer } from "./frameDrawer";
import type { WorkerInput, WorkerMessage } from "./renderWorker";

const execFileAsync = promisify(execFile);

/**
 * Fast renderer: no browser. Frames are drawn with @napi-rs/canvas (Skia)
 * using the exact draw.ts math the Remotion composition uses, in parallel
 * worker threads — each renders a contiguous frame range into its own
 * video-only h264 segment via Remotion's bundled ffmpeg. A final ffmpeg pass
 * concatenates the segments (stream copy) and mixes the narration mp3s.
 * Replaces ~11 min of headless-Chrome screenshotting with ~1-2 min of direct
 * rasterization on the same hardware.
 */
export async function renderVideoFast(
  plan: TimedPlan,
  runDir: string,
): Promise<RenderResult> {
  mkdirSync(runDir, { recursive: true });
  const totalFrames = Math.max(1, Math.ceil((plan.totalDurationMs / 1000) * plan.fps));
  const videoPath = path.join(runDir, "out.mp4");
  const thumbnailPath = path.join(runDir, "thumbnail.png");
  const segDir = path.join(runDir, ".segments");
  mkdirSync(segDir, { recursive: true });

  const renderStart = Date.now();
  try {
    const segments = await renderSegments(plan, totalFrames, segDir);
    await concatAndMux(plan, runDir, segments, totalFrames, videoPath);
  } finally {
    rmSync(segDir, { recursive: true, force: true });
  }

  const drawer = createFrameDrawer(plan);
  drawer.renderFrame(Math.floor(totalFrames * 0.1));
  writeFileSync(thumbnailPath, await drawer.canvas.encode("png"));

  return { videoPath, thumbnailPath, bundleMs: 0, renderMs: Date.now() - renderStart };
}

/** Fan frames out to worker threads, one contiguous range + segment each. */
async function renderSegments(
  plan: TimedPlan,
  totalFrames: number,
  segDir: string,
): Promise<string[]> {
  const workerCount = Math.max(1, Math.min(os.availableParallelism() - 1, 8, totalFrames));
  const perWorker = Math.ceil(totalFrames / workerCount);
  const workerUrl = new URL("./renderWorker.ts", import.meta.url);
  const encoder = await detectEncoder(ffmpegPath());
  console.log(`  encoder: ${encoder === "vaapi" ? "h264_vaapi (GPU)" : "libx264"}`);

  let framesDone = 0;
  let lastLoggedPercent = -10;
  const jobs: Promise<void>[] = [];
  const segments: string[] = [];
  for (let i = 0; i * perWorker < totalFrames; i++) {
    const segPath = path.join(segDir, `seg_${String(i).padStart(3, "0")}.mp4`);
    segments.push(segPath);
    const input: WorkerInput = {
      plan,
      from: i * perWorker,
      to: Math.min((i + 1) * perWorker, totalFrames),
      segPath,
      encoder,
    };
    jobs.push(
      new Promise<void>((resolve, reject) => {
        const worker = new Worker(workerUrl, { workerData: input });
        worker.on("message", (msg: WorkerMessage) => {
          if (msg.type !== "frame") return;
          framesDone++;
          const percent = Math.floor((framesDone / totalFrames) * 100);
          if (percent >= lastLoggedPercent + 10) {
            lastLoggedPercent = percent;
            process.stdout.write(`\r  rendering ${percent}%   `);
          }
        });
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`render: worker for ${path.basename(segPath)} exited with code ${code}`));
        });
      }),
    );
  }
  await Promise.all(jobs);
  process.stdout.write("\r");
  return segments;
}

/**
 * Final ffmpeg pass: concat the segments without re-encoding, and mix every
 * scene's narration mp3 delayed to its scene start and trimmed to its scene
 * window (the Remotion <Sequence> unmount behavior).
 */
async function concatAndMux(
  plan: TimedPlan,
  runDir: string,
  segments: string[],
  totalFrames: number,
  videoPath: string,
): Promise<void> {
  const listPath = path.join(path.dirname(segments[0]!), "segments.txt");
  writeFileSync(listPath, segments.map((s) => `file '${s}'`).join("\n") + "\n");

  const audioScenes = plan.scenes.filter(
    (s): s is TimedScene & { audioFile: string } => s.audioFile !== undefined,
  );
  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    ...audioScenes.flatMap((s) => ["-i", path.join(runDir, s.audioFile)]),
  ];
  if (audioScenes.length > 0) {
    const chains = audioScenes.map((s, i) => {
      return `[${i + 1}:a]atrim=0:${s.durationMs / 1000},adelay=${Math.round(s.startMs)}:all=1[a${i}]`;
    });
    const labels = audioScenes.map((_, i) => `[a${i}]`).join("");
    const mix =
      audioScenes.length > 1
        ? `${labels}amix=inputs=${audioScenes.length}:normalize=0,apad[aout]`
        : `${labels}apad[aout]`;
    args.push("-filter_complex", `${chains.join(";")};${mix}`);
    args.push("-map", "0:v", "-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
  } else {
    args.push("-map", "0:v");
  }
  args.push(
    "-c:v", "copy",
    "-movflags", "+faststart",
    "-t", String(totalFrames / plan.fps),
    "-y", videoPath,
  );

  try {
    await execFileAsync(ffmpegPath(), args);
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    throw new Error(`render: final concat/mux ffmpeg failed\n${stderr}`, { cause: err });
  }
}
