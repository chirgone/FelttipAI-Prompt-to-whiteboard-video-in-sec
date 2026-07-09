import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { warn } from "../errors.js";

export interface ResolvedAsset {
  /** Tag actually used (the requested one for fallback). */
  tag: string;
  /** SVG path `d` strings, stroke-only, in a 0 0 100 100 viewBox. */
  paths: string[];
  /** Subset of `paths` forming the silhouette to flood with the element color. */
  fillPaths: string[];
  matched: "exact" | "synonym" | "fallback";
  /** For fallback only: label to hand-write inside the box. */
  label?: string;
}

interface Manifest {
  strokeWidth: number;
  viewBox: string;
  icons: Record<string, { file: string; synonyms: string[]; fill?: number[] }>;
}

const iconsDir = new URL("../../assets/icons/", import.meta.url);

let manifest: Manifest | undefined;
let synonymIndex: Map<string, string> | undefined;
const pathCache = new Map<string, string[]>();

function loadManifest(): Manifest {
  if (!manifest) {
    manifest = JSON.parse(
      readFileSync(new URL("manifest.json", iconsDir), "utf8"),
    ) as Manifest;
    synonymIndex = new Map();
    for (const [tag, entry] of Object.entries(manifest.icons)) {
      for (const syn of entry.synonyms) synonymIndex.set(syn.toLowerCase(), tag);
    }
  }
  return manifest;
}

function pathsFor(tag: string): string[] {
  const cached = pathCache.get(tag);
  if (cached) return cached;
  const entry = loadManifest().icons[tag];
  if (!entry) throw new Error(`manifest has no icon for tag "${tag}"`);
  const svg = readFileSync(new URL(entry.file, iconsDir), "utf8");
  const paths = [...svg.matchAll(/<path d="([^"]+)"\/>/g)].map((m) => m[1]!);
  pathCache.set(tag, paths);
  return paths;
}

/** Sketchy rectangle used by the sanctioned "box + label" fallback. */
const FALLBACK_BOX_PATHS = [
  "M 16 30 L 84 28 L 83 72 L 17 73 Z",
];

/**
 * assetTag → stroke path data. Never throws: exact tag → synonym →
 * "box + label" fallback (the one sanctioned quiet-ish fallback; it logs).
 */
export function resolveAsset(requestedTag: string): ResolvedAsset {
  const tag = requestedTag.trim().toLowerCase();
  const m = loadManifest();
  if (m.icons[tag]) {
    const paths = pathsFor(tag);
    return { tag, paths, fillPaths: fillPathsFor(tag, paths), matched: "exact" };
  }
  const viaSynonym = synonymIndex?.get(tag);
  if (viaSynonym) {
    const paths = pathsFor(viaSynonym);
    return {
      tag: viaSynonym,
      paths,
      fillPaths: fillPathsFor(viaSynonym, paths),
      matched: "synonym",
    };
  }
  warn(
    "assets",
    `no icon or synonym for tag "${requestedTag}" — using box+label fallback`,
  );
  return {
    tag: requestedTag,
    paths: FALLBACK_BOX_PATHS,
    fillPaths: [],
    matched: "fallback",
    label: requestedTag,
  };
}

function fillPathsFor(tag: string, paths: string[]): string[] {
  const indices = loadManifest().icons[tag]?.fill ?? [];
  return indices.flatMap((i) => (paths[i] !== undefined ? [paths[i]] : []));
}
