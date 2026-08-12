/**
 * Generates packages/engine/assets/icons/*.svg + manifest.json from the path
 * table below. Run: pnpm --filter @felttip/engine icons
 *
 * Icon rules: viewBox 0 0 100 100, stroke paths, stroke-width 5, currentColor,
 * hand-drawn line-art feel, ~8-unit margin. `fill` lists the indices of paths
 * that form the icon's silhouette — the renderer floods those with the
 * element's palette color under the ink outline (open paths are implicitly
 * closed by canvas fill, which is exactly the blobby marker look we want).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASSET_TAGS, type AssetTag } from "../src/assets/tags.js";
import { measurePaths } from "../src/geometry.js";

// -- tiny path helpers ------------------------------------------------------
const circle = (cx: number, cy: number, r: number): string =>
  `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
const line = (x1: number, y1: number, x2: number, y2: number): string =>
  `M ${x1} ${y1} L ${x2} ${y2}`;
const poly = (...pts: number[]): string => {
  const [x0, y0, ...restPts] = pts;
  let d = `M ${x0} ${y0}`;
  for (let i = 0; i < restPts.length; i += 2) d += ` L ${restPts[i]} ${restPts[i + 1]}`;
  return d;
};
const closedPoly = (...pts: number[]): string => `${poly(...pts)} Z`;
const rect = (x: number, y: number, w: number, h: number): string =>
  closedPoly(x, y, x + w, y, x + w, y + h, x, y + h);
const rrect = (x: number, y: number, w: number, h: number, r: number): string =>
  `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} ` +
  `L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
  `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} ` +
  `L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
/** n radial spokes from radius r1 to r2 around (cx,cy). */
const rays = (cx: number, cy: number, r1: number, r2: number, n: number, phase = 0): string[] => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i * 2 * Math.PI) / n;
    out.push(
      line(
        round(cx + r1 * Math.cos(a)),
        round(cy + r1 * Math.sin(a)),
        round(cx + r2 * Math.cos(a)),
        round(cy + r2 * Math.sin(a)),
      ),
    );
  }
  return out;
};
const round = (n: number): number => Math.round(n * 10) / 10;

/** Two dot eyes + a smile arc, centered on a head at (cx, cy) of radius r. */
const face = (cx: number, cy: number, r: number): string[] => [
  line(round(cx - r * 0.35), round(cy - r * 0.15), round(cx - r * 0.35), round(cy - r * 0.1)),
  line(round(cx + r * 0.35), round(cy - r * 0.15), round(cx + r * 0.35), round(cy - r * 0.1)),
  `M ${round(cx - r * 0.45)} ${round(cy + r * 0.3)} Q ${cx} ${round(cy + r * 0.75)} ${round(cx + r * 0.45)} ${round(cy + r * 0.3)}`,
];

