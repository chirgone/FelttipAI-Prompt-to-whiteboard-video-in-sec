import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { StageError, warn } from "../errors.js";
import type { ScenePlan } from "../schemas.js";
import type { TimedPlan, WordTiming } from "../timed.js";
import { EdgeTTSProvider, type TTSProvider } from "../tts.js";
import { countWords } from "./ingest.js";
import { preflightTextOverflows, resolveTimedPlan, type SceneAudio } from "./timing.js";

export interface NarrationCacheEntry {
  narration: string;
  voice: string;
  audioPath: string;
  durationMs: number;
  words: WordTiming[];
  source: string;
}

export type NarrationCache = Map<string, NarrationCacheEntry>;

export function narrationHash(narration: string): string {
  return createHash("sha256").update(narration.replace(/\s+/g, " ").trim()).digest("hex");
}

export function narrationCacheKey(narration: string, voice: string): string {
  return `${voice}:${narrationHash(narration)}`;
}

/**
 * ScenePlan → TimedPlan with real audio. Per scene: synthesize narration to
 * runDir/narration/<sceneId>.mp3, capture word-boundary timestamps, and let
 * the timing resolver turn revealAtWord into revealAtMs.
 */
export async function narrate(
  plan: ScenePlan,
  runDir: string,
  voice: string,
  tts: TTSProvider = new EdgeTTSProvider(),
  reuse: NarrationCache = new Map(),
): Promise<TimedPlan> {
  const overflows = preflightTextOverflows(plan);
  if (overflows.length) {
    const detail = overflows
      .slice(0, 8)
      .map((item) => `${item.sceneId}/${item.elementId} "${item.text}" [${item.left}, ${item.right}]`)
      .join("; ");
    throw new StageError(
      "narrate",
      `preflight text overflow failed before TTS (${overflows.length}): ${detail}`,
    );
  }

  const narrationDir = path.join(runDir, "narration");
  mkdirSync(narrationDir, { recursive: true });

  const audio = new Map<string, SceneAudio>();
  const timestamps: Record<
    string,
    {
      durationMs: number;
      source: string;
      words: WordTiming[];
      narration: string;
      narrationHash: string;
      voice: string;
    }
  > = {};

  for (const scene of plan.scenes) {
    const audioFile = `narration/${scene.id}.mp3`;
    const outputAudioPath = path.join(runDir, audioFile);
    const key = narrationCacheKey(scene.narration, voice);
    const cached = reuse.get(key);
    let durationMs: number;
    let words: WordTiming[];
    let source: string;

    if (cached && cached.narration === scene.narration && cached.voice === voice && existsSync(cached.audioPath)) {
      if (path.resolve(cached.audioPath) !== path.resolve(outputAudioPath)) {
        copyFileSync(cached.audioPath, outputAudioPath);
      }
      durationMs = cached.durationMs;
      words = cached.words;
      source = `reused:${cached.source.replace(/^(?:reused:)+/, "")}`;
    } else {
      const result = await tts.synthesize(scene.narration, voice);
      writeFileSync(outputAudioPath, result.audio);
      durationMs = result.durationMs;
      words = result.words;
      source = "word-boundaries";
      const spokenWordCount = countWords(scene.narration);
      if (!words.length) {
        // Sanctioned fallback: estimate per-word timing from duration ÷ count.
        warn(
          "narrate",
          `${scene.id}: no word boundaries from TTS — estimating timing from audio duration ÷ word count`,
        );
        const msPerWord = durationMs / Math.max(spokenWordCount, 1);
        words = scene.narration
          .split(/\s+/)
          .filter(Boolean)
          .map((word, i) => ({ word, startMs: Math.round(i * msPerWord) }));
        source = "estimated";
      }
    }

    audio.set(scene.id, { audioFile, durationMs, words });
    timestamps[scene.id] = {
      durationMs,
      source,
      words,
      narration: scene.narration,
      narrationHash: narrationHash(scene.narration),
      voice,
    };
    // Persist after every scene so an interrupted run remains reusable.
    writeFileSync(
      path.join(runDir, "timestamps.json"),
      JSON.stringify(timestamps, null, 2),
    );
    console.log(
      `  ${scene.id}: ${(durationMs / 1000).toFixed(1)}s audio, ${words.length} word timestamps${cached ? " (reused)" : ""}`,
    );
  }
  return resolveTimedPlan(plan, audio);
}
