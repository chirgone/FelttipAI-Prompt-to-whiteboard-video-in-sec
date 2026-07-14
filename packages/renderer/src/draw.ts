import { Easing, interpolate } from "remotion";
import type { TimedElement, TimedScene, TimedStroke } from "@felttip/engine";
import { THEME } from "./theme";

export const WIPE_MS = 300;

/**
 * The settle-zoom/pan camera advances in steps of this many frames instead of
 * every frame (≤0.7px jumps at 30fps — imperceptible). Frames sharing a
 * camera step differ only where ink is actively landing, which is what lets
 * the fast renderer redraw just those regions (or nothing at all).
 */
export const CAMERA_STEP_FRAMES = 3;

export const quantizeCameraFrame = (frame: number): number =>
  Math.floor(frame / CAMERA_STEP_FRAMES) * CAMERA_STEP_FRAMES;

/**
 * Structural subset of CanvasRenderingContext2D used by the drawing code, so
 * the same functions drive both the browser canvas (Remotion preview) and
 * @napi-rs/canvas (fast Node renderer) without importing either.
 */
export interface CanvasLike {
  globalAlpha: number;
  globalCompositeOperation: string;
  strokeStyle: string | object;
  fillStyle: string | object;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  stroke(): void;
  fill(path?: Path2DLike): void;
}

/** Opaque Path2D — constructed by the environment-specific `pathFor`. */
export type Path2DLike = object;

/** Deterministic tiny hash — local copy so the renderer imports no engine runtime. */
const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** Pen acceleration/deceleration within each stroke's window. */
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Element-local → screen mapping. Emphasis boxes stretch non-uniformly. */
interface LocalBox {
  left: number;
  top: number;
  sx: number;
  sy: number;
}

const elementBox = (
  el: TimedElement,
  width: number,
  height: number,
): LocalBox => {
  const boxH = el.size * height;
  const boxW = boxH * ((el.viewBoxWidth ?? 100) / 100);
  return {
    left: el.position.x * width - boxW / 2,
    top: el.position.y * height - boxH / 2,
    sx: boxH / 100,
    sy: boxH / 100,
  };
};

/** Emphasis marks wrap the element at 1.45× and stretch to its aspect. */
const emphasisBox = (
  el: TimedElement,
  width: number,
  height: number,
): LocalBox => {
  const boxH = el.size * height;
  const boxW = boxH * ((el.viewBoxWidth ?? 100) / 100);
  return {
    left: el.position.x * width - (boxW * 1.45) / 2,
    top: el.position.y * height - (boxH * 1.45) / 2,
    sx: (boxW * 1.45) / 100,
    sy: (boxH * 1.45) / 100,
  };
};

/**
 * Replay one stroke up to `tMs` after its element's reveal: completed strokes
 * draw every point, the active stroke draws an exact point-prefix plus one
 * interpolated tip — an incomplete final state is structurally impossible.
 */
