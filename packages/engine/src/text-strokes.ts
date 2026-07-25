import { createRequire } from "node:module";
import { StageError } from "./errors.js";

/**
 * Text → single-stroke pen paths via the EMS/Hershey plotter fonts bundled in
 * `hersheytext` (free). Output is element-local: cap height spans y 0→100
 * (baseline at 100, descenders hang below — the renderer's svg has
 * overflow visible), width varies per string (`viewBoxWidth`).
 */

interface HersheyGlyph {
  type: string;
  width: number | string;
  d?: string;
}
interface HersheyModule {
  renderTextArray: (
    text: string,
    options: { font?: string },
  ) => HersheyGlyph[] | false;
}

const require = createRequire(import.meta.url);
const hershey = require("hersheytext") as HersheyModule;

/** Serif single-stroke font -- comparado visualmente contra sans_med, sans_1 y
 * ems_tech (2026-07-25): las 3 sans se leen "Comic Sans", esta se lee como
 * texto tipografiado real. Verificado con tildes, ñ, ¿, ¡ (todos con trazo). */
const FONT = "hershey_serif_med";
/** Font units from baseline to cap top for este font (medido desde el glifo "H": 0-662). */
const CAP_HEIGHT = 662;
const SCALE = 100 / CAP_HEIGHT;
/** Extra advance between glyphs, in font units. */
const LETTER_SPACING = 60;

export interface TextStrokes {
  paths: string[];
  viewBoxWidth: number;
}

export function textToStrokePaths(text: string): TextStrokes {
  const glyphs = hershey.renderTextArray(text, { font: FONT });
  if (!glyphs) {
    throw new StageError("assets", `hersheytext could not render font "${FONT}"`);
  }
  const paths: string[] = [];
  let xCursor = 0;
  for (const glyph of glyphs) {
    if (glyph.d) {
      for (const stroke of glyph.d.split("M").filter((s) => s.trim())) {
        paths.push(transformStroke(`M${stroke}`, xCursor));
      }
    }
    const advance = Number(glyph.width);
    xCursor += (Number.isFinite(advance) ? advance : CAP_HEIGHT * 0.4) + LETTER_SPACING;
  }
  const width = Math.max(1, (xCursor - LETTER_SPACING) * SCALE);
  return { paths, viewBoxWidth: Math.round(width * 10) / 10 };
}

/** Flip y (font is y-up), scale to cap=100, advance by the x cursor. */
function transformStroke(d: string, xOffset: number): string {
  const tokens = d.match(/[ML]|-?\d+(?:\.\d+)?/g) ?? [];
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t === "M" || t === "L") {
      const x = Number(tokens[i + 1]);
      const y = Number(tokens[i + 2]);
      out.push(
        `${t} ${round((x + xOffset) * SCALE)} ${round((CAP_HEIGHT - y) * SCALE)}`,
      );
      i += 3;
    } else {
      i += 1;
    }
  }
  return out.join(" ");
}

/** Uniformly scale + translate path data (M/L polylines only). */
export function fitStrokes(
  paths: string[],
  scale: number,
  dx: number,
  dy: number,
): string[] {
  return paths.map((d) => {
    const tokens = d.match(/[ML]|-?\d+(?:\.\d+)?/g) ?? [];
    const out: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const t = tokens[i]!;
      if (t === "M" || t === "L") {
        out.push(
          `${t} ${round(Number(tokens[i + 1]) * scale + dx)} ${round(Number(tokens[i + 2]) * scale + dy)}`,
        );
        i += 3;
      } else {
        i += 1;
      }
    }
    return out.join(" ");
  });
}

const round = (n: number): number => Math.round(n * 10) / 10;
