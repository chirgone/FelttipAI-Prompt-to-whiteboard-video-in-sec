import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Locate the fastest usable ffmpeg. Preference order (2026-07-09 decision):
 * 1. $CHALKLINE_FFMPEG (explicit override)
 * 2. System ffmpeg with libx264 — a normal distro build encodes ~4× faster
 *    than the bundled one (whose libx264 lacks asm optimizations).
 * 3. Remotion's bundled compositor ffmpeg (always present, always works).
 */
export function ffmpegPath(): string {
  const override = process.env.CHALKLINE_FFMPEG;
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`render: CHALKLINE_FFMPEG points to a missing file: ${override}`);
    }
    return override;
  }
  const system = systemFfmpeg();
  if (system) return system;
  return bundledFfmpeg();
}

let cachedSystem: string | null | undefined;

/** Absolute path of a system ffmpeg that can encode h264, else null. */
function systemFfmpeg(): string | null {
  if (cachedSystem !== undefined) return cachedSystem;
  cachedSystem = null;
  try {
    const found = execFileSync("which", ["ffmpeg"], { encoding: "utf8" }).trim();
    if (found) {
      const encoders = execFileSync(found, ["-hide_banner", "-encoders"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (encoders.includes("libx264")) cachedSystem = found;
    }
  } catch {
    // No system ffmpeg (or it's broken) — fall through to the bundled one.
  }
  return cachedSystem;
}

/**
 * The ffmpeg binary that ships inside Remotion's platform compositor package.
 * Resolution goes through @remotion/renderer so pnpm's strict node_modules
 * finds the compositor package as *its* dependency, not ours.
 */
function bundledFfmpeg(): string {
  const req = createRequire(import.meta.url);
  const rendererPkgJson = req.resolve("@remotion/renderer/package.json");
  const fromRenderer = createRequire(rendererPkgJson);
  const binName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const errors: string[] = [];
  for (const pkg of compositorPackageCandidates()) {
    try {
      const pkgJson = fromRenderer.resolve(`${pkg}/package.json`);
      const bin = path.join(path.dirname(pkgJson), binName);
      if (existsSync(bin)) return bin;
      errors.push(`${pkg}: package found but no ${binName} inside`);
    } catch {
      errors.push(`${pkg}: not installed`);
    }
  }
  throw new Error(
    `render: could not locate Remotion's bundled ffmpeg (${process.platform}/${process.arch}). Tried: ${errors.join("; ")}`,
  );
}

function compositorPackageCandidates(): string[] {
  const { platform, arch } = process;
  if (platform === "linux") {
    const a = arch === "arm64" ? "arm64" : "x64";
    return [`@remotion/compositor-linux-${a}-gnu`, `@remotion/compositor-linux-${a}-musl`];
  }
  if (platform === "darwin") {
    return [`@remotion/compositor-darwin-${arch === "arm64" ? "arm64" : "x64"}`];
  }
  if (platform === "win32") return ["@remotion/compositor-win32-x64-msvc"];
  throw new Error(`render: unsupported platform for fast renderer: ${platform}/${arch}`);
}
