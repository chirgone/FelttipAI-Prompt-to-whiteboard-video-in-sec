import { svgPathProperties } from "svg-path-properties";
import { StageError } from "./errors.js";

/**
 * Procedural stroke paths for non-icon element kinds and emphasis marks.
 * All in element-local 0 0 100 100 coordinates, slightly wobbly so they read
 * as hand-drawn rather than geometric.
 */

export const ARROW_RIGHT_PATHS = [
  "M 10 51 Q 40 48 82 50",
  "M 66 36 L 86 50 L 66 65",
];

export const ARROW_DOWN_PATHS = [
  "M 51 10 Q 48 40 50 82",
  "M 36 66 L 50 86 L 65 66",
];

// Wobble variants: repeated shapes pick one by element-id hash so two boxes
// in a scene never look like clones.
export const BOX_VARIANTS: string[][] = [
  ["M 12 18 L 89 15 L 91 84 L 10 86 Z"],
  ["M 14 13 L 91 17 L 88 88 L 9 84 Z"],
  ["M 10 16 Q 50 11 90 14 L 92 85 Q 50 90 11 87 Z"],
];

export const UNDERLINE_VARIANTS: string[][] = [
  ["M 6 55 Q 30 47 55 52 T 96 49"],
  ["M 5 50 Q 35 56 60 50 T 95 53"],
  ["M 7 52 Q 28 46 52 51 T 94 48", "M 14 60 Q 40 55 70 58"],
];

export const EMPHASIS_CIRCLE_VARIANTS: string[][] = [
  ["M 50 6 C 87 3 97 21 96 49 C 95 81 77 96 48 95 C 15 94 3 75 5 46 C 7 17 28 9 62 9"],
  ["M 38 8 C 74 2 98 16 96 46 C 94 79 74 97 44 95 C 12 93 2 72 6 44 C 10 16 34 6 66 12"],
  ["M 55 5 C 20 6 3 24 5 50 C 7 80 28 96 54 95 C 84 94 97 74 95 46 C 93 20 74 7 48 8 C 36 9 28 13 22 19"],
];

export const EMPHASIS_UNDERLINE_VARIANTS: string[][] = [
  ["M 4 96 Q 28 89 52 93 T 97 91"],
  ["M 5 92 Q 35 97 62 92 T 96 94"],
  ["M 4 94 Q 30 88 55 92 T 96 90", "M 10 100 Q 45 95 88 98"],
];

export const BOX_PATHS = BOX_VARIANTS[0]!;
export const UNDERLINE_PATHS = UNDERLINE_VARIANTS[0]!;
export const EMPHASIS_CIRCLE_PATHS = EMPHASIS_CIRCLE_VARIANTS[0]!;
export const EMPHASIS_UNDERLINE_PATHS = EMPHASIS_UNDERLINE_VARIANTS[0]!;

/** Deterministic tiny hash for variant selection. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickVariant<T>(variants: T[], key: string): T {
  return variants[hashString(key) % variants.length]!;
}

export interface ConnectorGeometry {
  paths: string[];
  /** viewBox is `0 0 <viewBoxWidth> 100`. */
  viewBoxWidth: number;
  /** Normalized center of the connector's bounding box. */
  center: { x: number; y: number };
  /** Bounding-box height as a fraction of canvas height. */
  size: number;
}

/**
 * A hand-drawn connector between two normalized points: gently bowed
 * quadratic (bow side chosen by id hash), plus an open arrowhead when
 * `arrow` is set. Returns element-local paths and box placement.
 */
