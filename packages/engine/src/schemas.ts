import { z } from "zod";

// ---------- Stage 1: Ingest ----------

export const SourceDocumentSchema = z.object({
  title: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      text: z.string(),
    }),
  ),
  rawText: z.string(),
});
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

// ---------- Stage 2: Plan ----------
// Golden rule: this is the ONLY shape the LLM is allowed to output.

export const ElementSchema = z.object({
  id: z.string(),
  kind: z.enum(["icon", "text", "arrow", "line", "box", "underline", "number"]),
  assetTag: z.string().optional(),
  text: z.string().optional(),
  position: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  /** For arrow/line: the connector's end point (position is the start). */
  to: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .optional(),
  size: z.number().min(0).max(1),
  revealAtWord: z.number().int().min(0).optional(),
  emphasis: z.enum(["none", "circle", "underline"]).optional(),
});
export type Element = z.infer<typeof ElementSchema>;

export const SceneSchema = z.object({
  id: z.string(),
  narration: z.string().min(1),
  durationHintSec: z.number().positive(),
  layout: z.enum(["center", "grid", "timeline", "split", "flow"]),
  elements: z.array(ElementSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const ScenePlanSchema = z.object({
  title: z.string(),
  language: z.string(),
  aspectRatio: AspectRatioSchema,
  scenes: z.array(SceneSchema).min(1),
});
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

export const PlanOptionsSchema = z.object({
  durationMin: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)])
    .default(2),
  language: z.string().default("en"),
  aspectRatio: AspectRatioSchema.default("16:9"),
  voice: z.string().default("en-US-GuyNeural"),
});
export type PlanOptions = z.infer<typeof PlanOptionsSchema>;

export const ASPECT_DIMENSIONS: Record<
  AspectRatio,
  { width: number; height: number }
> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};
