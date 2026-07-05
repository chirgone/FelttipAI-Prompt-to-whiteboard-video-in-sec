import { StageError, warn } from "../errors.js";
import { complete, extractJSON } from "../llm.js";
import {
  plannerRetryPrompt,
  plannerSystemPrompt,
  plannerUserPrompt,
} from "../prompts/planner.js";
import {
  ScenePlanSchema,
  type PlanOptions,
  type ScenePlan,
  type SourceDocument,
} from "../schemas.js";
import { countWords } from "./ingest.js";

export async function plan(
  doc: SourceDocument,
  options: PlanOptions,
): Promise<ScenePlan> {
  const system = plannerSystemPrompt(options);
  const user = plannerUserPrompt(doc, options);

  const first = await complete({ stage: "plan", system, user, json: true });
  let parsed = ScenePlanSchema.safeParse(extractJSON(first, "plan"));

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    warn("plan", `ScenePlan failed validation, retrying once:\n${errors}`);
    const second = await complete({
      stage: "plan",
      system,
      user: `${user}\n\n${plannerRetryPrompt(first, errors)}`,
      json: true,
    });
    parsed = ScenePlanSchema.safeParse(extractJSON(second, "plan"));
    if (!parsed.success) {
      throw new StageError(
        "plan",
        `ScenePlan failed validation after retry:\n${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("\n")}`,
      );
    }
  }

  return normalize(parsed.data, options);
}

/** Deterministic post-validation repairs; each one logs. */
function normalize(scenePlan: ScenePlan, options: PlanOptions): ScenePlan {
  if (scenePlan.aspectRatio !== options.aspectRatio) {
    warn(
      "plan",
      `model chose aspectRatio ${scenePlan.aspectRatio}, forcing requested ${options.aspectRatio}`,
    );
    scenePlan = { ...scenePlan, aspectRatio: options.aspectRatio };
  }
  for (const scene of scenePlan.scenes) {
    const wordCount = countWords(scene.narration);
    for (const el of scene.elements) {
      if (el.revealAtWord !== undefined && el.revealAtWord >= wordCount) {
        warn(
          "plan",
          `${scene.id}/${el.id}: revealAtWord ${el.revealAtWord} ≥ narration word count ${wordCount}, clamping`,
        );
        el.revealAtWord = wordCount - 1;
      }
    }
    // Drawing order must follow reveal order regardless of what the model emitted.
    scene.elements.sort((a, b) => (a.revealAtWord ?? 0) - (b.revealAtWord ?? 0));
  }
  return scenePlan;
}
