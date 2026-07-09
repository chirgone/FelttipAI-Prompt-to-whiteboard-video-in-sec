/**
 * Whiteboard-marker palette. The planner names colors; the engine resolves
 * them to hex once, so the TimedPlan (and thus the renderer) never sees a
 * palette name. Yellow is intended for washes/highlights — the planner prompt
 * steers it away from ink strokes, where it's unreadable on paper.
 */
export const PALETTE = {
  ink: "#1F2933",
  blue: "#2563EB",
  red: "#DC2626",
  green: "#059669",
  orange: "#EA580C",
  purple: "#7C3AED",
  teal: "#0D9488",
  yellow: "#FACC15",
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
