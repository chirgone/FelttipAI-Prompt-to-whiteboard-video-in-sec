import { svgPathProperties } from "svg-path-properties";

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

export const BOX_PATHS = ["M 12 18 L 89 15 L 91 84 L 10 86 Z"];

export const UNDERLINE_PATHS = ["M 6 55 Q 30 47 55 52 T 96 49"];

export const EMPHASIS_CIRCLE_PATHS = [
  "M 50 6 C 87 3 97 21 96 49 C 95 81 77 96 48 95 C 15 94 3 75 5 46 C 7 17 28 9 62 9",
];

export const EMPHASIS_UNDERLINE_PATHS = ["M 4 96 Q 28 89 52 93 T 97 91"];

export function measurePaths(paths: string[]): number[] {
  return paths.map((d) => new svgPathProperties(d).getTotalLength());
}

/** Draw time ∝ total path length, clamped 300–1200ms. */
export function drawDurationForPaths(pathLengths: number[]): number {
  const total = pathLengths.reduce((a, b) => a + b, 0);
  return clamp(Math.round(total * 3), 300, 1200);
}

/** Text has no measurable path; scale with glyph count instead. */
export function drawDurationForText(text: string): number {
  return clamp(text.length * 55, 300, 1200);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
