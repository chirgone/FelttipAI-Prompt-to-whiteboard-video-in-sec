# Chalkline — Project Memory

## Mission

Chalkline turns any document or prompt into a whiteboard explainer video via a
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
(Remotion), `cli` (chalkline CLI), `api` (Fastify).

## Golden rule

The LLM only ever outputs JSON conforming to `ScenePlanSchema`
(Zod-validated, `packages/engine/src/schemas.ts`). Rendering is 100%
deterministic from that JSON.

## Commands

- `pnpm demo` — full pipeline on `fixtures/sample-pitch.md` (THE acceptance test)
- `pnpm chalkline <ingest|plan|narrate|render|run> …` — run any stage; artifacts → `runs/<timestamp>/`
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
- No paid services beyond OpenRouter. No extra encoders (ffmpeg ships with Remotion).

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
