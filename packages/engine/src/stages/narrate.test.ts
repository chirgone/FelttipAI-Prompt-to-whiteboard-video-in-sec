import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ScenePlan } from "../schemas.js";
import type { TTSProvider } from "../tts.js";
import {
  narrate,
  narrationCacheKey,
  type NarrationCache,
} from "./narrate.js";

const VOICE = "es-MX-JorgeNeural";

function planWithScenes(count = 1): ScenePlan {
  return {
    title: "Prueba incremental",
    language: "es",
    aspectRatio: "16:9",
    scenes: Array.from({ length: count }, (_, index) => ({
      id: `s${index + 1}`,
      layout: "center" as const,
      narration: `Narración número ${index + 1}`,
      durationHintSec: 5,
      elements: [{
        id: `s${index + 1}t`,
        kind: "text" as const,
        text: `Título ${index + 1}`,
        position: { x: 0.5, y: 0.12 },
        size: 0.052,
        revealAtWord: 0,
        textStyle: "title" as const,
      }],
    })),
  };
}

function tempRun(): string {
  return mkdtempSync(path.join(tmpdir(), "felttip-narrate-"));
}

test("reuses matching narration without calling TTS", async () => {
  const source = tempRun();
  const output = tempRun();
  try {
    const plan = planWithScenes();
    const audioPath = path.join(source, "cached.mp3");
    writeFileSync(audioPath, Buffer.from("cached-audio"));
    const cache: NarrationCache = new Map([[
      narrationCacheKey(plan.scenes[0]!.narration, VOICE),
      {
        narration: plan.scenes[0]!.narration,
        voice: VOICE,
        audioPath,
        durationMs: 1000,
        words: [{ word: "Narración", startMs: 0 }],
        source: "reused:reused:word-boundaries",
      },
    ]]);
    const tts: TTSProvider = {
      synthesize: async () => { throw new Error("TTS must not run"); },
    };

    const result = await narrate(plan, output, VOICE, tts, cache);

    assert.equal(result.scenes.length, 1);
    assert.ok(existsSync(path.join(output, "narration/s1.mp3")));
    const timestamps = JSON.parse(readFileSync(path.join(output, "timestamps.json"), "utf8"));
    assert.equal(timestamps.s1.source, "reused:word-boundaries");
    assert.equal(timestamps.s1.voice, VOICE);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(output, { recursive: true, force: true });
  }
});

test("persists completed scenes when a later TTS call fails", async () => {
  const output = tempRun();
  try {
    let calls = 0;
    const tts: TTSProvider = {
      synthesize: async () => {
        calls++;
        if (calls === 2) throw new Error("simulated interruption");
        return {
          audio: Buffer.from("audio"),
          durationMs: 1000,
          words: [{ word: "Narración", startMs: 0 }],
        };
      },
    };

    await assert.rejects(narrate(planWithScenes(2), output, VOICE, tts));

    const timestamps = JSON.parse(readFileSync(path.join(output, "timestamps.json"), "utf8"));
    assert.deepEqual(Object.keys(timestamps), ["s1"]);
    assert.ok(existsSync(path.join(output, "narration/s1.mp3")));
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test("rejects visual overflow before the first TTS call", async () => {
  const output = tempRun();
  try {
    const plan = planWithScenes();
    plan.scenes[0]!.elements[0]!.text =
      "Este título deliberadamente demasiado largo debe bloquear todo antes de sintetizar audio";
    let calls = 0;
    const tts: TTSProvider = {
      synthesize: async () => {
        calls++;
        return { audio: Buffer.from("audio"), durationMs: 1000, words: [] };
      },
    };

    await assert.rejects(
      narrate(plan, output, VOICE, tts),
      /preflight text overflow failed before TTS/,
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
