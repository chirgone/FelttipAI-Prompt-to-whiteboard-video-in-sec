import { resolveAsset } from "../assets/resolver.js";
import { StageError, warn } from "../errors.js";
import {
  ARROW_DOWN_PATHS,
  ARROW_RIGHT_PATHS,
  BOX_VARIANTS,
  EMPHASIS_CIRCLE_VARIANTS,
  EMPHASIS_UNDERLINE_VARIANTS,
  UNDERLINE_VARIANTS,
  clamp,
  connectorGeometry,
  drawDurationForPaths,
  measurePaths,
  pickVariant,
  samplePath,
  washScribblePoints,
} from "../geometry.js";
import {
  INK_ALPHA,
  PALETTE,
  WASH_ALPHA,
  emphasisColor,
  resolveColor,
} from "../palette.js";
import { fitStrokes, textToStrokePaths } from "../text-strokes.js";
import { ASPECT_DIMENSIONS, type Element, type Scene, type ScenePlan } from "../schemas.js";
import {
  FPS,
  type TimedElement,
  type TimedPlan,
  type TimedScene,
  type TimedStroke,
  type WordTiming,
} from "../timed.js";
import { countWords } from "./ingest.js";

/** Fallback cadence when no real audio timestamps exist (~130 wpm). */
const ESTIMATED_MS_PER_WORD = Math.round(60000 / 130);
/** Silence appended after the last narration word of each scene. */
const SCENE_TAIL_MS = 800;
const EMPHASIS_DELAY_MS = 200;
/** Every stroke must be fully on screen at least this long before the wipe. */
const COMPLETION_MARGIN_MS = 400;
/** Share of an element's draw window spent with the pen lifted between strokes. */
const PEN_LIFT_SHARE = 0.12;
/** Beat between an outline finishing and its shade wash starting. */
const WASH_DELAY_MS = 120;

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
    const audioDurationMs =
      sceneAudio?.durationMs !== undefined
        ? sceneAudio.durationMs + SCENE_TAIL_MS
        : (words.at(-1)?.startMs ?? 0) + ESTIMATED_MS_PER_WORD + SCENE_TAIL_MS;
    const elements = scene.elements.map((el, i) =>
      resolveElement(el, i, scene, words, audioDurationMs, { width, height }),
    );
    // The scene is a pre-scripted shot: it lasts until every stroke —
    // including emphasis — has been fully on screen. Extend past the audio
    // if drawing runs long; never clip the drawing or move a word-synced
    // reveal earlier.
    const lastVisualEndMs = Math.max(
      0,
      ...elements.map((e) =>
        Math.max(
          e.revealAtMs + e.drawDurationMs,
          e.emphasis ? e.emphasis.startMs + e.emphasis.drawDurationMs : 0,
        ),
      ),
    );
    const durationMs = Math.max(audioDurationMs, lastVisualEndMs + COMPLETION_MARGIN_MS);
    assertComplete(scene.id, elements, durationMs);
    const timed: TimedScene = {
      id: scene.id,
      layout: scene.layout,
      narration: scene.narration,
      startMs: cursor,
      durationMs,
      ...(sceneAudio ? { audioFile: sceneAudio.audioFile } : {}),
      words,
      elements,
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

interface StrokeStyle {
  color: string;
  widthFactor: number;
  alpha: number;
  mode: TimedStroke["mode"];
}

/**
 * Sample paths into polylines and apportion the draw window across them
 * ∝ length, with pen-lift gaps between strokes — the pacing StrokeDraw used
 * to compute per frame, now baked into the plan.
 */
function buildStrokes(
  paths: string[],
  pathLengths: number[],
  drawDurationMs: number,
  step: number,
  style: StrokeStyle,
): TimedStroke[] {
  const total = pathLengths.reduce((a, b) => a + b, 0) || 1;
  const drawMs = drawDurationMs * (1 - PEN_LIFT_SHARE);
  const liftMs =
    paths.length > 1 ? (drawDurationMs * PEN_LIFT_SHARE) / (paths.length - 1) : 0;
  let cursor = 0;
  return paths.map((d, i) => {
    const durationMs = ((pathLengths[i] ?? 1) / total) * drawMs;
    const stroke: TimedStroke = {
      points: samplePath(d, step),
      ...style,
      startMs: Math.round(cursor),
      durationMs: Math.max(1, Math.round(durationMs)),
    };
    cursor += durationMs + liftMs;
    return stroke;
  });
}

const strokesEndMs = (strokes: TimedStroke[]): number =>
  Math.max(0, ...strokes.map((s) => s.startMs + s.durationMs));

/**
 * Sample step in element-local units targeting ~2.5px on screen, so partial
 * strokes stay smooth at any element size without bloating the JSON.
 */
function sampleStepFor(size: number, canvasHeight: number): number {
  return clamp((2.5 * 100) / Math.max(size * canvasHeight, 1), 0.4, 6);
}

/** Text hierarchy maps to marker weight; shapes draw at base width. */
function widthFactorFor(el: Element): number {
  if (el.kind !== "text" && el.kind !== "number") return 1.0;
  switch (el.textStyle) {
    case "title":
      return 1.35;
    case "big-number":
      return 1.5;
    default:
      return 0.85;
  }
}

function resolveElement(
  el: Element,
  index: number,
  scene: Scene,
  words: WordTiming[],
  audioDurationMs: number,
  canvas: { width: number; height: number },
): TimedElement {
  const { paths, viewBoxWidth, fallbackLabel, placement } = pathsForElement(
    el,
    scene,
    canvas,
  );
  const pathLengths = measurePaths(paths);
  const size = placement?.size ?? el.size;
  const step = sampleStepFor(size, canvas.height);
  const strokes = buildStrokes(paths, pathLengths, drawDurationForPaths(pathLengths), step, {
    color: resolveColor(el.color),
    widthFactor: widthFactorFor(el),
    alpha: INK_ALPHA,
    mode: "ink",
  });

  if (el.shade) {
    // Marker shading: a thick, low-alpha serpentine scribble over the element,
    // right after its outline lands. Colored elements shade in their own
    // color; ink elements get the yellow highlighter.
    const outlineEndMs = strokesEndMs(strokes);
    const washDurationMs = clamp(Math.round(outlineEndMs * 0.6), 250, 800);
    strokes.push({
      points: washScribblePoints(viewBoxWidth ?? 100, 100, 0.08, el.id),
      color: el.color && el.color !== "ink" ? resolveColor(el.color) : PALETTE.yellow,
      // The wash pen must be fat enough that serpentine rows overlap; row gap
      // scales with element size while stroke width is screen-space.
      widthFactor: clamp(size * 20, 2.5, 12),
      alpha: WASH_ALPHA,
      mode: "wash",
      startMs: Math.round(outlineEndMs + WASH_DELAY_MS),
      durationMs: washDurationMs,
    });
  }
  const drawDurationMs = Math.round(strokesEndMs(strokes));

  let revealAtMs: number;
  if (el.revealAtWord !== undefined && words.length) {
    // Word-sync is sacred: the reveal lands exactly on the spoken word.
    const wordIndex = clamp(el.revealAtWord, 0, words.length - 1);
    revealAtMs = words[wordIndex]!.startMs;
  } else {
    // No explicit timing: spread elements evenly across the narration.
    revealAtMs = Math.max(
      0,
      (index / Math.max(scene.elements.length, 1)) * (audioDurationMs - 1200),
    );
  }

  const emphasisKind = el.emphasis && el.emphasis !== "none" ? el.emphasis : undefined;
  let emphasis: TimedElement["emphasis"];
  if (emphasisKind) {
    const emphasisPaths = pickVariant(
      emphasisKind === "circle" ? EMPHASIS_CIRCLE_VARIANTS : EMPHASIS_UNDERLINE_VARIANTS,
      el.id,
    );
    const emphasisLengths = measurePaths(emphasisPaths);
    const emphasisStrokes = buildStrokes(
      emphasisPaths,
      emphasisLengths,
      drawDurationForPaths(emphasisLengths),
      step,
      {
        color: emphasisColor(el.color),
        widthFactor: 1.0,
        alpha: INK_ALPHA,
        mode: "ink",
      },
    );
    emphasis = {
      kind: emphasisKind,
      strokes: emphasisStrokes,
      drawDurationMs: Math.round(strokesEndMs(emphasisStrokes)),
      startMs: revealAtMs + drawDurationMs + EMPHASIS_DELAY_MS,
    };
  }

  return {
    id: el.id,
    kind: el.kind,
    ...(el.text !== undefined ? { text: el.text } : {}),
    position: placement?.position ?? el.position,
    size,
    revealAtMs: Math.round(revealAtMs),
    drawDurationMs,
    strokes,
    ...(viewBoxWidth !== undefined ? { viewBoxWidth } : {}),
    ...(fallbackLabel !== undefined ? { fallbackLabel } : {}),
    ...(emphasis ? { emphasis } : {}),
  };
}

/** The TimedPlan is a validated shot-list: nothing may end half-drawn. */
function assertComplete(
  sceneId: string,
  elements: TimedElement[],
  durationMs: number,
): void {
  for (const el of elements) {
    if (
      !Number.isFinite(el.revealAtMs) ||
      !Number.isFinite(el.drawDurationMs) ||
      !Number.isFinite(durationMs)
    ) {
      throw new StageError(
        "animate",
        `${sceneId}/${el.id} has non-finite timing (reveal=${el.revealAtMs}, draw=${el.drawDurationMs}, scene=${durationMs})`,
      );
    }
    const drawEnd = el.revealAtMs + el.drawDurationMs;
    const emphasisEnd = el.emphasis
      ? el.emphasis.startMs + el.emphasis.drawDurationMs
      : drawEnd;
    if (durationMs - Math.max(drawEnd, emphasisEnd) < COMPLETION_MARGIN_MS - 100) {
      throw new StageError(
        "animate",
        `${sceneId}/${el.id} would end half-drawn: draw ends at ${Math.max(drawEnd, emphasisEnd)}ms, scene lasts ${durationMs}ms`,
      );
    }
  }
}

interface ElementPaths {
  paths: string[];
  viewBoxWidth?: number;
  fallbackLabel?: string;
  /** Connectors compute their own bounding box; overrides position/size. */
  placement?: { position: { x: number; y: number }; size: number };
}

/** Box outline with the label hand-written inside — the sanctioned fallback. */
function boxWithLabel(label: string): ElementPaths {
  const text = textToStrokePaths(label);
  const scale = Math.min(64 / text.viewBoxWidth, 0.32);
  const dx = (100 - text.viewBoxWidth * scale) / 2;
  const dy = 50 - 50 * scale;
  return {
    paths: [...BOX_VARIANTS[0]!, ...fitStrokes(text.paths, scale, dx, dy)],
    fallbackLabel: label,
  };
}

function pathsForElement(
  el: Element,
  scene: Scene,
  canvas: { width: number; height: number },
): ElementPaths {
  switch (el.kind) {
    case "icon": {
      if (!el.assetTag) {
        warn("assets", `icon element ${el.id} has no assetTag — using box+label fallback`);
        return boxWithLabel(el.text ?? "?");
      }
      const asset = resolveAsset(el.assetTag);
      return asset.matched === "fallback"
        ? boxWithLabel(asset.label ?? el.assetTag)
        : { paths: asset.paths };
    }
    case "arrow":
    case "line": {
      if (el.to) {
        const geo = connectorGeometry(
          el.position,
          el.to,
          canvas,
          el.id,
          el.kind === "arrow",
        );
        return {
          paths: geo.paths,
          viewBoxWidth: geo.viewBoxWidth,
          placement: { position: geo.center, size: geo.size },
        };
      }
      if (el.kind === "line") {
        warn("plan", `line element ${el.id} has no "to" point — drawing a short dash`);
        return { paths: ["M 15 52 Q 50 47 85 50"] };
      }
      return { paths: scene.layout === "flow" ? ARROW_DOWN_PATHS : ARROW_RIGHT_PATHS };
    }
    case "box":
      return { paths: pickVariant(BOX_VARIANTS, el.id) };
    case "underline":
      return { paths: pickVariant(UNDERLINE_VARIANTS, el.id) };
    case "text":
    case "number": {
      // Text is drawn stroke-by-stroke like everything else on the board.
      const text = el.text?.trim();
      if (!text) {
        warn("plan", `${el.kind} element ${el.id} has no text — using "?"`);
      }
      const strokes = textToStrokePaths(text || "?");
      return { paths: strokes.paths, viewBoxWidth: strokes.viewBoxWidth };
    }
  }
}

export function describeTimedPlan(plan: TimedPlan): string {
  const s = plan.scenes.length;
  const e = plan.scenes.reduce((n, sc) => n + sc.elements.length, 0);
  const w = plan.scenes.reduce((n, sc) => n + countWords(sc.narration), 0);
  return `${s} scenes, ${e} elements, ${w} narration words, ${(plan.totalDurationMs / 1000).toFixed(1)}s`;
}
