import OpenAI from "openai";
import { StageError, type StageName } from "./errors.js";

// OpenRouter is the ONLY paid dependency in the whole project.
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export function getModel(): string {
  return process.env.LLM_MODEL ?? DEFAULT_MODEL;
}

let client: OpenAI | undefined;

export function llmClient(stage: StageName): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new StageError(
      stage,
      "OPENROUTER_API_KEY is not set — copy .env.example to .env and add your key",
    );
  }
  client ??= new OpenAI({ baseURL: OPENROUTER_BASE_URL, apiKey });
  return client;
}

export async function complete(opts: {
  stage: StageName;
  system: string;
  user: string;
  json?: boolean;
}): Promise<string> {
  // Cap max_tokens so free-tier OpenRouter accounts (limited credit balance)
  // don't get rejected with 402. Override via LLM_MAX_TOKENS env if needed.
  const maxTokens = process.env.LLM_MAX_TOKENS
    ? Number(process.env.LLM_MAX_TOKENS)
    : 32000;
  const res = await llmClient(opts.stage).chat.completions.create({
    model: getModel(),
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
  });
  const text = res.choices[0]?.message?.content;
  if (!text) {
    throw new StageError(opts.stage, `LLM returned an empty response (model ${getModel()})`);
  }
  return text;
}

/** Pull a JSON object out of an LLM reply that may wrap it in prose/fences. */
export function extractJSON(text: string, stage: StageName): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new StageError(stage, `LLM reply contains no JSON object:\n${text.slice(0, 500)}`);
  }
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (err) {
    throw new StageError(stage, "LLM reply is not valid JSON", { cause: err });
  }
}
