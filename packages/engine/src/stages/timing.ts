import { resolveAsset } from "../assets/resolver.js";
import { warn } from "../errors.js";
import {
  ARROW_DOWN_PATHS,
  ARROW_RIGHT_PATHS,
  BOX_PATHS,
  EMPHASIS_CIRCLE_PATHS,
  EMPHASIS_UNDERLINE_PATHS,
  UNDERLINE_PATHS,
  clamp,
  drawDurationForPaths,
  drawDurationForText,
  measurePaths,
} from "../geometry.js";
import { ASPECT_DIMENSIONS, type Element, type Scene, type ScenePlan } from "../schemas.js";
import {
  FPS,
  type TimedElement,
  type TimedPlan,
  type TimedScene,
  type WordTiming,
} from "../timed.js";
import { countWords } from "./ingest.js";

/** Fallback cadence when no real audio timestamps exist (~130 wpm). */
const ESTIMATED_MS_PER_WORD = Math.round(60000 / 130);
/** Silence appended after the last narration word of each scene. */
const SCENE_TAIL_MS = 800;
const EMPHASIS_DELAY_MS = 200;

export interface SceneAudio {
  /** Relative to the run directory. */
  audioFile: string;
  durationMs: number;
  words: WordTiming[];
}

/**
 * ScenePlan (+ optional per-scene audio from the narrate stage) → TimedPlan.
 * Without audio, word timings are estimated at ~130 wpm — used for silent
 * previews and as the sanctioned fallback when TTS word boundaries fail.
 */
export function resolveTimedPlan(
  plan: ScenePlan,
  audio?: Map<string, SceneAudio>,
): TimedPlan {
  const { width, height } = ASPECT_DIMENSIONS[plan.aspectRatio];
  let cursor = 0;
  const scenes: TimedScene[] = plan.scenes.map((scene) => {
    const sceneAudio = audio?.get(scene.id);
    const words = sceneAudio?.words ?? estimateWords(scene.narration);
    const durationMs =
      sceneAudio?.durationMs !== undefined
        ? sceneAudio.durationMs + SCENE_TAIL_MS
        : (words.at(-1)?.startMs ?? 0) + ESTIMATED_MS_PER_WORD + SCENE_TAIL_MS;
    const timed: TimedScene = {
      id: scene.id,
      layout: scene.layout,
      narration: scene.narration,
      startMs: cursor,
      durationMs,
      ...(sceneAudio ? { audioFile: sceneAudio.audioFile } : {}),
      words,
      elements: scene.elements.map((el, i) =>
        resolveElement(el, i, scene, words, durationMs),
      ),
    };
    cursor += durationMs;
    return timed;
  });
  return {
    title: plan.title,
    language: plan.language,
    aspectRatio: plan.aspectRatio,
    width,
    height,
    fps: FPS,
    totalDurationMs: cursor,
    scenes,
  };
}

function estimateWords(narration: string): WordTiming[] {
  return narration
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => ({ word, startMs: i * ESTIMATED_MS_PER_WORD }));
}

function resolveElement(
  el: Element,
  index: number,
  scene: Scene,
  words: WordTiming[],
  sceneDurationMs: number,
): TimedElement {
  const { paths, fallbackLabel } = pathsForElement(el, scene);
  const pathLengths = measurePaths(paths);
  const drawDurationMs = paths.length
    ? drawDurationForPaths(pathLengths)
    : drawDurationForText(el.text ?? String(el.id));

  let revealAtMs: number;
  if (el.revealAtWord !== undefined && words.length) {
    const wordIndex = clamp(el.revealAtWord, 0, words.length - 1);
    revealAtMs = words[wordIndex]!.startMs;
  } else {
    // No explicit timing: spread elements evenly across the scene.
    revealAtMs = (index / Math.max(scene.elements.length, 1)) * (sceneDurationMs - 1200);
  }
  // The element must finish drawing inside its scene.
  revealAtMs = clamp(revealAtMs, 0, Math.max(0, sceneDurationMs - drawDurationMs - 200));

  const emphasisKind = el.emphasis && el.emphasis !== "none" ? el.emphasis : undefined;
  let emphasis: TimedElement["emphasis"];
  if (emphasisKind) {
    const emphasisPaths =
      emphasisKind === "circle" ? EMPHASIS_CIRCLE_PATHS : EMPHASIS_UNDERLINE_PATHS;
    const emphasisLengths = measurePaths(emphasisPaths);
    const emphasisDuration = drawDurationForPaths(emphasisLengths);
    const startMs = Math.min(
      revealAtMs + drawDurationMs + EMPHASIS_DELAY_MS,
      Math.max(0, sceneDurationMs - emphasisDuration),
    );
    emphasis = {
      kind: emphasisKind,
      paths: emphasisPaths,
      pathLengths: emphasisLengths,
      drawDurationMs: emphasisDuration,
      startMs,
    };
  }

  return {
    id: el.id,
    kind: el.kind,
    ...(el.text !== undefined ? { text: el.text } : {}),
    position: el.position,
    size: el.size,
    revealAtMs: Math.round(revealAtMs),
    drawDurationMs,
    paths,
    pathLengths,
    ...(fallbackLabel !== undefined ? { fallbackLabel } : {}),
    ...(emphasis ? { emphasis } : {}),
  };
}

function pathsForElement(
  el: Element,
  scene: Scene,
): { paths: string[]; fallbackLabel?: string } {
  switch (el.kind) {
    case "icon": {
      if (!el.assetTag) {
        warn("assets", `icon element ${el.id} has no assetTag — using box+label fallback`);
        return { paths: BOX_PATHS, fallbackLabel: el.text ?? "?" };
      }
      const asset = resolveAsset(el.assetTag);
      return asset.matched === "fallback"
        ? { paths: asset.paths, fallbackLabel: asset.label ?? el.assetTag }
        : { paths: asset.paths };
    }
    case "arrow":
      return { paths: scene.layout === "flow" ? ARROW_DOWN_PATHS : ARROW_RIGHT_PATHS };
    case "box":
      return { paths: BOX_PATHS };
    case "underline":
      return { paths: UNDERLINE_PATHS };
    case "text":
    case "number":
      return { paths: [] };
  }
}

export function describeTimedPlan(plan: TimedPlan): string {
  const s = plan.scenes.length;
  const e = plan.scenes.reduce((n, sc) => n + sc.elements.length, 0);
  const w = plan.scenes.reduce((n, sc) => n + countWords(sc.narration), 0);
  return `${s} scenes, ${e} elements, ${w} narration words, ${(plan.totalDurationMs / 1000).toFixed(1)}s`;
}
