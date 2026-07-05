import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Readable } from "node:stream";
import { StageError, warn } from "./errors.js";
import type { WordTiming } from "./timed.js";

export interface TTSResult {
  audio: Buffer;
  /** Word timings from the engine's boundary events; empty if unavailable. */
  words: WordTiming[];
  durationMs: number;
}

/** Free TTS only. Swap implementations here; never add a paid provider. */
export interface TTSProvider {
  synthesize(text: string, voice: string): Promise<TTSResult>;
}

/** 48kbps CBR mono mp3 — duration is derivable from byte length. */
const FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
const BITRATE_BPS = 48000;
/** Edge boundary offsets are in 100-nanosecond ticks. */
const TICKS_PER_MS = 10000;

interface BoundaryEvent {
  Type: string;
  Data?: {
    Offset?: number;
    Duration?: number;
    text?: { Text?: string };
  };
}

export class EdgeTTSProvider implements TTSProvider {
  async synthesize(text: string, voice: string): Promise<TTSResult> {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, FORMAT, { wordBoundaryEnabled: true });
      const { audioStream, metadataStream } = tts.toStream(text);
      const [audio, words] = await Promise.all([
        collectBuffer(audioStream),
        metadataStream ? collectWords(metadataStream) : Promise.resolve([]),
      ]);
      if (!audio.length) {
        throw new StageError("narrate", `Edge TTS returned no audio for voice "${voice}"`);
      }
      const byteDurationMs = Math.round((audio.length * 8 * 1000) / BITRATE_BPS);
      const lastWordEndMs = words.length
        ? words[words.length - 1]!.startMs + 400
        : 0;
      return {
        audio,
        words,
        durationMs: Math.max(byteDurationMs, lastWordEndMs),
      };
    } catch (err) {
      if (err instanceof StageError) throw err;
      throw new StageError("narrate", `Edge TTS synthesis failed for voice "${voice}"`, {
        cause: err,
      });
    } finally {
      tts.close();
    }
  }
}

// Edge's streams sometimes emit "close" without "end", so treat either as
// completion and only reject on errors other than a premature close.
function collectBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (): void => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    };
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", finish);
    stream.on("close", finish);
    stream.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ERR_STREAM_PREMATURE_CLOSE") return finish();
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

function collectWords(stream: Readable): Promise<WordTiming[]> {
  return new Promise((resolve, reject) => {
    const words: WordTiming[] = [];
    let settled = false;
    const finish = (): void => {
      if (!settled) {
        settled = true;
        resolve(words);
      }
    };
    stream.on("data", (chunk: Buffer) => {
      const raw = String(chunk);
      let parsed: { Metadata?: BoundaryEvent[] };
      try {
        parsed = JSON.parse(raw) as { Metadata?: BoundaryEvent[] };
      } catch {
        warn("narrate", `unparseable TTS metadata chunk (ignored): ${raw.slice(0, 120)}`);
        return;
      }
      for (const event of parsed.Metadata ?? []) {
        if (event.Type !== "WordBoundary") continue;
        const text = event.Data?.text?.Text;
        const offset = event.Data?.Offset;
        if (text === undefined || offset === undefined) continue;
        words.push({ word: text, startMs: Math.round(offset / TICKS_PER_MS) });
      }
    });
    stream.on("end", finish);
    stream.on("close", finish);
    stream.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ERR_STREAM_PREMATURE_CLOSE") return finish();
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}
