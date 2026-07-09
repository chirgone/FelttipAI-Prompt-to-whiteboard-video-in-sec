export const THEME = {
  /** Near-white board — the Simi reference is high-contrast clean white. */
  paper: "#FFFFFF",
  ink: "#243038",
  accent: "#C0392B",
  /** Screen-space stroke width as a fraction of canvas height (non-scaling). */
  strokeWidthFactor: 0.0075,
} as const;

/** Subtle paper grain via an inline feTurbulence tile. */
export const PAPER_NOISE_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/><feColorMatrix values="0 0 0 0 0.2 0 0 0 0 0.18 0 0 0 0 0.15 0 0 0 0.05 0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>`,
  );