export function connectorGeometry(
  from: { x: number; y: number },
  to: { x: number; y: number },
  canvas: { width: number; height: number },
  id: string,
  arrow: boolean,
): ConnectorGeometry {
  const p0 = { x: from.x * canvas.width, y: from.y * canvas.height };
  const p1 = { x: to.x * canvas.width, y: to.y * canvas.height };
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const pad = Math.max(24, len * 0.15);
  const minX = Math.min(p0.x, p1.x) - pad;
  const minY = Math.min(p0.y, p1.y) - pad;
  const boxW = Math.abs(p1.x - p0.x) + 2 * pad;
  const boxH = Math.abs(p1.y - p0.y) + 2 * pad;
  const s = 100 / boxH;
  const local = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: (p.x - minX) * s,
    y: (p.y - minY) * s,
  });
  const l0 = local(p0);
  const l1 = local(p1);
  // Bow perpendicular to the line, ~7% of length, side by hash.
  const side = hashString(id) % 2 === 0 ? 1 : -1;
  const nx = (-(l1.y - l0.y) / (len * s)) * len * s;
  const ny = ((l1.x - l0.x) / (len * s)) * len * s;
  const norm = Math.hypot(nx, ny) || 1;
  const bow = len * s * 0.07 * side;
  const mid = {
    x: (l0.x + l1.x) / 2 + (nx / norm) * bow,
    y: (l0.y + l1.y) / 2 + (ny / norm) * bow,
  };
  const paths = [
    `M ${r1(l0.x)} ${r1(l0.y)} Q ${r1(mid.x)} ${r1(mid.y)} ${r1(l1.x)} ${r1(l1.y)}`,
  ];
  if (arrow) {
    // Head aligned with the incoming curve direction (from mid control point).
    const dx = l1.x - mid.x;
    const dy = l1.y - mid.y;
    const d = Math.hypot(dx, dy) || 1;
    const headLen = clamp(len * s * 0.16, 9, 24);
    for (const angle of [Math.PI * 0.82, -Math.PI * 0.82]) {
      const hx = (dx / d) * Math.cos(angle) - (dy / d) * Math.sin(angle);
      const hy = (dx / d) * Math.sin(angle) + (dy / d) * Math.cos(angle);
      paths.push(
        `M ${r1(l1.x)} ${r1(l1.y)} L ${r1(l1.x + hx * headLen)} ${r1(l1.y + hy * headLen)}`,
      );
    }
  }
  return {
    paths,
    viewBoxWidth: Math.round((boxW / boxH) * 1000) / 10,
    center: {
      x: (minX + boxW / 2) / canvas.width,
      y: (minY + boxH / 2) / canvas.height,
    },
    size: boxH / canvas.height,
  };
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

export type StrokePoints = [number, number][];

/**
 * Pre-sample a path into an evenly spaced polyline. This is what ships in the
 * TimedPlan: the renderer replays point slices, so a partial stroke is an
 * exact prefix and completion means "all points drawn" — an incomplete final
 * stroke is structurally impossible.
 */
export function samplePath(d: string, step: number): StrokePoints {
  const props = new svgPathProperties(d);
  const length = props.getTotalLength();
  if (!Number.isFinite(length)) {
    throw new StageError(
      "assets",
      `path length is not finite (${length}) — likely a degenerate arc: ${d}`,
    );
  }
  const count = Math.max(2, Math.ceil(length / Math.max(step, 0.05)) + 1);
  const points: StrokePoints = [];
  for (let i = 0; i < count; i++) {
    const p = props.getPointAtLength((length * i) / (count - 1));
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new StageError("assets", `sampled point is not finite on: ${d}`);
    }
    points.push([r2(p.x), r2(p.y)]);
  }
  return points;
}

/**
 * Marker scribble fill: a serpentine polyline sweeping an inset box, drawn
 * thick and low-alpha as a shade wash. Wobble varies by id hash so repeated
 * washes never look stamped.
 */
export function washScribblePoints(
  boxWidth: number,
  boxHeight: number,
  insetFrac: number,
  id: string,
): StrokePoints {
  const h = hashString(id);
  const insetX = boxWidth * insetFrac;
  const insetY = boxHeight * insetFrac;
  const left = insetX;
  const right = boxWidth - insetX;
  const top = insetY;
  const bottom = boxHeight - insetY;
  const rows = Math.max(2, Math.round((bottom - top) / (boxHeight * 0.16)));
  const rowGap = (bottom - top) / rows;
  const points: StrokePoints = [];
  const xStep = Math.max(3, (right - left) / 24);
  for (let row = 0; row <= rows; row++) {
    const y = top + row * rowGap;
    const leftToRight = row % 2 === 0;
    const wobblePhase = ((h >> (row % 8)) % 7) / 7;
    for (let x = left; x <= right + 0.01; x += xStep) {
      const t = (x - left) / (right - left);
      const drift = Math.sin((t + wobblePhase) * Math.PI * 2) * rowGap * 0.18;
      // Tilt each pass slightly so the fill reads as hand scribble, not scanlines.
      const tilt = (leftToRight ? t : 1 - t) * rowGap * 0.35;
      const px = leftToRight ? x : right - (x - left);
      points.push([r2(px), r2(clamp(y + drift + tilt, 0, boxHeight))]);
    }
  }
  return points;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function measurePaths(paths: string[]): number[] {
  return paths.map((d) => {
    const length = new svgPathProperties(d).getTotalLength();
    if (!Number.isFinite(length)) {
      // Near-degenerate arcs (endpoints ≈ diameter apart) NaN out in
      // svg-path-properties; a NaN here silently poisons the whole timeline.
      throw new StageError(
        "assets",
        `path length is not finite (${length}) — likely a degenerate arc: ${d}`,
      );
    }
    return length;
  });
}

/** Draw time ∝ total path length, clamped 300–1800ms. */
export function drawDurationForPaths(pathLengths: number[]): number {
  const total = pathLengths.reduce((a, b) => a + b, 0);
  return clamp(Math.round(total * 3), 300, 1800);
}

/** Text has no measurable path; scale with glyph count instead. */
export function drawDurationForText(text: string): number {
  return clamp(text.length * 55, 300, 1200);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
