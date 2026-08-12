# Felttip — Project Memory

## Mission

Felttip turns any document or prompt into a whiteboard explainer video via a
deterministic, LLM-planned rendering pipeline. We do NOT do pixel video
generation. The LLM plans; the renderer draws.

## Cost rule (hard)

The ONLY paid dependency is OpenRouter (LLM, Plan stage). Everything else —
TTS, rendering, parsing, fonts, assets — must be free and preferably local.
Never add a paid API.

## Architecture — 6-stage pipeline

1. **Ingest** — file/prompt → `SourceDocument` — `packages/engine/src/stages/ingest.ts`
2. **Plan** — SourceDocument + options → `ScenePlan` via OpenRouter — `packages/engine/src/stages/plan.ts`
3. **Assets** — assetTag → SVG line-art path data — `packages/engine/src/assets/`
4. **Narrate** — ScenePlan → `TimedPlan` (mp3 + word timestamps) — `packages/engine/src/stages/narrate.ts`
5. **Animate** — Remotion components drawing the TimedPlan — `packages/renderer/src/`
6. **Render** — TimedPlan + audio → MP4 + thumbnail — `packages/renderer/src/render.ts`

Detail: `docs/architecture.md`. Packages: `engine` (pure lib), `renderer`
(Remotion), `cli` (felttip CLI), `api` (Fastify).

## Golden rule

The LLM only ever outputs JSON conforming to `ScenePlanSchema`
(Zod-validated, `packages/engine/src/schemas.ts`). Rendering is 100%
deterministic from that JSON.

## Commands

- `pnpm demo` — full pipeline on `fixtures/sample-pitch.md` (THE acceptance test)
- `pnpm felttip <ingest|plan|narrate|render|run> …` — run any stage; artifacts → `runs/<timestamp>/`
- `pnpm felttip narrate <sceneplan> --reuse <run|timedplan>` — rebuild strokes while reusing unchanged narration audio by voice+text hash.
- `pnpm typecheck` — `tsc --noEmit` on all packages (run before every commit)
- `pnpm api` — start the Fastify server

## Conventions

- TypeScript strict everywhere; no `any`; Zod for every schema.
- Each pipeline stage is a pure function, independently runnable from the CLI.
- Every stage writes its artifact to `runs/<timestamp>/` — that's how we debug.
- Fail loudly with stage name + cause.

## Do-not list

- No LLM calls inside the render loop (LLM = Plan stage only).
- No hardcoded keys — `.env` only, gitignored (`.env.example` documents it).
- No silent error swallowing. Sole sanctioned fallback: unresolved assetTag →
  "box + label", and it logs a warning.
