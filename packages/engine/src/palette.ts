/**
 * Whiteboard-marker palette. The planner names colors; the engine resolves
 * them to hex once, so the TimedPlan (and thus the renderer) never sees a
 * palette name. Yellow is intended for washes/highlights — the planner prompt
 * steers it away from ink strokes, where it's unreadable on paper.
 */
export const PALETTE = {
  /** Tiza blanca -- default para pizarra oscura (era #1F2933, ilegible en fondo oscuro). */
  ink: "#F4F1E8",
  blue: "#7DB8FF",
  red: "#FF8A80",
  green: "#6FE3B4",
  orange: "#FFB86B",
  purple: "#C9A6FF",
  teal: "#5FE0D0",
  yellow: "#FFE066",
} as const;

export type PaletteColor = keyof typeof PALETTE;

export const PALETTE_NAMES = Object.keys(PALETTE) as [
  PaletteColor,
  ...PaletteColor[],
];

export function resolveColor(name: PaletteColor | undefined): string {
  return PALETTE[name ?? "ink"];
}

/** Emphasis marks: element's own color when it has one, else marker red. */
export function emphasisColor(elementColor: PaletteColor | undefined): string {
  return elementColor && elementColor !== "ink"
    ? PALETTE[elementColor]
    : PALETTE.red;
}

/** Ink strokes ride slightly translucent so overlaps darken like real marker. */
export const INK_ALPHA = 0.92;
/** Shade washes are low-alpha and drawn in multiply mode — highlighter feel. */
export const WASH_ALPHA = 0.22;
