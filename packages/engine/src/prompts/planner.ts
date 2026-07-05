import { ASSET_TAGS } from "../assets/tags.js";
import type { PlanOptions, SourceDocument } from "../schemas.js";

const WORDS_PER_MINUTE = 130;

const FEW_SHOT_1 = `{
  "title": "Why Cities Plant Trees",
  "language": "en",
  "aspectRatio": "16:9",
  "scenes": [
    {
      "id": "s1",
      "narration": "Cities are getting hotter every summer, and concrete makes it worse.",
      "durationHintSec": 6,
      "layout": "center",
      "elements": [
        { "id": "s1e1", "kind": "icon", "assetTag": "building", "position": { "x": 0.35, "y": 0.45 }, "size": 0.28, "revealAtWord": 0 },
        { "id": "s1e2", "kind": "icon", "assetTag": "sun", "position": { "x": 0.65, "y": 0.3 }, "size": 0.2, "revealAtWord": 3, "emphasis": "circle" },
        { "id": "s1e3", "kind": "text", "text": "Hotter every summer", "position": { "x": 0.5, "y": 0.78 }, "size": 0.06, "revealAtWord": 4 }
      ]
    },
    {
      "id": "s2",
      "narration": "One street tree cools the air around it by up to two degrees, like a small air conditioner that runs on sunlight.",
      "durationHintSec": 9,
      "layout": "split",
      "elements": [
        { "id": "s2e1", "kind": "icon", "assetTag": "tree", "position": { "x": 0.3, "y": 0.45 }, "size": 0.3, "revealAtWord": 1 },
        { "id": "s2e2", "kind": "arrow", "position": { "x": 0.5, "y": 0.45 }, "size": 0.12, "revealAtWord": 5 },
        { "id": "s2e3", "kind": "text", "text": "-2°C", "position": { "x": 0.68, "y": 0.42 }, "size": 0.1, "revealAtWord": 9, "emphasis": "underline" },
        { "id": "s2e4", "kind": "icon", "assetTag": "snowflake", "position": { "x": 0.68, "y": 0.62 }, "size": 0.14, "revealAtWord": 13 }
      ]
    }
  ]
}`;

const FEW_SHOT_2 = `{
  "title": "How Passwords Get Stolen",
  "language": "en",
  "aspectRatio": "9:16",
  "scenes": [
    {
      "id": "s1",
      "narration": "Most passwords aren't cracked. They're simply reused, leaked once, and tried everywhere.",
      "durationHintSec": 7,
      "layout": "flow",
      "elements": [
        { "id": "s1e1", "kind": "icon", "assetTag": "lock", "position": { "x": 0.5, "y": 0.22 }, "size": 0.18, "revealAtWord": 1 },
        { "id": "s1e2", "kind": "arrow", "position": { "x": 0.5, "y": 0.38 }, "size": 0.1, "revealAtWord": 6 },
        { "id": "s1e3", "kind": "icon", "assetTag": "key", "position": { "x": 0.5, "y": 0.52 }, "size": 0.16, "revealAtWord": 7 },
        { "id": "s1e4", "kind": "arrow", "position": { "x": 0.5, "y": 0.66 }, "size": 0.1, "revealAtWord": 9 },
        { "id": "s1e5", "kind": "icon", "assetTag": "globe", "position": { "x": 0.5, "y": 0.8 }, "size": 0.16, "revealAtWord": 11, "emphasis": "circle" }
      ]
    },
    {
      "id": "s2",
      "narration": "A password manager gives every site its own key, so one leak stays one leak.",
      "durationHintSec": 7,
      "layout": "grid",
      "elements": [
        { "id": "s2e1", "kind": "icon", "assetTag": "shield", "position": { "x": 0.5, "y": 0.3 }, "size": 0.2, "revealAtWord": 1 },
        { "id": "s2e2", "kind": "icon", "assetTag": "key", "position": { "x": 0.3, "y": 0.6 }, "size": 0.12, "revealAtWord": 6 },
        { "id": "s2e3", "kind": "icon", "assetTag": "key", "position": { "x": 0.5, "y": 0.6 }, "size": 0.12, "revealAtWord": 7 },
        { "id": "s2e4", "kind": "icon", "assetTag": "key", "position": { "x": 0.7, "y": 0.6 }, "size": 0.12, "revealAtWord": 8 },
        { "id": "s2e5", "kind": "text", "text": "One leak stays one leak", "position": { "x": 0.5, "y": 0.82 }, "size": 0.05, "revealAtWord": 11 }
      ]
    }
  ]
}`;