- No paid services beyond OpenRouter. No encoder *dependencies*: the renderer
  prefers a system-installed ffmpeg when one exists (2026-07-09 decision — the
  bundled build's x264 is ~4× slower), falls back to Remotion's bundled ffmpeg,
  and never downloads/vendors its own encoder binary.

## Decisions log

- 2026-07-05: LLM restricted to Plan stage (+ optional ingest summarization); renderer is deterministic — keeps cost fixed and output reproducible.
- 2026-07-05: Renderer swappable — engine emits TimedPlan JSON only; Remotion consumes it without importing engine runtime code.
- 2026-07-05: v0 skips the "hand following the pen" effect — stroke-draw only; hand overlay is a later upgrade.
- 2026-07-05: msedge-tts chosen for TTS — free neural voices with WordBoundary timestamps; fallback = estimate timing from duration ÷ word count (logged warning).
- 2026-07-05: `svg-path-properties` for path-length measurement in Node (no DOM needed).
- 2026-07-05: Render stage lives in `packages/renderer` (not engine) so the engine never imports Remotion — engine stays a pure planner/audio library.
- 2026-07-05: pdf-parse v2 (`PDFParse` class API) — v1's function API is gone; ships own types.
- 2026-07-05: Renderer source uses extensionless relative imports — Remotion's webpack doesn't resolve `.js` → `.tsx`.
- 2026-07-05: Edge TTS streams can close without `end`; collectors treat close/premature-close as completion.
- 2026-07-05: The run directory doubles as Remotion's `publicDir`, so narration mp3s resolve via `staticFile()` with zero copying.
- 2026-07-05: M5 verified — `pnpm demo` produced a 72s narrated MP4; claude-sonnet-4.5 returned a valid ScenePlan first try. Baseline timings: ingest 0.1s, plan 53.5s, narrate 8.7s, render 649.8s. Render is ~90% of wall clock; optimize there first (draft scale, jpeg frames).
- 2026-07-09: Fast renderer is the default render path — no browser. Drawing math extracted to `packages/renderer/src/draw.ts` (shared verbatim by the Remotion composition and the Node renderer); worker threads each rasterize a contiguous frame range with @napi-rs/canvas and pipe raw-RGBA-in-AVI into Remotion's bundled ffmpeg (own h264 segment, identical codec params), final pass concats with `-c copy` + mixes narration (atrim/adelay/amix). 2:39 render: 37 min → 6.5 min on a 4-core laptop. `FELTTIP_RENDERER=remotion` restores the headless-Chrome path.
- 2026-07-09: Frames pipe as raw AVI, not PNG/JPEG: the trimmed Remotion ffmpeg has no rawvideo *demuxer*, its PNG path decodes at ~255ms/frame (zlib built -Os) and Skia's JPEG encode is ~500ms/frame — raw AVI + the enabled rawvideo *decoder* is a memcpy. `aviStream.ts` mirrors the byte layout that ffmpeg itself emits for `-c:v rawvideo -pix_fmt rgba -f avi`.
- 2026-07-09: Paper-noise grain removed everywhere (theme, composition, fast renderer). It cost ~830ms/frame to rasterize in Skia-CPU and was provably invisible in output: empty-paper patches of the user-approved M9 video measure sd=0.00 after x264 yuv420p. Board is pure white (matches the Simi reference).
- 2026-07-12: Plan model switched to `google/gemini-3.1-flash-lite` ($0.25/$1.50 per M vs Sonnet 4.5's $3/$15 — ~12×/10× cheaper), picked by racing cheap models on the real plan call. It needs the richness lint (below) — its first draft is thin — but lint+enrich lands 10 scenes/51 elements/23 colored icons in ~40s total, faster than Sonnet's 54s. Rejected: deepseek-v4-pro (reasoning model, ~360s/call), deepseek-v4-flash (~108s, half the scenes/icons of Sonnet), qwen3.5-flash (rich but ~200s), glm-4.7-flash (empty responses). Model stays env-driven via `LLM_MODEL`.
- 2026-07-12: Plan stage got a visual-richness lint + one enrichment retry (`richnessShortfalls` in plan.ts): floors of ≥5 scenes/min (min 4), ≥5 elements/scene (4 for 1-min), ≥2 icons/scene — calibrated on the M9-approved Sonnet plans. Schema-valid-but-thin plans go back to the model once with the shortfall list; if enrichment doesn't reduce shortfalls, the original plan is kept (warned, never silent). Planner prompt states the same floors as HARD MINIMUMs plus a metaphor-icons-over-boxes rule.
- 2026-07-09: The bundled libx264 is built without asm (~205ms CPU/frame at 1080p even on static content; preset changes barely matter). Decision (Shahnoor): prefer system ffmpeg when installed — `ffmpegPath()` probes PATH for an ffmpeg with libx264, `FELTTIP_FFMPEG` overrides, bundled remains the zero-setup fallback.
- 2026-08-12: Narration is incrementally reusable by voice+normalized-text hash via `narrate --reuse`. `timestamps.json` is checkpointed after every scene, so interruption does not discard completed TTS work. Visual-only edits rebuild strokes and the TimedPlan without synthesizing unchanged audio.
- 2026-08-12: Exact Hershey text bounds are checked before the first TTS call. Long-form QC also blocks dangling visual phrases, sentence fragments across scene boundaries, bare one-letter labels, and excessive title/label repetition. Mechanical word/character truncation is forbidden; builders must emit complete editorial units.
