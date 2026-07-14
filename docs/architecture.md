# Felttip Architecture

Felttip converts a document or prompt into a whiteboard-style explainer
video. The core bet: **no pixel video generation**. An LLM produces a compact,
schema-validated plan of scenes; a deterministic renderer draws it. This makes
output reproducible, debuggable, cheap (one LLM call per video), and fast.

## Pipeline

```
file/prompt ─▶ Ingest ─▶ Plan ─▶ Narrate ─▶ Render(Animate) ─▶ out.mp4
                            │        │
                         Assets   msedge-tts
```

Every stage is a pure function in `packages/engine`, runnable standalone via
`pnpm felttip <stage>`, writing its artifact into `runs/<timestamp>/` so any
intermediate can be inspected on disk.

### 1. Ingest — `stages/ingest.ts`

`(file | promptText) → SourceDocument { title, sections[], rawText }`

- PDF via `pdf-parse`, DOCX via `mammoth`, PPTX via a minimal XML text
  extractor, MD/TXT passthrough.
- Sections are heading-split chunks. If the document exceeds the token budget
  (~8k words), one LLM summarization pass compresses it (the only LLM use
  outside Plan).

### 2. Plan — `stages/plan.ts` (the brain)

`SourceDocument + options → ScenePlan`

Options: duration (1/2/3/5 min), language, aspect ratio (16:9 / 9:16 / 1:1),
voice. LLM = `openai` SDK pointed at OpenRouter
(`https://openrouter.ai/api/v1`), model from `LLM_MODEL`.

The model receives the planner system prompt (`prompts/planner.ts`: visual
teacher, one idea per scene, ~130 wpm, icons over sentences, explicit
`revealAtWord` timing, no overlapping positions, assetTags only from the
injected library list, 2 few-shot examples) and must return JSON conforming
to `ScenePlanSchema` (Zod). On validation failure: retry once with the Zod
errors fed back, then fail loudly.

**ScenePlan** → scenes[] → elements[]. Element kinds: icon, text, arrow, box,
underline, number. Positions normalized 0–1; `revealAtWord` indexes into the
scene's narration words.

### 3. Assets — `assets/`

~60 hand-drawn-style SVG line-art icons: pure `<path>` strokes, no fills,
uniform stroke width, single color (`currentColor`), viewBox `0 0 100 100`.
`manifest.json` maps tag → file + synonyms. Resolver: exact tag → synonym →
fallback "box + label" (logs a warning; never crashes).

### 4. Narrate — `stages/narrate.ts`

`ScenePlan → TimedPlan`

Per scene: msedge-tts (free Edge neural TTS) synthesizes
`narration/<sceneId>.mp3` and emits WordBoundary events →
`timestamps.json`. Real scene duration comes from the audio
(`durationHintSec` is only a hint). Every element's `revealAtWord` resolves to
`revealAtMs`. TTS is behind a `TTSProvider` interface; if word boundaries are
unreliable we estimate per-word timing from duration ÷ word count and log a
warning.

### 5. Animate — `packages/renderer`

Remotion components consuming the TimedPlan (plus pre-resolved SVG path data —
the renderer never imports engine runtime code, so the render layer is
swappable):

- Whiteboard background: off-white + subtle paper texture.
- Stroke-draw: path length measured with `svg-path-properties`, animate
  `stroke-dashoffset` length→0; draw time ∝ path length, clamped 300–1200 ms.
- Text in a handwriting Google font (Caveat), revealed by clip-path wipe.
- Emphasis (circle/underline) draws 200 ms after its element finishes.
- Gentle pan between layout regions within a scene; 300 ms wipe between scenes.

### 6. Render — `packages/renderer/src/render.ts`

`TimedPlan + audio → out.mp4 + thumbnail.png` via `@remotion/renderer`:
30 fps, dimensions per aspect ratio (1920×1080 / 1080×1920 / 1080×1080),
narration mixed in. Per-stage and total timings printed after every run —
speed is a core metric.

## API — `packages/api`

Thin Fastify server: `POST /jobs` (file or prompt + options → jobId, pipeline
runs async), `GET /jobs/:id` (status + per-stage progress), `GET
/jobs/:id/video` (streams MP4). In-process FIFO queue, one render at a time.
No auth in v0.

## Cost model

OpenRouter is the sole paid dependency (1 plan call + at most 1 summarization
call per video). msedge-tts, Remotion, pdf-parse, mammoth, Google fonts: free.