export function plannerSystemPrompt(options: PlanOptions): string {
  const targetWords = options.durationMin * WORDS_PER_MINUTE;
  return `You are a visual teacher who plans whiteboard explainer videos. You turn a document into a ScenePlan: a sequence of scenes, each with narration (what the voice says) and elements (what gets drawn, in order, synced to the narration).

You output ONLY a single JSON object conforming to the ScenePlan schema below. No prose, no markdown fences.

SCHEMA
ScenePlan { title, language, aspectRatio: "16:9"|"9:16"|"1:1", scenes: Scene[] }
Scene { id, narration: string (1-3 sentences), durationHintSec: number, layout: "center"|"grid"|"timeline"|"split"|"flow", elements: Element[] }
Element { id, kind: "icon"|"text"|"arrow"|"box"|"underline"|"number", assetTag?: string, text?: string, position: {x: 0-1, y: 0-1}, size: 0-1, revealAtWord?: number, emphasis?: "none"|"circle"|"underline" }

RULES
1. One idea per scene. If a sentence introduces a new idea, it is a new scene.
2. Speak at ~130 words per minute. The whole video must total roughly ${targetWords} words of narration (target duration: ${options.durationMin} minute(s)). Narration is conversational, concrete, and vivid — a teacher at a whiteboard, not a press release.
3. Icons over sentences. Prefer an icon plus a 2-5 word label to a written sentence. "text" elements are short labels, numbers, or punchy phrases — never full sentences.
4. Explicit reveal timing: every element gets revealAtWord — the 0-based index of the narration word on which its drawing begins. Spread reveals across the narration so something is always appearing while the voice speaks. The drawing order must follow revealAtWord order.
5. Never overlap positions. position is the element's center in normalized coordinates. Keep centers of neighboring elements at least their combined sizes apart, and keep everything inside 0.08-0.92. size is the element's height relative to the canvas (icons ~0.12-0.3, text ~0.04-0.08).
6. assetTag: choose ONLY from the library list below. If nothing fits, use the closest tag — never invent one.
7. Layouts: "center" one hero concept; "grid" 3-6 peers; "timeline" steps in sequence left-to-right; "split" before/after or problem/solution halves; "flow" a vertical or diagonal chain with arrows.
8. Use emphasis ("circle" or "underline") on at most one element per scene — the one the scene exists to teach.
9. 2-4 elements per scene for a 1-minute video, up to 6 for longer ones. durationHintSec ≈ narration word count ÷ 2.2.
10. Element ids are "<sceneId>e<n>". Scene ids are "s1", "s2", …

ASSET LIBRARY (the only legal assetTag values)
${ASSET_TAGS.join(", ")}

EXAMPLE 1 (16:9, excerpt of a 2-scene plan)
${FEW_SHOT_1}

EXAMPLE 2 (9:16, excerpt of a 2-scene plan)
${FEW_SHOT_2}`;
}

export function plannerUserPrompt(
  doc: SourceDocument,
  options: PlanOptions,
): string {
  const sections = doc.sections
    .map((s) => `## ${s.title}\n${s.text}`)
    .join("\n\n");
  return `Plan a whiteboard explainer video from this document.

Options:
- target duration: ${options.durationMin} minute(s) (~${options.durationMin * WORDS_PER_MINUTE} narration words total)
- language of narration and labels: ${options.language}
- aspectRatio: ${options.aspectRatio}

Document title: ${doc.title}

${sections}

Return the ScenePlan JSON now.`;
}

export function plannerRetryPrompt(rawReply: string, zodErrors: string): string {
  return `Your previous reply failed schema validation.

Your reply was:
${rawReply}

Validation errors:
${zodErrors}

Fix these errors and return the corrected ScenePlan JSON only.`;
}
