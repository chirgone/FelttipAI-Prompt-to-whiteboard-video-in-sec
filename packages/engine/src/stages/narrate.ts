import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { warn } from "../errors.js";
import type { ScenePlan } from "../schemas.js";
import type { TimedPlan, WordTiming } from "../timed.js";
import { EdgeTTSProvider, type TTSProvider } from "../tts.js";
import { countWords } from "./ingest.js";
import { resolveTimedPlan, type SceneAudio } from "./timing.js";

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
): Promise<TimedPlan> {
  const narrationDir = path.join(runDir, "narration");
  mkdirSync(narrationDir, { recursive: true });

  const audio = new Map<string, SceneAudio>();
  const timestamps: Record<
    string,
    { durationMs: number; source: string; words: WordTiming[] }
  > = {};

  for (const scene of plan.scenes) {
    const result = await tts.synthesize(scene.narration, voice);
    const audioFile = `narration/${scene.id}.mp3`;
    writeFileSync(path.join(runDir, audioFile), result.audio);

    let words = result.words;
    let source = "word-boundaries";
    const spokenWordCount = countWords(scene.narration);
    if (!words.length) {
      // Sanctioned fallback: estimate per-word timing from duration ÷ count.
      warn(
        "narrate",
        `${scene.id}: no word boundaries from TTS — estimating timing from audio duration ÷ word count`,
      );
      const msPerWord = result.durationMs / Math.max(spokenWordCount, 1);
      words = scene.narration
        .split(/\s+/)
        .filter(Boolean)
        .map((word, i) => ({ word, startMs: Math.round(i * msPerWord) }));
      source = "estimated";
    }

    audio.set(scene.id, { audioFile, durationMs: result.durationMs, words });
    timestamps[scene.id] = { durationMs: result.durationMs, source, words };
    console.log(
      `  ${scene.id}: ${(result.durationMs / 1000).toFixed(1)}s audio, ${words.length} word timestamps`,
    );
  }

  writeFileSync(
    path.join(runDir, "timestamps.json"),
    JSON.stringify(timestamps, null, 2),
  );
  return resolveTimedPlan(plan, audio);
}
