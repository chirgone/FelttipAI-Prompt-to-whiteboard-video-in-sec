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
      "narration": "Cities are getting hotter every single summer, and all that concrete just makes it worse.",
      "durationHintSec": 7,
      "layout": "center",
      "elements": [
        { "id": "s1e1", "kind": "text", "text": "The Heat Problem", "textStyle": "title", "position": { "x": 0.5, "y": 0.12 }, "size": 0.07, "revealAtWord": 0 },
        { "id": "s1e2", "kind": "icon", "assetTag": "building", "color": "purple", "position": { "x": 0.32, "y": 0.45 }, "size": 0.24, "revealAtWord": 2 },
        { "id": "s1e3", "kind": "text", "text": "Concrete", "textStyle": "label", "position": { "x": 0.32, "y": 0.62 }, "size": 0.04, "revealAtWord": 4 },
        { "id": "s1e4", "kind": "icon", "assetTag": "sun", "color": "orange", "shade": true, "position": { "x": 0.66, "y": 0.38 }, "size": 0.2, "revealAtWord": 6, "emphasis": "circle" },
        { "id": "s1e5", "kind": "text", "text": "Hotter", "textStyle": "label", "position": { "x": 0.66, "y": 0.54 }, "size": 0.04, "revealAtWord": 7 },
        { "id": "s1e6", "kind": "text", "text": "Every summer, worse", "textStyle": "label", "position": { "x": 0.5, "y": 0.86 }, "size": 0.045, "revealAtWord": 12 }
      ]
    },
    {
      "id": "s2",
      "narration": "One street tree cools the air around it by up to two degrees, like a tiny air conditioner that runs on nothing but sunlight.",
      "durationHintSec": 9,
      "layout": "split",
      "elements": [
        { "id": "s2e1", "kind": "icon", "assetTag": "tree", "color": "green", "shade": true, "position": { "x": 0.26, "y": 0.42 }, "size": 0.28, "revealAtWord": 2 },
        { "id": "s2e2", "kind": "text", "text": "One tree", "textStyle": "label", "position": { "x": 0.26, "y": 0.62 }, "size": 0.04, "revealAtWord": 3 },
        { "id": "s2e3", "kind": "arrow", "position": { "x": 0.42, "y": 0.42 }, "to": { "x": 0.58, "y": 0.42 }, "size": 0.1, "revealAtWord": 6 },
        { "id": "s2e4", "kind": "number", "text": "-2°C", "textStyle": "big-number", "color": "red", "position": { "x": 0.72, "y": 0.38 }, "size": 0.11, "revealAtWord": 10, "emphasis": "underline" },
        { "id": "s2e5", "kind": "icon", "assetTag": "snowflake", "color": "teal", "position": { "x": 0.72, "y": 0.6 }, "size": 0.13, "revealAtWord": 15 },
        { "id": "s2e6", "kind": "text", "text": "Runs on sunlight", "textStyle": "label", "position": { "x": 0.5, "y": 0.86 }, "size": 0.045, "revealAtWord": 20 }
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
      "narration": "Most passwords are never cracked. Someone reuses one, it leaks once, and attackers simply try it everywhere.",
      "durationHintSec": 8,
      "layout": "flow",
      "elements": [
        { "id": "s1e1", "kind": "icon", "assetTag": "person-question", "color": "blue", "position": { "x": 0.5, "y": 0.16 }, "size": 0.14, "revealAtWord": 2 },
        { "id": "s1e2", "kind": "text", "text": "Same password", "textStyle": "label", "position": { "x": 0.5, "y": 0.26 }, "size": 0.03, "revealAtWord": 4 },
        { "id": "s1e3", "kind": "arrow", "position": { "x": 0.5, "y": 0.31 }, "to": { "x": 0.5, "y": 0.38 }, "size": 0.06, "revealAtWord": 7 },
        { "id": "s1e4", "kind": "icon", "assetTag": "lock", "color": "orange", "shade": true, "position": { "x": 0.5, "y": 0.46 }, "size": 0.13, "revealAtWord": 9, "emphasis": "circle" },
        { "id": "s1e5", "kind": "text", "text": "One leak", "textStyle": "label", "position": { "x": 0.5, "y": 0.56 }, "size": 0.03, "revealAtWord": 10 },
        { "id": "s1e6", "kind": "arrow", "position": { "x": 0.5, "y": 0.61 }, "to": { "x": 0.5, "y": 0.68 }, "size": 0.06, "revealAtWord": 13 },
        { "id": "s1e7", "kind": "icon", "assetTag": "globe", "color": "teal", "position": { "x": 0.5, "y": 0.76 }, "size": 0.13, "revealAtWord": 15 },
        { "id": "s1e8", "kind": "text", "text": "Tried everywhere", "textStyle": "label", "position": { "x": 0.5, "y": 0.87 }, "size": 0.032, "revealAtWord": 16 }
      ]
    },
    {
      "id": "s2",
      "narration": "Say your gym password is Summer2024. It leaks from the gym's tiny website, and within hours a bot tries Summer2024 on your email, your bank, your work login.",
      "durationHintSec": 11,
      "layout": "timeline",
      "elements": [
        { "id": "s2e1", "kind": "text", "text": "Summer2024", "textStyle": "big-number", "color": "red", "position": { "x": 0.5, "y": 0.14 }, "size": 0.05, "revealAtWord": 5, "emphasis": "circle" },
        { "id": "s2e2", "kind": "icon", "assetTag": "building", "color": "purple", "position": { "x": 0.25, "y": 0.38 }, "size": 0.12, "revealAtWord": 9 },
        { "id": "s2e3", "kind": "text", "text": "Gym site leaks", "textStyle": "label", "position": { "x": 0.25, "y": 0.48 }, "size": 0.028, "revealAtWord": 12 },
        { "id": "s2e4", "kind": "arrow", "position": { "x": 0.35, "y": 0.4 }, "to": { "x": 0.62, "y": 0.4 }, "size": 0.08, "revealAtWord": 18 },
        { "id": "s2e5", "kind": "icon", "assetTag": "email", "color": "blue", "position": { "x": 0.75, "y": 0.32 }, "size": 0.1, "revealAtWord": 22 },
        { "id": "s2e6", "kind": "icon", "assetTag": "money", "color": "green", "position": { "x": 0.75, "y": 0.5 }, "size": 0.1, "revealAtWord": 25 },
        { "id": "s2e7", "kind": "icon", "assetTag": "laptop", "color": "orange", "position": { "x": 0.75, "y": 0.68 }, "size": 0.1, "revealAtWord": 28 },
        { "id": "s2e8", "kind": "text", "text": "One leak = every door", "textStyle": "label", "position": { "x": 0.5, "y": 0.87 }, "size": 0.032, "revealAtWord": 29 }
      ]
    }
  ]
}`;

/** Hard floor on scene count — shared by the prompt and the richness lint. */
export function minSceneCount(durationMin: number): number {
  return Math.max(4, durationMin * 5);
}

/** Hard floor on elements per scene — shared by the prompt and the richness lint. */
export function minElementsPerScene(durationMin: number): number {
  return durationMin === 1 ? 4 : 5;
}

export function plannerSystemPrompt(options: PlanOptions): string {
  const targetWords = options.durationMin * WORDS_PER_MINUTE;
  return `You are a visual teacher who plans whiteboard explainer videos. You turn a document into a ScenePlan: a sequence of scenes, each with narration (what the voice says) and elements (what gets drawn, in order, synced to the narration).