// -- the library ------------------------------------------------------------
const ICONS: Record<AssetTag, { paths: string[]; synonyms: string[]; fill?: number[] }> = {
  person: {
    paths: [circle(50, 30, 13), "M 24 84 Q 24 54 50 54 Q 76 54 76 84", ...face(50, 30, 13)],
    fill: [0, 1],
    synonyms: ["user", "human", "customer", "man", "woman", "individual", "employee"],
  },
  people: {
    paths: [
      circle(67, 36, 9),
      "M 56 78 Q 58 58 67 58 Q 84 58 84 78",
      circle(35, 32, 10),
      "M 16 78 Q 16 54 35 54 Q 54 54 54 78",
      ...face(35, 32, 10),
    ],
    fill: [0, 1, 2, 3],
    synonyms: ["team", "group", "users", "community", "crowd", "customers", "audience"],
  },
  "person-teaching": {
    paths: [
      rect(8, 16, 46, 32),
      line(16, 26, 46, 26),
      line(16, 36, 38, 36),
      circle(72, 36, 9),
      "M 60 84 Q 60 56 72 56 Q 84 56 84 84",
      line(63, 60, 52, 44),
      ...face(72, 36, 9),
    ],
    fill: [0, 3, 4],
    synonyms: ["teacher", "teaching", "instructor", "presenter", "explain", "lesson", "classroom"],
  },
  "person-reading": {
    paths: [
      circle(50, 26, 10),
      "M 36 84 Q 36 48 50 48 Q 64 48 64 84",
      closedPoly(30, 58, 48, 62, 48, 78, 30, 74),
      closedPoly(70, 58, 52, 62, 52, 78, 70, 74),
      ...face(50, 26, 10),
    ],
    fill: [0, 1],
    synonyms: ["reader", "student", "studying", "learner", "reading"],
  },
  "person-idea": {
    paths: [
      circle(50, 40, 10),
      "M 36 88 Q 36 60 50 60 Q 64 60 64 88",
      circle(50, 15, 8),
      line(46, 26, 54, 26),
      ...rays(50, 15, 11, 16, 5, -Math.PI / 2),
      ...face(50, 40, 10),
    ],
    fill: [0, 1],
    synonyms: ["thinker", "eureka", "inventor", "aha", "insight-person", "genius"],
  },
  "person-question": {
    paths: [
      circle(44, 34, 10),
      "M 30 86 Q 30 56 44 56 Q 58 56 58 86",
      "M 64 22 Q 64 12 73 12 Q 82 12 81 22 Q 80 28 74 31 Q 72 33 72 38",
      line(72, 45, 72, 46),
      line(40.5, 32, 40.5, 32.5),
      line(47.5, 32, 47.5, 32.5),
      line(40, 40, 48, 40),
    ],
    fill: [0, 1],
    synonyms: ["confused", "thinking", "wondering", "doubt", "puzzled", "curious"],
  },
  robot: {
    paths: [
      rrect(24, 18, 52, 34, 6),
      rect(18, 28, 6, 14),
      rect(76, 28, 6, 14),
      rect(37, 31, 8, 8),
      rect(55, 31, 8, 8),
      line(40, 45, 60, 45),
      line(50, 10, 50, 18),
      circle(50, 7, 3),
      line(50, 52, 50, 58),
      rrect(31, 58, 38, 18, 4),
      line(31, 64, 18, 58),
      line(69, 64, 82, 58),
      line(42, 76, 38, 88),
      line(58, 76, 62, 88),
      line(33, 88, 43, 88),
      line(57, 88, 67, 88),
    ],
    fill: [0, 1, 2, 3, 4, 9],
    synonyms: ["robot", "bot", "android", "machine", "automation", "ai-agent"],
  },
  lightbulb: {
    paths: [
      "M 38 62 Q 26 52 26 40 a 24 24 0 1 1 48 0 Q 74 52 62 62 L 62 70 L 38 70 Z",
      line(40, 78, 60, 78),
      line(46, 62, 46, 52),
      line(54, 62, 54, 52),
    ],
    fill: [0],
    synonyms: ["idea", "innovation", "insight", "solution", "creativity", "bulb"],
  },
  gear: {
    paths: [circle(50, 50, 26), circle(50, 50, 15), ...rays(50, 50, 26, 34, 8, Math.PI / 8)],
    fill: [0],
    synonyms: ["settings", "engine", "machine", "process", "cog", "mechanism", "automation"],
  },
  "chart-up": {
    paths: [poly(18, 18, 18, 82, 84, 82), poly(26, 70, 42, 54, 54, 62, 74, 36), poly(64, 36, 74, 36, 72, 47)],
    synonyms: ["growth", "increase", "trend", "improvement", "rising", "gains", "progress"],
  },
  "chart-down": {
    paths: [poly(18, 18, 18, 82, 84, 82), poly(26, 38, 42, 54, 54, 46, 74, 70), poly(64, 70, 74, 70, 72, 59)],
    synonyms: ["decline", "decrease", "loss", "drop", "falling", "reduction", "waste"],
  },
  money: {
    paths: [
      rrect(14, 32, 72, 38, 5),
      circle(50, 51, 9),
      line(24, 44, 24, 58),
      line(76, 44, 76, 58),
    ],
    fill: [0],
    synonyms: ["cash", "banknote", "payment", "revenue", "cost", "price", "funding", "budget"],
  },
  coin: {
    paths: [circle(50, 50, 29), "M 59 39 Q 50 32 43 39 Q 36 47 50 50 Q 64 53 57 61 Q 50 68 41 61", line(50, 28, 50, 72)],
    fill: [0],
    synonyms: ["dollar", "currency", "profit", "margin", "savings", "wealth"],
  },
  book: {
    paths: [
      "M 50 30 Q 35 21 18 26 L 18 74 Q 35 69 50 78 Q 65 69 82 74 L 82 26 Q 65 21 50 30 Z",
      line(50, 30, 50, 78),
    ],
    fill: [0],
    synonyms: ["education", "learning", "manual", "knowledge", "guide", "reading", "study"],
  },
  cloud: {
    paths: [
      "M 26 66 C 12 64 8 50 20 44 C 18 30 34 24 44 31 C 50 20 68 22 72 33 C 86 30 94 44 85 52 C 92 62 82 68 72 66 Z",
    ],
    fill: [0],
    synonyms: ["saas", "internet", "online", "hosting", "sky", "weather"],
  },
  phone: {
    paths: [rrect(33, 12, 34, 76, 7), line(45, 78, 55, 78)],
    fill: [0],
    synonyms: ["mobile", "smartphone", "app", "call", "device", "cell"],
  },
  laptop: {
    paths: [rrect(26, 24, 48, 34, 3), line(16, 70, 84, 70), poly(22, 58, 16, 70), poly(78, 58, 84, 70)],
    fill: [0],
    synonyms: ["computer", "software", "work", "developer", "screen", "pc"],
  },
  rocket: {
    paths: [
      "M 50 12 Q 64 28 64 54 L 36 54 Q 36 28 50 12 Z",
      circle(50, 38, 7),
      poly(36, 54, 26, 70, 38, 64),
      poly(64, 54, 74, 70, 62, 64),
      "M 45 70 Q 50 84 55 70",
    ],
    fill: [0, 2, 3],
    synonyms: ["launch", "startup", "fast", "growth-fast", "takeoff", "boost", "scale"],
  },
  heart: {
    paths: ["M 50 80 C 18 56 22 28 41 28 C 49 28 50 37 50 39 C 50 37 51 28 59 28 C 78 28 82 56 50 80 Z"],
    fill: [0],
    synonyms: ["love", "health", "care", "like", "passion", "wellbeing"],
  },
  clock: {
    paths: [circle(50, 50, 31), line(50, 50, 50, 31), line(50, 50, 63, 57)],
    fill: [0],
    synonyms: ["time", "schedule", "deadline", "duration", "speed", "waiting", "hour"],
  },
  calendar: {
    paths: [rrect(20, 24, 60, 56, 4), line(20, 40, 80, 40), line(35, 16, 35, 30), line(65, 16, 65, 30)],
    fill: [0],
    synonyms: ["date", "month", "planning", "appointment", "daily", "week"],
  },
  globe: {
    paths: [circle(50, 50, 31), line(19, 50, 81, 50), "M 50 19 Q 68 50 50 81 Q 32 50 50 19"],
    fill: [0],
    synonyms: ["world", "earth", "international", "global", "planet", "worldwide"],
  },
  shield: {
    paths: ["M 50 14 L 78 25 L 78 48 Q 78 72 50 86 Q 22 72 22 48 L 22 25 Z"],
    fill: [0],
    synonyms: ["security", "protection", "safety", "defense", "insurance", "trust"],
  },
  brain: {
    paths: [
      "M 50 22 Q 32 22 31 38 Q 21 42 25 54 Q 22 68 36 70 Q 40 80 50 78",
      "M 50 22 Q 68 22 69 38 Q 79 42 75 54 Q 78 68 64 70 Q 60 80 50 78",
      line(50, 22, 50, 78),
    ],
    fill: [0, 1],
    synonyms: ["intelligence", "ai", "thinking", "mind", "smart", "ml", "neural"],
  },
  magnifier: {
    paths: [circle(43, 43, 21), line(59, 59, 80, 80)],
    fill: [0],
    synonyms: ["search", "research", "analysis", "investigate", "find", "discovery", "inspect"],
  },
  checkmark: {
    paths: [poly(24, 52, 43, 70, 78, 30)],
    synonyms: ["done", "success", "correct", "yes", "complete", "approved", "valid"],
  },
  cross: {
    paths: [line(30, 30, 70, 70), line(70, 30, 30, 70)],
    synonyms: ["no", "wrong", "error", "cancel", "failure", "reject", "delete"],
  },
  star: {
    paths: [closedPoly(50, 16, 58.5, 39, 83, 39, 63.5, 54, 71, 78, 50, 63, 29, 78, 36.5, 54, 17, 39, 41.5, 39)],
    fill: [0],
    synonyms: ["favorite", "quality", "rating", "best", "premium", "excellence"],
  },
  "arrow-right": {
    paths: [line(18, 50, 76, 50), poly(60, 34, 78, 50, 60, 66)],
    fill: [1],
    synonyms: ["next", "forward", "direction", "then", "leads-to", "output"],
  },
  "arrow-cycle": {
    paths: [
      "M 71 33 A 27 27 0 0 0 26 43",
      poly(22, 30, 26, 44, 39, 39),
      "M 29 67 A 27 27 0 0 0 74 57",
      poly(78, 70, 74, 56, 61, 61),
    ],
    synonyms: ["cycle", "refresh", "repeat", "recycle", "loop", "iteration", "sync"],
  },
  "speech-bubble": {
    paths: [rrect(18, 22, 64, 40, 9), poly(38, 62, 32, 78, 52, 62)],
    fill: [0, 1],
    synonyms: ["chat", "conversation", "message", "talk", "feedback", "communication", "comment"],
  },
  building: {
    paths: [
      rect(30, 22, 40, 60),
      poly(44, 82, 44, 68, 56, 68, 56, 82),
      line(39, 32, 45, 32), line(55, 32, 61, 32),
      line(39, 44, 45, 44), line(55, 44, 61, 44),
      line(39, 56, 45, 56), line(55, 56, 61, 56),
    ],
    fill: [0],
    synonyms: ["office", "company", "business", "enterprise", "headquarters", "city"],
  },
  factory: {
    paths: [
      closedPoly(18, 80, 18, 46, 36, 56, 36, 46, 54, 56, 54, 46, 72, 56, 82, 56, 82, 80),
      poly(60, 46, 60, 26, 70, 26, 70, 51),
    ],
    fill: [0],
    synonyms: ["manufacturing", "industry", "production", "plant", "warehouse"],
  },
  tree: {
    paths: [circle(50, 38, 22), line(50, 60, 50, 84), line(38, 84, 62, 84), "M 50 72 L 40 64"],
    fill: [0],
    synonyms: ["nature", "environment", "sustainability", "forest", "green", "organic"],
  },
  leaf: {
    paths: ["M 30 72 Q 22 34 72 24 Q 82 62 42 74 Q 34 74 30 72 Z", "M 32 70 Q 48 56 66 34"],
    fill: [0],
    synonyms: ["eco", "fresh", "plant", "natural", "produce", "vegetable"],
  },
  car: {
    paths: [
      "M 14 62 L 19 49 Q 28 39 44 39 L 58 39 Q 70 41 76 51 L 86 54 L 86 62 L 14 62",
      circle(31, 66, 7),
      circle(69, 66, 7),
    ],
    fill: [0],
    synonyms: ["vehicle", "drive", "transport", "commute", "automotive"],
  },
  truck: {
    paths: [
      rect(12, 32, 46, 28),
      poly(58, 42, 74, 42, 86, 52, 86, 60, 58, 60),
      circle(28, 66, 7),
      circle(72, 66, 7),
    ],
    fill: [0, 1],
    synonyms: ["delivery", "shipping", "logistics", "freight", "transportation", "fleet"],
  },
  maze: {
    paths: [
      rect(18, 18, 64, 64),
      poly(30, 18, 30, 32, 48, 32, 48, 26, 66, 26, 66, 44),
      poly(18, 46, 36, 46, 36, 64, 54, 64, 54, 52, 72, 52),
      poly(30, 82, 30, 70, 42, 70, 42, 58),
      poly(60, 82, 60, 68, 72, 68),
    ],
    fill: [0],
    synonyms: ["maze", "pathfinding", "search-space", "route-search", "problem-space", "laberinto"],
  },
  "chess-knight": {
    paths: [
      "M 34 76 L 64 76 Q 70 76 70 70 Q 70 64 64 62 L 58 60 Q 70 50 68 36 Q 66 22 52 18 Q 44 16 38 20 L 48 32 Q 34 34 30 48 Q 28 58 34 66 Z",
      line(28, 82, 74, 82),
      line(42, 28, 52, 36),
    ],
    fill: [0],
    synonyms: ["chess", "ajedrez", "knight", "strategy", "game-tree", "minimax"],
  },
  dice: {
    paths: [
      rrect(24, 24, 52, 52, 8),
      circle(38, 38, 3),
      circle(62, 38, 3),
      circle(50, 50, 3),
      circle(38, 62, 3),
      circle(62, 62, 3),
    ],
    fill: [0, 1, 2, 3, 4, 5],
    synonyms: ["probability", "azar", "chance", "random", "odds", "bayes"],
  },
  funnel: {
    paths: [
      closedPoly(18, 22, 82, 22, 60, 48, 60, 68, 40, 78, 40, 48),
      line(32, 32, 68, 32),
    ],
    fill: [0],
    synonyms: ["filter", "classifier", "spam-filter", "bayes-filter", "triage", "filtro"],
  },
  "network-nodes": {
    paths: [
      circle(24, 50, 7),
      circle(50, 24, 7),
      circle(50, 76, 7),
      circle(76, 50, 7),
      circle(50, 50, 8),
      line(31, 50, 42, 50),
      line(58, 50, 69, 50),
      line(50, 31, 50, 42),
      line(50, 58, 50, 69),
      line(30, 46, 44, 30),
      line(56, 30, 70, 46),
      line(30, 54, 44, 70),
      line(56, 70, 70, 54),
    ],
    fill: [0, 1, 2, 3, 4],
    synonyms: ["neural-network", "nodes", "graph", "conexion", "neurons", "red-neuronal"],
  },
  layers: {
    paths: [
      closedPoly(26, 28, 50, 18, 74, 28, 50, 38),
      closedPoly(26, 48, 50, 38, 74, 48, 50, 58),
      closedPoly(26, 68, 50, 58, 74, 68, 50, 78),
    ],
    fill: [0, 1, 2],
    synonyms: ["layers", "deep-learning", "stack", "model-depth", "capas", "multi-layer"],
  },
  bank: {
    paths: [
      poly(18, 32, 50, 18, 82, 32),
      line(22, 82, 78, 82),
      line(28, 78, 28, 42),
      line(42, 78, 42, 42),
      line(58, 78, 58, 42),
      line(72, 78, 72, 42),
      line(24, 42, 76, 42),
    ],
    synonyms: ["bank", "banca", "finance", "financial", "institution", "branch"],
  },
  cart: {
    paths: [
      poly(20, 28, 28, 28, 34, 60, 74, 60),
      line(38, 46, 72, 46),
      line(36, 38, 70, 38),
      line(40, 60, 36, 70),
      line(66, 60, 62, 70),
      circle(42, 78, 5),
      circle(62, 78, 5),
    ],
    synonyms: ["retail", "shopping", "store-cart", "ecommerce", "basket", "carrito"],
  },
  hospital: {
    paths: [
      rect(24, 18, 52, 64),
      rect(44, 30, 12, 24),
      line(50, 30, 50, 54),
      line(44, 42, 56, 42),
      poly(44, 82, 44, 66, 56, 66, 56, 82),
      line(34, 62, 40, 62),
      line(60, 62, 66, 62),
    ],
    fill: [0, 1],
    synonyms: ["health", "salud", "medical", "clinic", "patient-care", "hospitalario"],
  },
  bolt: {
    paths: [closedPoly(56, 14, 34, 50, 50, 50, 42, 86, 66, 46, 50, 46)],
    fill: [0],
    synonyms: ["energy", "energia", "electricity", "power-grid", "lightning", "electrico"],
  },
  antenna: {
    paths: [
      poly(50, 18, 38, 78, 62, 78),
      line(32, 86, 68, 86),
      "M 34 44 Q 50 30 66 44",
      "M 28 34 Q 50 16 72 34",
      "M 40 54 Q 50 46 60 54",
    ],
    synonyms: ["telco", "antenna", "radio", "cell-tower", "signal-tower", "telecom"],
  },
  compass: {
    paths: [
      circle(50, 50, 30),
      closedPoly(50, 24, 58, 50, 50, 76, 42, 50),
      line(50, 14, 50, 20),
      line(50, 80, 50, 86),
      line(14, 50, 20, 50),
      line(80, 50, 86, 50),
    ],
    fill: [0, 1],
    synonyms: ["navigation", "compass", "direction", "route", "orientation", "norte"],
  },
  email: {
    paths: [rect(16, 28, 68, 44), poly(16, 30, 50, 54, 84, 30)],
    fill: [0],
    synonyms: ["mail", "newsletter", "inbox", "contact", "letter", "notification-mail"],
  },
  lock: {
    paths: [
      "M 36 44 L 36 32 A 14 14 0 0 1 64 32 L 64 44",
      rrect(28, 44, 44, 34, 5),
      line(50, 56, 50, 66),
    ],
    fill: [1],
    synonyms: ["password", "private", "secure", "encryption", "confidential", "protected"],
  },
  key: {
    paths: [circle(30, 50, 12), line(42, 50, 82, 50), line(68, 50, 68, 61), line(80, 50, 80, 63)],
    fill: [0],
    synonyms: ["access", "unlock", "credential", "login", "secret", "permission"],
  },
  "graph-bar": {
    paths: [poly(18, 18, 18, 82, 84, 82), rect(27, 60, 12, 22), rect(45, 44, 12, 38), rect(63, 30, 12, 52)],
    fill: [1, 2, 3],
    synonyms: ["statistics", "metrics", "data", "comparison", "report", "kpi", "analytics"],
  },
  "pie-chart": {
    paths: [circle(50, 50, 29), line(50, 50, 50, 21), line(50, 50, 75, 64)],
    fill: [0],
    synonyms: ["share", "portion", "percentage", "segment", "distribution", "split"],
  },
  target: {
    paths: [circle(50, 50, 29), circle(50, 50, 18), circle(50, 50, 7)],
    fill: [2],
    synonyms: ["goal", "aim", "objective", "focus", "bullseye", "precision", "mission"],
  },
  trophy: {
    paths: [
      "M 34 20 L 66 20 L 64 46 Q 61 58 50 58 Q 39 58 36 46 Z",
      "M 34 24 Q 18 26 26 40 Q 30 46 37 44",
      "M 66 24 Q 82 26 74 40 Q 70 46 63 44",
      line(50, 58, 50, 70),
      line(38, 78, 62, 78),
      line(42, 70, 58, 70),
    ],
    fill: [0],
    synonyms: ["win", "award", "achievement", "champion", "prize", "victory", "winner"],
  },
  flag: {
    paths: [
      line(28, 14, 28, 86),
      "M 28 20 Q 44 12 56 20 Q 68 28 78 20 L 78 46 Q 68 54 56 46 Q 44 38 28 46",
    ],
    fill: [1],
    synonyms: ["milestone", "goal-reached", "country", "finish", "marker", "checkpoint"],
  },
  fire: {
    paths: [
      "M 50 16 Q 62 32 58 44 Q 66 40 68 30 Q 80 48 73 64 Q 66 80 50 80 Q 34 80 27 64 Q 20 48 34 36 Q 38 46 42 42 Q 36 28 50 16 Z",
    ],
    fill: [0],
    synonyms: ["hot", "urgent", "trending", "burn", "energy", "popular", "viral"],
  },
  sun: {
    paths: [circle(50, 50, 16), ...rays(50, 50, 24, 33, 8)],
    fill: [0],
    synonyms: ["day", "bright", "summer", "solar", "morning", "light", "warm"],
  },
  database: {
    paths: [
      "M 26 28 a 24 9 0 1 0 48 0 a 24 9 0 1 0 -48 0",
      line(26, 28, 26, 72),
      line(74, 28, 74, 72),
      "M 26 50 a 24 9 0 0 0 48 0",
      "M 26 72 a 24 9 0 0 0 48 0",
    ],
    synonyms: ["storage", "records", "data-store", "warehouse-data", "sql", "archive"],
  },
  server: {
    paths: [
      rrect(22, 22, 56, 22, 4),
      rrect(22, 56, 56, 22, 4),
      line(32, 33, 38, 33),
      line(32, 67, 38, 67),
      line(62, 33, 68, 33),
      line(62, 67, 68, 67),
    ],
    fill: [0, 1],
    synonyms: ["backend", "infrastructure", "hosting-server", "api", "compute", "system"],
  },
  question: {
    paths: ["M 37 34 Q 37 18 51 18 Q 66 18 64 34 Q 63 43 53 47 Q 49 50 49 58", line(49, 70, 49, 72)],
    synonyms: ["why", "unknown", "help", "faq", "confusion", "problem", "mystery"],
  },
  handshake: {
    paths: [
      poly(12, 42, 30, 36, 48, 48, 60, 40),
      poly(88, 42, 70, 36, 60, 40),
      poly(30, 36, 30, 60, 44, 68),
      poly(70, 36, 70, 60, 56, 68),
      poly(44, 52, 50, 58, 56, 52),
    ],
    synonyms: ["deal", "partnership", "agreement", "contract", "collaboration", "alliance"],
  },
  scales: {
    paths: [
      line(50, 18, 50, 76),
      line(26, 28, 74, 28),
      line(36, 82, 64, 82),
      poly(26, 28, 16, 50), poly(26, 28, 36, 50),
      "M 14 50 A 12 8 0 0 0 38 50",
      poly(74, 28, 64, 50), poly(74, 28, 84, 50),
      "M 62 50 A 12 8 0 0 0 86 50",
    ],
    synonyms: ["justice", "balance", "law", "fairness", "legal", "compliance", "regulation"],
  },
  wrench: {
    paths: [
      "M 62 20 A 16 16 0 1 0 78 38 L 70 30 L 70 20 L 62 20",
      line(62, 38, 32, 68),
      circle(28, 72, 8),
    ],
    fill: [0, 2],
    synonyms: ["tool", "fix", "repair", "maintenance", "build", "configure"],
  },
  "map-pin": {
    paths: ["M 50 84 Q 29 55 29 41 a 21 21 0 1 1 42 0 Q 71 55 50 84 Z", circle(50, 41, 8)],
    fill: [0],
    synonyms: ["location", "place", "store", "address", "destination", "site", "local"],
  },
  bell: {
    paths: [
      "M 32 62 Q 32 32 50 28 Q 68 32 68 62",
      line(24, 62, 76, 62),
      line(50, 20, 50, 28),
      "M 44 70 Q 50 76 56 70",
    ],
    fill: [0],
    synonyms: ["notification", "alert", "reminder", "alarm", "announce"],
  },
  gift: {
    paths: [
      rect(24, 44, 52, 36),
      rect(20, 32, 60, 12),
      line(50, 32, 50, 80),
      "M 50 32 Q 36 16 30 24 Q 26 32 50 32",
      "M 50 32 Q 64 16 70 24 Q 74 32 50 32",
    ],
    fill: [0, 1],
    synonyms: ["present", "bonus", "reward", "free", "surprise", "offer"],
  },
  battery: {
    paths: [rrect(14, 36, 60, 28, 4), poly(74, 44, 82, 44, 82, 56, 74, 56), line(26, 44, 26, 56), line(38, 44, 38, 56)],
    fill: [0],
    synonyms: ["power", "charge", "energy-store", "capacity", "sensor-power"],
  },
  wifi: {
    paths: [
      "M 24 46 Q 50 24 76 46",
      "M 33 57 Q 50 42 67 57",
      "M 42 68 Q 50 61 58 68",
      circle(50, 78, 2),
    ],
    synonyms: ["wireless", "signal", "connectivity", "network", "iot", "online-signal"],
  },
  eye: {
    paths: ["M 14 50 Q 50 22 86 50 Q 50 78 14 50 Z", circle(50, 50, 11)],
    fill: [1],
    synonyms: ["vision", "watch", "visibility", "observe", "monitor", "tracking", "view"],
  },
  "thumbs-up": {
    paths: [
      rect(16, 48, 12, 32),
      "M 28 52 L 40 40 Q 46 34 45 26 Q 45 20 51 22 Q 56 25 55 34 L 52 46 L 70 46 Q 78 46 76 54 L 71 74 Q 70 80 62 80 L 34 80 Q 28 80 28 74 Z",
    ],
    fill: [0, 1],
    synonyms: ["approval", "good", "positive", "endorse", "satisfied", "agree"],
  },
  document: {
    paths: [
      closedPoly(28, 14, 58, 14, 74, 30, 74, 86, 28, 86),
      poly(58, 14, 58, 30, 74, 30),
      line(37, 46, 65, 46),
      line(37, 58, 65, 58),
      line(37, 70, 55, 70),
    ],
    fill: [0],
    synonyms: ["file", "page", "report-doc", "paper", "contract-doc", "invoice", "text"],
  },
  tag: {
    paths: [
      "M 18 40 L 40 18 L 78 18 L 78 50 L 50 78 L 18 46 Z",
      circle(57, 30, 4),
    ],
    fill: [0, 1],
    synonyms: ["tag", "label", "category", "class", "annotation", "labeled"],
  },
  box: {
    paths: [
      closedPoly(22, 36, 50, 24, 78, 36, 78, 66, 50, 78, 22, 66),
      poly(22, 36, 50, 48, 78, 36),
      line(50, 48, 50, 78),
    ],
    fill: [0],
    synonyms: ["package", "crate", "product", "shipment", "container", "inventory", "parcel"],
  },
  warning: {
    paths: [closedPoly(50, 18, 84, 78, 16, 78), line(50, 40, 50, 58), line(50, 66, 50, 68)],
    fill: [0],
    synonyms: ["risk", "danger", "caution", "alert-warning", "issue", "critical"],
  },
  snowflake: {
    paths: [
      line(50, 16, 50, 84),
      line(21, 33, 79, 67),
      line(21, 67, 79, 33),
      poly(42, 22, 50, 28, 58, 22),
      poly(42, 78, 50, 72, 58, 78),
      poly(20, 44, 27, 36, 18, 30),
      poly(80, 44, 73, 36, 82, 30),
    ],
    synonyms: ["cold", "freeze", "winter", "cooling", "refrigeration", "frozen", "chill"],
  },
  thermometer: {
    paths: [
      "M 44 64 L 44 22 A 6 6 0 0 1 56 22 L 56 64",
      circle(50, 72, 11),
      line(50, 64, 50, 38),
      line(60, 30, 68, 30),
      line(60, 42, 68, 42),
      line(60, 54, 68, 54),
    ],
    fill: [1],
    synonyms: ["temperature", "heat", "climate", "fever", "degrees", "measure-temp"],
  },
  "api": {
    paths: [
      "M 38 25 L 18 50 L 38 75",
      "M 62 25 L 82 50 L 62 75",
      "M 55 22 L 45 78",
    ],
    synonyms: ["api", "endpoint", "integracion", "interface", "servicio-web", "conector"],
  },
  "bug": {
    paths: [
      "M 38 38 A 12 14 0 1 1 62 38 L 62 62 A 12 14 0 1 1 38 62 Z",
      "M 42 30 L 34 20",
      "M 58 30 L 66 20",
      "M 38 42 L 24 36",
      "M 38 50 L 22 50",
      "M 38 58 L 24 64",
      "M 62 42 L 76 36",
      "M 62 50 L 78 50",
      "M 62 58 L 76 64",
    ],
    fill: [0],
    synonyms: ["bug", "malware", "virus", "exploit", "codigo-malicioso", "gusano", "troyano", "infeccion"],
  },
  "certificate": {
    paths: [
      "M 22 15 L 78 15 Q 82 15 82 19 L 82 60 Q 82 64 78 64 L 22 64 Q 18 64 18 60 L 18 19 Q 18 15 22 15 Z",
      "M 28 28 L 72 28",
      "M 28 38 L 72 38",
      "M 28 48 L 55 48",
      "M 42 64 L 38 88 L 50 80 L 62 88 L 58 64",
    ],
    fill: [0],
    synonyms: ["certificate", "certificado", "cumplimiento", "compliance", "auditoria", "norma", "acreditacion"],
  },
  "cloud-lock": {
    paths: [
      "M 22 50 C 10 48 7 37 17 32 C 15 20 29 15 38 21 C 43 12 58 14 62 23 C 74 20 81 32 73 39 C 79 47 71 52 62 50 Z",
      "M 44 62 L 44 55 A 6 6 0 0 1 56 55 L 56 62",
      "M 41 62 L 59 62 Q 62 62 62 65 L 62 78 Q 62 81 59 81 L 41 81 Q 38 81 38 78 L 38 65 Q 38 62 41 62 Z",
    ],
    fill: [0],
    synonyms: ["cloud-security", "nube-segura", "cifrado-nube", "datos-protegidos", "seguridad-cloud"],
  },
  "fingerprint": {
    paths: [
      "M 50 15 Q 78 15 78 45 L 78 60 Q 78 82 58 85",
      "M 50 15 Q 22 15 22 45 L 22 65",
      "M 34 78 Q 26 70 26 55 L 26 42 Q 26 24 50 24 Q 70 24 70 42 L 70 60",
      "M 40 78 Q 34 70 34 58 L 34 42 Q 34 32 50 32 Q 62 32 62 42 L 62 58",
      "M 48 68 Q 42 62 42 52 L 42 44 Q 42 40 50 40 Q 54 40 54 44 L 54 52 Q 54 58 50 58",
    ],
    synonyms: ["fingerprint", "huella", "biometria", "identidad", "dato-personal", "pii", "autenticacion"],
  },
  "firewall": {
    paths: [
      "M 12 40 L 88 40 L 88 85 L 12 85 Z",
      "M 12 55 L 88 55",
      "M 12 70 L 88 70",
      "M 37 40 L 37 55",
      "M 62 40 L 62 55",
      "M 24 55 L 24 70",
      "M 50 55 L 50 70",
      "M 75 55 L 75 70",
      "M 37 70 L 37 85",
      "M 62 70 L 62 85",
    ],
    fill: [0],
    synonyms: ["firewall", "cortafuegos", "perimetro", "bloqueo", "filtrado", "control-preventivo"],
  },
  "hash": {
    paths: [
      "M 35 20 L 25 80",
      "M 65 20 L 55 80",
      "M 18 38 L 78 38",
      "M 14 62 L 74 62",
    ],
    synonyms: ["hash", "integridad", "checksum", "resumen", "verificacion", "huella-digital"],
  },
  "neural-net": {
    paths: [
      "M 16 32 A 4 4 0 1 0 24 32 A 4 4 0 1 0 16 32 Z",
      "M 16 68 A 4 4 0 1 0 24 68 A 4 4 0 1 0 16 68 Z",
      "M 46 20 A 4 4 0 1 0 54 20 A 4 4 0 1 0 46 20 Z",
      "M 46 50 A 4 4 0 1 0 54 50 A 4 4 0 1 0 46 50 Z",
      "M 46 80 A 4 4 0 1 0 54 80 A 4 4 0 1 0 46 80 Z",
      "M 76 35 A 4 4 0 1 0 84 35 A 4 4 0 1 0 76 35 Z",
      "M 76 65 A 4 4 0 1 0 84 65 A 4 4 0 1 0 76 65 Z",
      "M 24 32 L 46 20",
      "M 24 32 L 46 50",
      "M 24 68 L 46 50",
      "M 24 68 L 46 80",
      "M 54 20 L 76 35",
      "M 54 50 L 76 35",
      "M 54 50 L 76 65",
      "M 54 80 L 76 65",
    ],
    fill: [0],
    synonyms: ["neural-net", "red-neuronal", "feedforward", "capas", "deep-learning", "perceptron"],
  },
  "padlock-open": {
    paths: [
      "M 36 44 L 36 26 A 14 14 0 0 1 62 15",
      "M 33 44 L 67 44 Q 72 44 72 49 L 72 73 Q 72 78 67 78 L 33 78 Q 28 78 28 73 L 28 49 Q 28 44 33 44 Z",
      "M 50 56 L 50 66",
    ],
    synonyms: ["padlock-open", "candado-abierto", "vulnerabilidad", "sin-proteccion", "expuesto", "falsa-seguridad"],
  },
  "phone-key": {
    paths: [
      "M 32 12 L 52 12 Q 58 12 58 18 L 58 70 Q 58 76 52 76 L 32 76 Q 26 76 26 70 L 26 18 Q 26 12 32 12 Z",
      "M 38 66 L 46 66",
      "M 68 60 A 8 8 0 1 0 68 76 A 8 8 0 1 0 68 60 Z",
      "M 74 68 L 88 68",
      "M 82 68 L 82 74",
      "M 88 68 L 88 74",
    ],
    fill: [0],
    synonyms: ["phone-key", "mfa", "doble-factor", "autenticacion-movil", "otp", "segundo-factor"],
  },
  "puzzle-piece": {
    paths: [
      "M 15 15 L 42 15 Q 42 5 52 5 Q 62 5 62 15 L 85 15 L 85 42 Q 95 42 95 52 Q 95 62 85 62 L 85 85 L 15 85 Z",
    ],
    fill: [0],
    synonyms: ["puzzle", "pieza", "modular", "integracion", "encaje", "interoperabilidad", "componente"],
  },
  "router": {
    paths: [
      "M 20 55 L 80 55 Q 84 55 84 59 L 84 75 Q 84 79 80 79 L 20 79 Q 16 79 16 75 L 16 59 Q 16 55 20 55 Z",
      "M 32 67 L 38 67",
      "M 50 42 L 50 20",
      "M 38 42 Q 38 34 32 26",
      "M 62 42 Q 62 34 68 26",
    ],
    fill: [0],
    synonyms: ["router", "enrutador", "gateway", "red", "trafico", "enrutamiento"],
  },
  "server-rack": {
    paths: [
      "M 30 10 L 70 10 Q 74 10 74 14 L 74 90 Q 74 94 70 94 L 30 94 Q 26 94 26 90 L 26 14 Q 26 10 30 10 Z",
      "M 26 28 L 74 28",
      "M 26 46 L 74 46",
      "M 26 64 L 74 64",
      "M 26 82 L 74 82",
      "M 33 19 L 40 19",
      "M 33 37 L 40 37",
      "M 33 55 L 40 55",
      "M 33 73 L 40 73",
    ],
    fill: [0],
    synonyms: ["server-rack", "rack", "centro-de-datos", "datacenter", "infraestructura", "servidores"],
  },
  "siren-alert": {
    paths: [
      "M 32 62 Q 32 32 50 28 Q 68 32 68 62 Z",
      "M 24 62 L 76 62",
      "M 50 18 L 50 26",
      "M 20 40 L 12 35",
      "M 80 40 L 88 35",
      "M 16 55 L 8 55",
      "M 84 55 L 92 55",
    ],
    fill: [0],
    synonyms: ["siren", "alerta", "alarma", "incidente", "deteccion", "emergencia", "aviso"],
  },
  "vpn-tunnel": {
    paths: [
      "M 12 75 L 12 42 A 38 33 0 0 1 88 42 L 88 75",
      "M 30 75 L 30 50 A 20 17 0 0 1 70 50 L 70 75",
      "M 12 75 L 30 75",
      "M 70 75 L 88 75",
    ],
    synonyms: ["vpn", "tunel", "cifrado-transito", "conexion-segura", "acceso-remoto"],
  },
};

// -- generation -------------------------------------------------------------
const outDir = fileURLToPath(new URL("../assets/icons/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const missing = ASSET_TAGS.filter((t) => !(t in ICONS));
if (missing.length) throw new Error(`tags without icons: ${missing.join(", ")}`);

const manifest: Record<string, { file: string; synonyms: string[]; fill: number[] }> = {};
for (const tag of ASSET_TAGS) {
  const { paths, synonyms, fill = [] } = ICONS[tag];
  // Catch degenerate geometry at authoring time, not at video time.
  measurePaths(paths);
  const bad = fill.filter((i) => i < 0 || i >= paths.length);
  if (bad.length) throw new Error(`${tag}: fill indices out of range: ${bad.join(", ")}`);
  const body = paths.map((d) => `  <path d="${d}"/>`).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">\n${body}\n</svg>\n`;
  writeFileSync(path.join(outDir, `${tag}.svg`), svg);
  manifest[tag] = { file: `${tag}.svg`, synonyms, fill };
}
writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify({ strokeWidth: 5, viewBox: "0 0 100 100", icons: manifest }, null, 2),
);
console.log(`generated ${ASSET_TAGS.length} icons + manifest.json → ${outDir}`);
