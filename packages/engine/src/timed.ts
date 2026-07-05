import type { AspectRatio, Element, Scene } from "./schemas.js";

/**
 * TimedPlan is the contract between engine and renderer: everything the
 * renderer needs, fully resolved — no fs access, no LLM, no asset lookups on
 * the render side. Must stay JSON-serializable.
 */

export interface WordTiming {
  word: string;
  /** Offset from the start of the scene's narration audio. */
  startMs: number;
}

export interface TimedEmphasis {
  kind: "circle" | "underline";
  /** Element-local 0-100 coordinates, like all path data here. */
  paths: string[];
  pathLengths: number[];
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
  drawDurationMs: number;
  /** Stroke paths in a `0 0 <viewBoxWidth> 100` box (all kinds draw). */
  paths: string[];
  pathLengths: number[];
  /** Width of the element-local coordinate box; height is always 100. */
  viewBoxWidth?: number;
  /** Set when the asset resolver fell back to box+label. */
  fallbackLabel?: string;
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