You output ONLY a single JSON object conforming to the ScenePlan schema below. No prose, no markdown fences.

SCHEMA
ScenePlan { title, language, aspectRatio: "16:9"|"9:16"|"1:1", scenes: Scene[] }
Scene { id, narration: string (1-3 sentences), durationHintSec: number, layout: "center"|"grid"|"timeline"|"split"|"flow", elements: Element[] }
Element {
  id, kind: "icon"|"text"|"arrow"|"line"|"box"|"underline"|"number",
  assetTag?: string,            // icon only — from the library below
  text?: string,                // text/number only
  position: {x: 0-1, y: 0-1},   // element center
  to?: {x, y},                  // arrow/line only: endpoint (position is the start) — a wobbly hand-drawn connector with an arrowhead
  size: 0-1,                    // height relative to canvas
  revealAtWord?: number,        // 0-based narration word index where drawing begins
  emphasis?: "none"|"circle"|"underline",
  color?: "ink"|"blue"|"red"|"green"|"orange"|"purple"|"teal"|"yellow",
  shade?: boolean,              // low-alpha marker wash over the element after its outline
  textStyle?: "title"|"label"|"big-number"
}

RULES
1. One idea per scene. If a sentence introduces a new idea, it is a new scene. HARD MINIMUM: at least ${minSceneCount(options.durationMin)} scenes for this video — many short scenes that keep wiping the board beat a few long static ones.
2. Speak at ~130 words per minute. The whole video must total roughly ${targetWords} words of narration (target duration: ${options.durationMin} minute(s)). Narration is conversational, concrete, and vivid — a teacher at a whiteboard, not a press release.
3. COLOR IS MANDATORY. Every icon gets a color (rotate blue, green, orange, purple, teal, red — vary within each scene; never two adjacent icons the same color). Icons are drawn as ink outlines and then flooded with their flat color, so colored icons pop like real marker drawings. Text stays "ink" except big numbers and key stats (red or blue). Use shade: true on the 1-2 icons the scene is really about. Never use yellow as an element color — it is only the highlighter tint that shade applies automatically.
4. LABEL EVERY ICON. Each icon gets a text element with a 1-4 word label directly beneath it (label y ≈ icon y + icon size × 0.75, label size 0.028-0.045, textStyle "label"). An unlabeled icon is a mistake.
5. PEOPLE MAKE IT HUMAN. At least a third of scenes must include a character icon doing something: person, people, person-teaching, person-reading, person-idea, person-question. When the document talks about someone acting, show that person.
6. SHOW A CONCRETE EXAMPLE. At least one mid-video scene must walk through a real worked example from the document — actual numbers, actual names — using number/big-number elements and arrows to show the steps. Show, don't just tell.
7. Reveal timing: every element gets revealAtWord — the 0-based index of the narration word it should land on (the renderer starts the pen early so drawing completes on that word). Spread reveals across the whole narration; something should always be appearing. A label reveals 1-2 words after its icon. Drawing order must follow revealAtWord order.
8. Composition: titles top-center (textStyle "title", y ≈ 0.12, only when a scene opens a new chapter of the story). Key scenes end with a short punchy takeaway label at the bottom (y ≈ 0.86, revealed on the closing words). Keep icon centers at least their combined sizes apart and everything inside 0.08-0.92. Icons ~0.1-0.28 tall, text 0.028-0.08.
9. Density: 5-8 elements per scene for 16:9 (4-6 for 1-minute videos), and HARD MINIMUM 2 icons in every scene. A whiteboard fills up as its scene is spoken — one lonely icon on an empty board is a failure.
10. Use arrow/line with "to" to connect related elements — flows, causation, transformations. Layouts: "center" one hero concept; "grid" 3-6 peers; "timeline" steps left-to-right; "split" before/after halves; "flow" a vertical chain.
11. Use emphasis ("circle" or "underline") on at most one element per scene — the one the scene exists to teach.
12. assetTag: choose ONLY from the library list below. If nothing fits, use the closest tag — never invent one.
13. Element ids are "<sceneId>e<n>". Scene ids are "s1", "s2", … durationHintSec ≈ narration word count ÷ 2.2.
14. Prefer vivid metaphor icons over generic shapes — fire for danger, gift for rewards, lightbulb for ideas, flag for goals, warning for pitfalls, checkmark for wins. The board should look like a story, not a diagram; a box is a last resort, not a default.

ASSET LIBRARY (the only legal assetTag values)
${ASSET_TAGS.join(", ")}

EXAMPLE 1 (16:9, excerpt of a 2-scene plan)
${FEW_SHOT_1}

EXAMPLE 2 (9:16, excerpt of a 2-scene plan — note s2 walks a concrete example)
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

export function plannerEnrichPrompt(
  planJson: string,
  shortfalls: string[],
): string {
  return `Your plan below is schema-valid but visually too thin — it would make a boring video.

Your plan:
${planJson}

Shortfalls to fix (every one of them):
${shortfalls.map((s) => `- ${s}`).join("\n")}

Rewrite the ScenePlan fixing every shortfall: split long scenes into more short ones, add icons (each with a colored fill and a label beneath it), and keep something appearing on the board at all times. Keep the same story, narration voice, and total narration length. Return the full corrected ScenePlan JSON only.`;
}

export function plannerRetryPrompt(rawReply: string, zodErrors: string): string {
  return `Your previous reply failed schema validation.

Your reply was:
${rawReply}

Validation errors:
${zodErrors}

Fix these errors and return the corrected ScenePlan JSON only.`;
}
