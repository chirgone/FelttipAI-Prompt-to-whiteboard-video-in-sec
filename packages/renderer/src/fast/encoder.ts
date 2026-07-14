import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type EncoderKind = "vaapi" | "x264";

const VAAPI_DEVICE = "/dev/dri/renderD128";

/**
 * Segment-encoder arg lists. Both produce h264/yuv-family mp4 segments with
 * identical stream parameters across workers so the final concat can stream
 * copy. VAAPI (Intel iGPU) encodes at near-zero CPU — on the render laptop
 * that halves ffmpeg's per-frame cost; qp 19 ≈ x264 crf 18 territory.
 */
export function encoderArgs(kind: EncoderKind): { pre: string[]; post: string[] } {
  if (kind === "vaapi") {
    return {
      pre: ["-init_hw_device", `vaapi=va:${VAAPI_DEVICE}`],
      post: ["-vf", "format=nv12,hwupload", "-c:v", "h264_vaapi", "-qp", "19"],
    };
  }
  return {
    pre: [],
    post: [
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      // Workers already saturate the cores with rasterization; keep each
      // segment encoder narrow instead of N× default thread pools.
      "-threads", "2",
    ],
  };
}

let cached: EncoderKind | undefined;

/**
 * Pick the fastest working encoder for this machine, once per process:
 * CHALKLINE_ENCODER overrides; otherwise probe an actual 1-frame VAAPI
 * encode (driver quirks make anything less than a real encode unreliable)
 * and fall back to libx264.
 */
export async function detectEncoder(ffmpeg: string): Promise<EncoderKind> {
  if (cached) return cached;
  const override = process.env.CHALKLINE_ENCODER;
  if (override === "vaapi" || override === "x264") {
    cached = override;
    return cached;
  }
  cached = (await vaapiWorks(ffmpeg)) ? "vaapi" : "x264";
  return cached;
}

async function vaapiWorks(ffmpeg: string): Promise<boolean> {
  if (!existsSync(VAAPI_DEVICE)) return false;
  try {
    const { pre, post } = encoderArgs("vaapi");
    await execFileAsync(ffmpeg, [
      "-hide_banner", "-v", "error",
      ...pre,
      "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=0.1",
      ...post,
      "-f", "null", "-",
    ]);
    return true;
  } catch {
    return false;
  }
}