function drawStroke(
  ctx: CanvasLike,
  stroke: TimedStroke,
  tMs: number,
  box: LocalBox,
  baseWidthPx: number,
  jitterKey: string,
): void {
  const t = tMs - stroke.startMs;
  if (t <= 0 || stroke.points.length === 0) return;
  const progress = Math.min(1, t / Math.max(stroke.durationMs, 1));
  const eased = progress >= 1 ? 1 : easeInOutCubic(progress);
  const pts = stroke.points;
  const idxF = eased * (pts.length - 1);
  const whole = Math.floor(idxF);
  const frac = idxF - whole;

  const X = (p: [number, number]): number => box.left + p[0] * box.sx;
  const Y = (p: [number, number]): number => box.top + p[1] * box.sy;

  // ±8% width jitter per stroke so repeated marks read as hand pressure.
  const jitter = 1 + ((hashString(jitterKey) % 100) / 100 - 0.5) * 0.16;

  ctx.save();
  ctx.globalAlpha = stroke.alpha;
  if (stroke.mode === "wash") ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = baseWidthPx * stroke.widthFactor * jitter;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const first = pts[0]!;
  let minX = X(first);
  let maxX = minX;
  let minY = Y(first);
  let maxY = minY;
  ctx.beginPath();
  ctx.moveTo(X(first), Y(first));
  for (let i = 1; i <= whole; i++) {
    const p = pts[i]!;
    const px = X(p);
    const py = Y(p);
    ctx.lineTo(px, py);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  if (whole < pts.length - 1 && frac > 0) {
    const a = pts[whole]!;
    const b = pts[whole + 1]!;
    const px = X(a) + (X(b) - X(a)) * frac;
    const py = Y(a) + (Y(b) - Y(a)) * frac;
    ctx.lineTo(px, py);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  // A zero-length path with round caps draws nothing on canvas (unlike SVG):
  // degenerate strokes become a pen dot.
  if (maxX - minX < 0.5 && maxY - minY < 0.5) {
    ctx.arc(X(first), Y(first), ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.stroke();
  }
  ctx.restore();
}

const FILL_ALPHA = 0.9;

function drawElement(
  ctx: CanvasLike,
  el: TimedElement,
  sceneMs: number,
  width: number,
  height: number,
  baseWidthPx: number,
  pathFor: (d: string) => Path2DLike,
): void {
  if (sceneMs < el.revealAtMs) return;
  const box = elementBox(el, width, height);
  const tMs = sceneMs - el.revealAtMs;
  // Flat color fill fades in under the ink outline once the outline lands.
  if (el.fill && tMs >= el.fill.startMs) {
    const fadeIn = Math.min(1, (tMs - el.fill.startMs) / Math.max(el.fill.durationMs, 1));
    ctx.save();
    ctx.globalAlpha = FILL_ALPHA * fadeIn;
    ctx.fillStyle = el.fill.color;
    ctx.translate(box.left, box.top);
    ctx.scale(box.sx, box.sy);
    for (const d of el.fill.paths) ctx.fill(pathFor(d));
    ctx.restore();
  }
  el.strokes.forEach((stroke, i) =>
    drawStroke(ctx, stroke, tMs, box, baseWidthPx, `${el.id}:${i}`),
  );
  if (el.emphasis && sceneMs >= el.emphasis.startMs) {
    const box2 = emphasisBox(el, width, height);
    el.emphasis.strokes.forEach((stroke, i) =>
      drawStroke(
        ctx,
        stroke,
        sceneMs - el.emphasis!.startMs,
        box2,
        baseWidthPx,
        `${el.id}:em:${i}`,
      ),
    );
  }
}

interface Camera {
  camX: number;
  camY: number;
  zoom: number;
}

/**
 * Drift toward each element as it reveals (5% parallax) plus a slow
 * settle-zoom over the whole scene. Evaluated on the QUANTIZED frame so the
 * camera holds still between steps (see CAMERA_STEP_FRAMES).
 */
function computeCamera(
  scene: TimedScene,
  frame: number,
  fps: number,
  width: number,
  height: number,
): Camera {
  const camFrame = quantizeCameraFrame(frame);
  const msToFrames = (ms: number): number => (ms / 1000) * fps;
  const reveals = scene.elements
    .map((el) => ({
      at: msToFrames(el.revealAtMs),
      x: -(el.position.x - 0.5) * width * 0.05,
      y: -(el.position.y - 0.5) * height * 0.05,
    }))
    .sort((a, b) => a.at - b.at);
  // interpolate() needs strictly increasing input frames.
  for (let i = 1; i < reveals.length; i++) {
    if (reveals[i]!.at <= reveals[i - 1]!.at) reveals[i]!.at = reveals[i - 1]!.at + 1;
  }
  const panEasing = {
    easing: Easing.inOut(Easing.ease),
    extrapolateLeft: "clamp" as const,
    extrapolateRight: "clamp" as const,
  };
  const camX =
    reveals.length > 1
      ? interpolate(camFrame, reveals.map((r) => r.at), reveals.map((r) => r.x), panEasing)
      : (reveals[0]?.x ?? 0);
  const camY =
    reveals.length > 1
      ? interpolate(camFrame, reveals.map((r) => r.at), reveals.map((r) => r.y), panEasing)
      : (reveals[0]?.y ?? 0);
  const zoom = interpolate(
    camFrame,
    [0, msToFrames(scene.durationMs)],
    [1.0, 1.035],
    panEasing,
  );
  return { camX, camY, zoom };
}

const applyCamera = (ctx: CanvasLike, cam: Camera, width: number, height: number): void => {
  ctx.translate(width / 2, height / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-width / 2 + cam.camX, -height / 2 + cam.camY);
};

/**
 * One scene at one frame: wipe clip, camera drift/zoom, then every visible
 * stroke's point-slice. `frame` is scene-local (0 = scene start). Does NOT
 * clear or paint the paper background — callers own the canvas.
 */
export function drawSceneFrame(opts: {
  ctx: CanvasLike;
  scene: TimedScene;
  frame: number;
  fps: number;
  width: number;
  height: number;
  isFirst: boolean;
  pathFor: (d: string) => Path2DLike;
}): void {
  const { ctx, scene, frame, fps, width, height, isFirst, pathFor } = opts;
  const sceneMs = (frame / fps) * 1000;

  const wipeProgress = isFirst
    ? 1
    : interpolate(frame, [0, (WIPE_MS / 1000) * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  ctx.save();
  if (wipeProgress < 1) {
    ctx.beginPath();
    ctx.rect(0, 0, width * wipeProgress, height);
    ctx.clip();
  }
  applyCamera(ctx, computeCamera(scene, frame, fps, width, height), width, height);
  const baseWidthPx = height * THEME.strokeWidthFactor;
  for (const el of scene.elements) {
    drawElement(ctx, el, sceneMs, width, height, baseWidthPx, pathFor);
  }
  ctx.restore();
}

// --- Incremental rendering (fast renderer only) -------------------------
//
// Between camera steps the frame changes only where an animation is live, so
// consecutive frames can be produced by re-running the normal replay inside a
// clip around the changed regions — pixel-identical to a full redraw by
// construction (same draw order, same alphas), at a fraction of the raster
// cost. The browser preview keeps full-frame replay.

/** Scene-space (pre-camera) dirty rectangle. */
export interface SceneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far drawStroke has advanced at tMs, as a fractional point index. */
const strokeExtentIdx = (stroke: TimedStroke, tMs: number): number => {
  const t = tMs - stroke.startMs;
  if (t <= 0 || stroke.points.length === 0) return 0;
  const progress = Math.min(1, t / Math.max(stroke.durationMs, 1));
  const eased = progress >= 1 ? 1 : easeInOutCubic(progress);
  return eased * (stroke.points.length - 1);
};

const fillAlphaAt = (el: TimedElement, tMs: number): number => {
  if (!el.fill || tMs < el.fill.startMs) return 0;
  return Math.min(1, (tMs - el.fill.startMs) / Math.max(el.fill.durationMs, 1));
};

/** Bbox of the points a stroke rasterized between two extents, padded for width+AA. */
function strokeDirtyRect(
  stroke: TimedStroke,
  fromIdxF: number,
  toIdxF: number,
  box: LocalBox,
  baseWidthPx: number,
): SceneRect {
  const pts = stroke.points;
  const lo = Math.max(0, Math.floor(fromIdxF));
  const hi = Math.min(pts.length - 1, Math.ceil(toIdxF));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = lo; i <= hi; i++) {
    const p = pts[i]!;
    const x = box.left + p[0] * box.sx;
    const y = box.top + p[1] * box.sy;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // 1.08 = max width jitter; +2px anti-aliasing skirt.
  const pad = (baseWidthPx * stroke.widthFactor * 1.08) / 2 + 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
}

/**
 * What changed between two consecutive frames of one scene, as scene-space
 * rects. Returns null when only a full redraw is correct: during/just after
 * the wipe, or when the quantized camera moved. An empty array means the
 * frame is pixel-identical to the previous one.
 */
export function sceneDirtyRects(opts: {
  scene: TimedScene;
  frame: number;
  prevFrame: number;
  fps: number;
  width: number;
  height: number;
  isFirst: boolean;
}): SceneRect[] | null {
  const { scene, frame, prevFrame, fps, width, height, isFirst } = opts;
  const wipeFrames = Math.ceil((WIPE_MS / 1000) * fps);
  if (!isFirst && frame <= wipeFrames + 1) return null;
  if (quantizeCameraFrame(frame) !== quantizeCameraFrame(prevFrame)) return null;

  const t = (frame / fps) * 1000;
  const tp = (prevFrame / fps) * 1000;
  const baseWidthPx = height * THEME.strokeWidthFactor;
  const rects: SceneRect[] = [];

  for (const el of scene.elements) {
    const box = elementBox(el, width, height);
    const et = t - el.revealAtMs;
    const etp = tp - el.revealAtMs;
    for (const stroke of el.strokes) {
      const a = strokeExtentIdx(stroke, etp);
      const b = strokeExtentIdx(stroke, et);
      if (b !== a) rects.push(strokeDirtyRect(stroke, a, b, box, baseWidthPx));
    }
    if (el.fill && fillAlphaAt(el, et) !== fillAlphaAt(el, etp)) {
      const boxW = box.sx * (el.viewBoxWidth ?? 100);
      const boxH = box.sy * 100;
      rects.push({ x: box.left - 4, y: box.top - 4, w: boxW + 8, h: boxH + 8 });
    }
    if (el.emphasis) {
      const box2 = emphasisBox(el, width, height);
      const emt = t - el.emphasis.startMs;
      const emtp = tp - el.emphasis.startMs;
      for (const stroke of el.emphasis.strokes) {
        const a = strokeExtentIdx(stroke, emtp);
        const b = strokeExtentIdx(stroke, emt);
        if (b !== a) rects.push(strokeDirtyRect(stroke, a, b, box2, baseWidthPx));
      }
    }
  }
  return rects;
}

const rectsIntersect = (a: SceneRect, b: SceneRect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Everything an element can ever ink, from its actual stroke points —
 * connectors reach far outside the nominal element box, so the box alone is
 * not a safe cull bound. Cached per element (points never change).
 */
const footprintCache = new WeakMap<TimedElement, { w: number; h: number; rect: SceneRect }>();

function elementFootprint(el: TimedElement, width: number, height: number): SceneRect {
  const cached = footprintCache.get(el);
  if (cached && cached.w === width && cached.h === height) return cached.rect;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const grow = (box: LocalBox, strokes: TimedStroke[]): void => {
    for (const s of strokes) {
      for (const p of s.points) {
        const x = box.left + p[0] * box.sx;
        const y = box.top + p[1] * box.sy;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  };
  const box = elementBox(el, width, height);
  grow(box, el.strokes);
  if (el.emphasis) grow(emphasisBox(el, width, height), el.emphasis.strokes);
  if (el.fill) {
    // Fill paths live in the element box.
    minX = Math.min(minX, box.left);
    maxX = Math.max(maxX, box.left + box.sx * (el.viewBoxWidth ?? 100));
    minY = Math.min(minY, box.top);
    maxY = Math.max(maxY, box.top + box.sy * 100);
  }
  const pad = height * THEME.strokeWidthFactor * 1.5 + 4;
  const rect: SceneRect = {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + 2 * pad,
    h: maxY - minY + 2 * pad,
  };
  footprintCache.set(el, { w: width, h: height, rect });
  return rect;
}

/**
 * Redraw only `rects` (scene space): clip to them in screen space, restore
 * the paper, and re-run the ordinary replay for every element that touches
 * them. Assumes the canvas already holds the previous frame drawn with the
 * SAME quantized camera and no active wipe.
 */
export function drawSceneDirty(opts: {
  ctx: CanvasLike;
  scene: TimedScene;
  frame: number;
  fps: number;
  width: number;
  height: number;
  paper: string;
  pathFor: (d: string) => Path2DLike;
  rects: SceneRect[];
}): void {
  const { ctx, scene, frame, fps, width, height, paper, pathFor, rects } = opts;
  if (rects.length === 0) return;
  const sceneMs = (frame / fps) * 1000;
  const cam = computeCamera(scene, frame, fps, width, height);
  const sx = (x: number): number => (x - width / 2 + cam.camX) * cam.zoom + width / 2;
  const sy = (y: number): number => (y - height / 2 + cam.camY) * cam.zoom + height / 2;

  // Whole-pixel clip/clear rects: a fractional clip edge is antialiased,
  // which blends old and new pixels and lets tiny errors accumulate across
  // frames. Integer edges make the clip binary — inside is repainted
  // exactly, outside is untouched.
  const snapped = rects.map((r) => {
    const x0 = Math.floor(sx(r.x)) - 1;
    const y0 = Math.floor(sy(r.y)) - 1;
    const x1 = Math.ceil(sx(r.x + r.w)) + 1;
    const y1 = Math.ceil(sy(r.y + r.h)) + 1;
    return { x0, y0, w: x1 - x0, h: y1 - y0 };
  });
  ctx.save();
  ctx.beginPath();
  for (const r of snapped) ctx.rect(r.x0, r.y0, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = paper;
  for (const r of snapped) ctx.fillRect(r.x0, r.y0, r.w, r.h);
  applyCamera(ctx, cam, width, height);
  const baseWidthPx = height * THEME.strokeWidthFactor;
  for (const el of scene.elements) {
    const footprint = elementFootprint(el, width, height);
    if (!rects.some((r) => rectsIntersect(r, footprint))) continue;
    drawElement(ctx, el, sceneMs, width, height, baseWidthPx, pathFor);
  }
  ctx.restore();
}
