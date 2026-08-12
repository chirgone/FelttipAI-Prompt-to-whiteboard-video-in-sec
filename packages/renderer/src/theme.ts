export interface Theme {
  paper: string;
  ink: string;
  accent: string;
  /** Screen-space stroke width as a fraction of canvas height (non-scaling). */
  strokeWidthFactor: number;
}

export const THEMES = {
  /** Pizarra negra -- pedido por Ivan 2026-07-24 (era blanco puro, luego verde oscuro). */
  blackboard: {
    paper: "#0D0D0D",
    ink: "#F4F1E8",
    accent: "#FFC857",
    strokeWidthFactor: 0.0075,
  },
  /** Cuaderno crema: conserva contraste alto pero se siente menos "dark mode". */
  "ivory-notebook": {
    paper: "#F5EEDC",
    ink: "#1F1A17",
    accent: "#B86A27",
    strokeWidthFactor: 0.0072,
  },
  /** Blueprint: look técnico para piezas de implementación, arquitectura o networking. */
  blueprint: {
    paper: "#0F2747",
    ink: "#EAF4FF",
    accent: "#7DD3FC",
    strokeWidthFactor: 0.0073,
  },
} as const satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

export const DEFAULT_THEME: ThemeName = "blackboard";

export function resolveTheme(name: string | undefined): Theme {
  if (!name) return THEMES[DEFAULT_THEME];
  return THEMES[name as ThemeName] ?? THEMES[DEFAULT_THEME];
}

export const THEME = resolveTheme(process.env.FELTTIP_THEME);
