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
