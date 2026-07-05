import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { StageError, warn } from "../errors.js";
import { complete } from "../llm.js";
import type { SourceDocument } from "../schemas.js";

/** One LLM summarization pass kicks in above this budget (~8k words). */
const WORD_BUDGET = 8000;

export interface IngestInput {
  filePath?: string;
  promptText?: string;
}

export async function ingest(input: IngestInput): Promise<SourceDocument> {
  let doc: SourceDocument;
  if (input.promptText !== undefined) {
    doc = fromPlainText("Prompt", input.promptText);
  } else if (input.filePath !== undefined) {
    doc = await fromFile(input.filePath);
  } else {
    throw new StageError("ingest", "provide a file path or prompt text");
  }
  if (!doc.rawText.trim()) {
    throw new StageError("ingest", "extracted no text from the input");
  }
  return compressIfNeeded(doc);
}

async function fromFile(filePath: string): Promise<SourceDocument> {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath, ext);
  switch (ext) {
    case ".md":
    case ".markdown":
    case ".txt": {
      const text = await readFile(filePath, "utf8");
      return ext === ".txt"
        ? fromPlainText(name, text)
        : fromMarkdown(name, text);
    }
    case ".pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(await readFile(filePath)) });
      try {
        const result = await parser.getText();
        return fromPlainText(name, result.text);
      } finally {
        await parser.destroy();
      }
    }
    case ".docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ path: filePath });
      return fromPlainText(name, value);
    }
    case ".pptx":
      return fromPptx(name, await readFile(filePath));
    default:
      throw new StageError(
        "ingest",
        `unsupported file type "${ext}" (supported: pdf, docx, pptx, md, txt)`,
      );
  }
}

function clean(text: string): string {
  return text
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fromMarkdown(fallbackTitle: string, raw: string): SourceDocument {
  const text = clean(raw);
  const lines = text.split("\n");
  const sections: { title: string; text: string }[] = [];
  let docTitle = fallbackTitle;
  let current = { title: "Introduction", body: [] as string[] };
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      if (current.body.join("").trim()) {
        sections.push({ title: current.title, text: current.body.join("\n").trim() });
      }
      if (heading[1] === "#" && docTitle === fallbackTitle) {
        docTitle = heading[2]!.trim();
        current = { title: docTitle, body: [] };
      } else {
        current = { title: heading[2]!.trim(), body: [] };
      }
    } else {
      current.body.push(line);
    }
  }
  if (current.body.join("").trim()) {
    sections.push({ title: current.title, text: current.body.join("\n").trim() });
  }
  return {
    title: docTitle,
    sections: sections.length ? sections : [{ title: docTitle, text }],
    rawText: text,
  };
}

function fromPlainText(title: string, raw: string): SourceDocument {
  const text = clean(raw);
  // Group paragraphs into ~200-word pseudo-sections so the planner sees structure.
  const paragraphs = text.split(/\n\n+/);
  const sections: { title: string; text: string }[] = [];
  let buf: string[] = [];
  let words = 0;
  const flush = () => {
    if (!buf.length) return;
    const body = buf.join("\n\n");
    const first = body.split(/[.!?\n]/)[0] ?? "";
    sections.push({ title: first.trim().slice(0, 60) || `Part ${sections.length + 1}`, text: body });
    buf = [];
    words = 0;
  };
  for (const p of paragraphs) {
    buf.push(p);
    words += countWords(p);
    if (words >= 200) flush();
  }
  flush();
  return { title, sections, rawText: text };
}

function fromPptx(title: string, data: Buffer): SourceDocument {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(new Uint8Array(data));
  } catch (err) {
    throw new StageError("ingest", "could not unzip .pptx file", { cause: err });
  }
  const slideNames = Object.keys(zip)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b));
  if (!slideNames.length) {
    throw new StageError("ingest", ".pptx contains no slides");
  }
  const sections = slideNames.map((slideFile, i) => {
    const xml = strFromU8(zip[slideFile]!);
    const runs = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) =>
      decodeXml(m[1]!),
    );
    const text = clean(runs.join(" "));
    return { title: text.split(/[.!?\n]/)[0]?.trim().slice(0, 60) || `Slide ${i + 1}`, text };
  });
  return {
    title,
    sections,
    rawText: sections.map((s) => s.text).join("\n\n"),
  };
}

function slideNo(name: string): number {
  return Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0);
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function compressIfNeeded(doc: SourceDocument): Promise<SourceDocument> {
  const words = countWords(doc.rawText);
  if (words <= WORD_BUDGET) return doc;
  warn(
    "ingest",
    `document is ${words} words (budget ${WORD_BUDGET}) — running one LLM summarization pass`,
  );
  const summary = await complete({
    stage: "ingest",
    system:
      "You compress documents for a video planner. Preserve every distinct idea, number, and name. Output plain prose, no commentary, at most 3000 words.",
    user: doc.rawText,
  });
  return {
    title: doc.title,
    sections: [{ title: "Summary", text: summary }],
    rawText: summary,
  };
}
