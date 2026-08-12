# Felttip

Turn any document or prompt into a hand-drawn whiteboard explainer video — with narration, synced drawing, and colored icons — from a single command.

```bash
pnpm felttip run --prompt "Explain how photosynthesis works" --duration 2
# → runs/<timestamp>/out.mp4
```

Felttip is **not** pixel video generation. An LLM plans the video as structured JSON (scenes, elements, narration); everything after that — text-to-speech, stroke drawing, encoding — is deterministic, local, and free. Same plan in, same video out.

## How it works

```
file / prompt
   │
   ▼
 1. Ingest    pdf, docx, pptx, md, txt → clean text
 2. Plan      LLM (via OpenRouter) → ScenePlan JSON, Zod-validated
 3. Assets    icon tags → SVG line-art paths (local library)
 4. Narrate   free Edge neural TTS → mp3 + per-word timestamps
 5. Animate   strokes revealed word-by-word, pen leads the narration
 6. Render    multi-core rasterizer → MP4 + thumbnail
```

The **only** paid dependency is the LLM call in the Plan stage (OpenRouter, one call per video — typically a fraction of a cent with the default model). TTS, rendering, parsing, and assets are all free and local.

Every stage writes its artifact to `runs/<timestamp>/`, so you can inspect, edit, or re-run any stage independently.

## Quickstart

**Prerequisites**

- Node.js ≥ 20 and [pnpm](https://pnpm.io)
- An [OpenRouter](https://openrouter.ai) API key
- Optional but recommended: a system `ffmpeg` with libx264 (or VAAPI) on your PATH — renders are ~4× faster than with the bundled fallback encoder

**Setup**

```bash
git clone <this-repo> && cd felttip
pnpm install
cp .env.example .env    # add your OPENROUTER_API_KEY
```

**Make your first video**

```bash
pnpm demo               # full pipeline on fixtures/sample-pitch.md
```

Open `runs/<timestamp>/out.mp4`. That's the whole loop.

## Usage

### From a prompt

```bash
pnpm felttip run --prompt "What is compound interest?" --duration 1
```

### From a document

```bash
pnpm felttip run pitch.pdf --duration 3 --aspect 9:16
```

Supported inputs: `.pdf`, `.docx`, `.pptx`, `.md`, `.txt`.

### Options (for `run` and `plan`)

| Flag | Values | Default |
|---|---|---|
| `--duration` | `1`, `2`, `3`, `5` (minutes) | `2` |
| `--aspect` | `16:9`, `9:16`, `1:1` | `16:9` |
| `--language` | any language code the model can write | `en` |
| `--voice` | any [Edge TTS voice name](https://gist.github.com/BettyJJ/17cbaa1de96235a7f5773b8690a20462) | `es-MX-JorgeNeural` |

### Run stages individually

Each stage is a pure function with a JSON artifact in and out — great for iterating on one stage without paying for the others:

```bash
pnpm felttip ingest deck.pptx                      # → source-document.json
pnpm felttip plan runs/<ts>/source-document.json   # → sceneplan.json  (the only LLM call)
pnpm felttip narrate runs/<ts>/sceneplan.json      # → timedplan.json + mp3s
pnpm felttip narrate runs/<ts>/sceneplan.json --reuse runs/<prior-ts>
pnpm felttip render runs/<ts>/timedplan.json       # → out.mp4
```

You can hand-edit `sceneplan.json` between stages — it's validated against a Zod schema, and the renderer draws exactly what it says. `render` also accepts a bare `sceneplan.json` to produce a silent video.

Use `--reuse` after visual-only edits or an interrupted narration run. Felttip reuses segments whose normalized narration and voice match, rebuilds visual strokes, and checkpoints `timestamps.json` after every scene.

### HTTP API

```bash
pnpm api    # Fastify server on :3210 (override with PORT)
```

- `POST /jobs` — submit a file or prompt, returns a job id
- `GET /jobs/:id` — job status
- `GET /jobs/:id/video` — the finished MP4

## Configuration

All config lives in `.env` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | **Required.** The only paid dependency in the project. |
| `LLM_MODEL` | Planner model. Default `google/gemini-3.1-flash-lite` (fast, ~$0.001/video). Any OpenRouter model id works — e.g. `anthropic/claude-sonnet-4.5` plans denser, richer videos at higher cost. |
| `FELTTIP_FFMPEG` | Path to a specific ffmpeg binary. Otherwise Felttip probes your PATH and falls back to the bundled encoder. |
| `FELTTIP_RENDERER` | Set to `remotion` to use the headless-Chrome render path instead of the default fast Node rasterizer. |
| `FELTTIP_THEME` | Renderer theme. Supported values: `blackboard` (default), `ivory-notebook`, `blueprint`. |

## Quality & speed

- A schema-valid plan isn't necessarily a *watchable* plan, so the Plan stage lints visual richness (scenes/minute, elements/scene, icons/scene) and sends thin plans back to the model once for enrichment.
- The fast renderer rasterizes frames on all cores and pipes raw video straight into ffmpeg — a 2-minute 1080p video renders in well under a minute on a modern 8-core machine (GPU encoding via VAAPI when available).
- Reference timings (8-core laptop, default model): plan ~40s, narrate ~15s, render ~35s for a ~75s video.

## Project layout

```
packages/engine     pure pipeline library: ingest, plan, narrate, schemas, assets
packages/renderer   drawing math + fast Node renderer + Remotion composition
packages/cli        the felttip CLI
packages/api        Fastify job server
docs/architecture.md   the full design doc
```

Conventions: TypeScript strict everywhere, Zod for every schema, no LLM calls outside the Plan stage, every stage fails loudly with its name and cause.

## Contributing

Issues and PRs welcome. Before submitting:

```bash
pnpm typecheck   # must pass
pnpm demo        # the acceptance test — should produce a narrated MP4
```

Two hard rules for contributions:

1. **No paid dependencies** beyond the OpenRouter call in the Plan stage.
2. **The renderer stays deterministic** — the LLM only ever outputs `ScenePlan` JSON.

## License

[MIT](LICENSE)
