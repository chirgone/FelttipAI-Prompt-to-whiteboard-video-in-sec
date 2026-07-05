import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { TimedPlan } from "@chalkline/engine";

export interface RenderResult {
  videoPath: string;
  thumbnailPath: string;
  bundleMs: number;
  renderMs: number;
}

/**
 * TimedPlan (+ narration audio already sitting in runDir) → out.mp4 +
 * thumbnail.png, 30fps h264. runDir doubles as Remotion's public dir so
 * <Audio src={staticFile(scene.audioFile)}> resolves the per-scene mp3s.
 */
export async function renderVideo(
  plan: TimedPlan,
  runDir: string,
): Promise<RenderResult> {
  mkdirSync(runDir, { recursive: true });
  const entryPoint = fileURLToPath(new URL("./entry.ts", import.meta.url));

  const bundleStart = Date.now();
  const serveUrl = await bundle({
    entryPoint,
    publicDir: runDir,
    onProgress: () => {},
  });
  const bundleMs = Date.now() - bundleStart;

  const inputProps = { plan };
  const composition = await selectComposition({
    serveUrl,
    id: "Chalkline",
    inputProps,
  });

  const videoPath = path.join(runDir, "out.mp4");
  const thumbnailPath = path.join(runDir, "thumbnail.png");
  const renderStart = Date.now();
  let lastLoggedPercent = -10;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: videoPath,
    inputProps,
    onProgress: ({ progress }) => {
      const percent = Math.floor(progress * 100);
      if (percent >= lastLoggedPercent + 10) {
        lastLoggedPercent = percent;
        process.stdout.write(`\r  rendering ${percent}%   `);
      }
    },
  });
  process.stdout.write("\r");
  await renderStill({
    composition,
    serveUrl,
    output: thumbnailPath,
    frame: Math.floor(composition.durationInFrames * 0.1),
    inputProps,
  });
  const renderMs = Date.now() - renderStart;

  return { videoPath, thumbnailPath, bundleMs, renderMs };
}
