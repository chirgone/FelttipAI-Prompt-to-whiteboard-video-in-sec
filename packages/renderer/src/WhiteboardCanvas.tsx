import React, { useEffect, useRef } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { TimedElement, TimedScene, TimedStroke } from "@chalkline/engine";
import { THEME } from "./theme";

const WIPE_MS = 300;

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
  ctx: CanvasRenderingContext2D,
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

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: TimedElement,
  sceneMs: number,
  width: number,
  height: number,
  baseWidthPx: number,
): void {
  if (sceneMs < el.revealAtMs) return;
  const box = elementBox(el, width, height);
  el.strokes.forEach((stroke, i) =>
    drawStroke(ctx, stroke, sceneMs - el.revealAtMs, box, baseWidthPx, `${el.id}:${i}`),
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

/**
 * One scene on a single full-frame canvas: per frame it replays every visible
 * stroke's point-slice, with the wipe and camera drift applied as canvas
 * clip/transforms (same math the SVG SceneView used).
 */
export const WhiteboardCanvas: React.FC<{ scene: TimedScene; isFirst: boolean }> = ({
  scene,
  isFirst,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const msToFrames = (ms: number): number => (ms / 1000) * fps;
  const sceneMs = (frame / fps) * 1000;

  const wipeProgress = isFirst
    ? 1
    : interpolate(frame, [0, msToFrames(WIPE_MS)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });

  // Camera: drift toward each element as it reveals (5% parallax), plus a
  // slow settle-zoom over the whole scene.
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
      ? interpolate(frame, reveals.map((r) => r.at), reveals.map((r) => r.x), panEasing)
      : (reveals[0]?.x ?? 0);
  const camY =
    reveals.length > 1
      ? interpolate(frame, reveals.map((r) => r.at), reveals.map((r) => r.y), panEasing)
      : (reveals[0]?.y ?? 0);
  const zoom = interpolate(frame, [0, msToFrames(scene.durationMs)], [1.0, 1.035], panEasing);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    if (wipeProgress < 1) {
      ctx.beginPath();
      ctx.rect(0, 0, width * wipeProgress, height);
      ctx.clip();
    }
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2 + camX, -height / 2 + camY);
    const baseWidthPx = height * THEME.strokeWidthFactor;
    for (const el of scene.elements) {
      drawElement(ctx, el, sceneMs, width, height, baseWidthPx);
    }
    ctx.restore();
  }, [frame, scene, sceneMs, width, height, wipeProgress, camX, camY, zoom]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
};
