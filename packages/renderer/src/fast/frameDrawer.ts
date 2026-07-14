import { createCanvas, Path2D, type Canvas } from "@napi-rs/canvas";
import type { TimedPlan } from "@felttip/engine";
import {
  drawSceneDirty,
  drawSceneFrame,
  sceneDirtyRects,
  type CanvasLike,
  type Path2DLike,
} from "../draw";
import { THEME } from "../theme";

export interface FrameDrawer {
  /**
   * Bring the canvas to `frame`'s pixels. Returns false when the frame is
   * pixel-identical to the previously rendered one (canvas untouched — reuse
   * the previous readback). Frames must be requested in ascending order for
   * the incremental path to engage; any gap falls back to a full redraw.
   */
  renderFrame(frame: number): boolean;
  /** Raw straight-alpha RGBA pixels of the canvas (live view — copy before reuse). */
  pixels(): Buffer;
  canvas: Canvas;
}

/**
 * Node-side equivalent of the <Whiteboard> composition: same Sequence frame
 * windows (Math.round, min 1 frame), same paper background, same draw.ts
 * scene math. Consecutive frames render incrementally: the camera only moves
 * every CAMERA_STEP_FRAMES, so in-between frames repaint just the dirty
 * rects around live animations (or nothing at all when the pen is idle).
 */
export function createFrameDrawer(plan: TimedPlan): FrameDrawer {
  const { width, height, fps } = plan;
  const msToFrames = (ms: number): number => Math.round((ms / 1000) * fps);
  const windows = plan.scenes.map((scene, i) => ({
    scene,
    isFirst: i === 0,
    from: msToFrames(scene.startMs),
    frames: Math.max(1, msToFrames(scene.durationMs)),
  }));
  const windowsAt = (frame: number) =>
    windows.filter((w) => frame >= w.from && frame < w.from + w.frames);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const pathCache = new Map<string, Path2DLike>();
  const pathFor = (d: string): Path2DLike => {
    let p = pathCache.get(d);
    if (!p) {
      p = new Path2D(d);
      pathCache.set(d, p);
    }
    return p;
  };
  const asCanvasLike = ctx as unknown as CanvasLike;

  let prevFrame: number | null = null;

  const fullRedraw = (frame: number, active: ReturnType<typeof windowsAt>): void => {
    ctx.fillStyle = THEME.paper;
    ctx.fillRect(0, 0, width, height);
    for (const w of active) {
      drawSceneFrame({
        ctx: asCanvasLike,
        scene: w.scene,
        frame: frame - w.from,
        fps,
        width,
        height,
        isFirst: w.isFirst,
        pathFor,
      });
    }
  };

  return {
    canvas,
    pixels: () => canvas.data(),
    renderFrame(frame: number): boolean {
      const active = windowsAt(frame);
      // Incremental only for the immediate next frame with the same single
      // scene on screen; anything else (chunk start, scene handoff, overlap)
      // takes the always-correct full path.
      const prev = prevFrame;
      prevFrame = frame;
      if (prev !== frame - 1 || active.length !== 1) {
        fullRedraw(frame, active);
        return true;
      }
      const w = active[0]!;
      if (prev < w.from) {
        fullRedraw(frame, active);
        return true;
      }
      const rects = sceneDirtyRects({
        scene: w.scene,
        frame: frame - w.from,
        prevFrame: prev - w.from,
        fps,
        width,
        height,
        isFirst: w.isFirst,
      });
      if (rects === null) {
        fullRedraw(frame, active);
        return true;
      }
      if (rects.length === 0) return false;
      drawSceneDirty({
        ctx: asCanvasLike,
        scene: w.scene,
        frame: frame - w.from,
        fps,
        width,
        height,
        paper: THEME.paper,
        pathFor,
        rects,
      });
      return true;
    },
  };
}
