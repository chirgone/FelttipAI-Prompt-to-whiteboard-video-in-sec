import type { AspectRatio, Element, Scene } from "./schemas.js";
import type { StrokePoints } from "./geometry.js";

/**
 * TimedPlan is the contract between engine and renderer: everything the
 * renderer needs, fully resolved — no fs access, no LLM, no asset lookups on
 * the render side. Must stay JSON-serializable.
 *
 * v2 (M8, breaking): strokes are pre-sampled point polylines with baked-in
 * per-stroke timing and resolved hex colors. The renderer replays point
 * slices on a canvas — no SVG path measurement anywhere at render time.
 * v1 timedplan.json artifacts (paths/pathLengths) will not render.
 */

export interface WordTiming {
  word: string;
  /** Offset from the start of the scene's narration audio. */
  startMs: number;
}

export interface TimedStroke {
  /** Pre-sampled polyline in element-local coords (box is `0 0 <viewBoxWidth> 100`). */
  points: StrokePoints;
  /** Resolved hex color — palette names never reach the renderer. */
  color: string;
  /** Multiplier on the global screen-space stroke width. */
  widthFactor: number;
  /** Ink opacity; washes ride low alpha. */
  alpha: number;
  /** Washes draw in multiply blend so ink stays legible underneath. */
  mode: "ink" | "wash";
  /** Pen-down offset from element reveal (emphasis: from emphasis start). */
  startMs: number;
  durationMs: number;
}

export interface TimedFill {
  /** SVG path `d` strings in element-local coords, flooded with `color`. */
  paths: string[];
  /** Resolved hex — flat marker color under the ink outline. */
  color: string;
  /** Fade-in start, offset from element reveal (after the outline lands). */
  startMs: number;
  /** Fade-in length. */
  durationMs: number;
}

export interface TimedEmphasis {
  kind: "circle" | "underline";
  /** Stroke startMs offsets are relative to this emphasis's startMs. */
  strokes: TimedStroke[];
  drawDurationMs: number;
  /** Offset from scene start; element finish + 200ms. */
  startMs: number;
}

export interface TimedElement {
  id: string;
  kind: Element["kind"];
  text?: string;
  position: { x: number; y: number };
  size: number;
  /** Offset from scene start at which drawing begins. */
  revealAtMs: number;
  /** End of the last stroke (outline + wash), relative to reveal. */
  drawDurationMs: number;
  strokes: TimedStroke[];
  /** Width of the element-local coordinate box; height is always 100. */
  viewBoxWidth?: number;
  /** Set when the asset resolver fell back to box+label. */
  fallbackLabel?: string;
  /** Flat color fill under the outline (Simi look); icons only. */
  fill?: TimedFill;
  emphasis?: TimedEmphasis;
}

export interface TimedScene {
  id: string;
  layout: Scene["layout"];
  narration: string;
  /** Offset from the start of the video. */
  startMs: number;
  durationMs: number;
  /** Path relative to the run directory, e.g. "narration/s1.mp3". Absent = silent. */
  audioFile?: string;
  words: WordTiming[];
  elements: TimedElement[];
}

export interface TimedPlan {
  title: string;
  language: string;
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  fps: number;
  totalDurationMs: number;
  scenes: TimedScene[];
}

export const FPS = 30;
