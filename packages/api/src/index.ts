import "dotenv/config";
import { createReadStream, existsSync } from "node:fs";
import multipart from "@fastify/multipart";
import { PlanOptionsSchema } from "@chalkline/engine";
import Fastify from "fastify";
import { getJob, persistUpload, submitJob } from "./jobs.js";

const PORT = Number(process.env.PORT ?? 3210);

const app = Fastify({ logger: true });
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * POST /jobs — start a video job.
 * multipart/form-data: `file` (pdf/docx/pptx/md/txt) + optional `options` JSON field
 * application/json: { "prompt": "...", "options": { durationMin, language, aspectRatio, voice } }
 */
app.post("/jobs", async (req, reply) => {
  if (req.isMultipart()) {
    const parts = req.parts();
    let fileBuffer: Buffer | undefined;
    let filename = "upload.txt";
    let rawOptions: unknown = {};
    for await (const part of parts) {
      if (part.type === "file") {
        filename = part.filename;
        fileBuffer = await part.toBuffer();
      } else if (part.fieldname === "options") {
        rawOptions = JSON.parse(String(part.value));
      }
    }
    if (!fileBuffer) {
      return reply.status(400).send({ error: "multipart request needs a 'file' part" });
    }
    const options = PlanOptionsSchema.parse(rawOptions);
    const upload = fileBuffer;
    const job = submitJob((runDir) => ({
      filePath: persistUpload(runDir, filename, upload),
      options,
    }));
    return reply.status(202).send(toPublic(job.id));
  }
  const body = (req.body ?? {}) as { prompt?: string; options?: unknown };
  if (!body.prompt) {
    return reply.status(400).send({ error: "JSON body needs a 'prompt' string" });
  }
  const options = PlanOptionsSchema.parse(body.options ?? {});
  const prompt = body.prompt;
  const job = submitJob(() => ({ promptText: prompt, options }));
  return reply.status(202).send(toPublic(job.id));
});

/** GET /jobs/:id — status + per-stage progress. */
app.get("/jobs/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const pub = toPublic(id);
  if (!pub) return reply.status(404).send({ error: "no such job" });
  return pub;
});

/** GET /jobs/:id/video — stream the finished MP4. */
app.get("/jobs/:id/video", async (req, reply) => {
  const { id } = req.params as { id: string };
  const job = getJob(id);
  if (!job) return reply.status(404).send({ error: "no such job" });
  if (job.status !== "done" || !job.videoPath || !existsSync(job.videoPath)) {
    return reply.status(409).send({ error: `video not ready (status: ${job.status})` });
  }
  return reply.type("video/mp4").send(createReadStream(job.videoPath));
});

function toPublic(id: string):
  | {
      id: string;
      status: string;
      stage?: string;
      stages: { name: string; ms: number }[];
      error?: string;
      createdAt: string;
    }
  | undefined {
  const job = getJob(id);
  if (!job) return undefined;
  return {
    id: job.id,
    status: job.status,
    ...(job.stage !== undefined ? { stage: job.stage } : {}),
    stages: job.stages,
    ...(job.error !== undefined ? { error: job.error } : {}),
    createdAt: job.createdAt,
  };
}

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => console.log(`chalkline API on :${PORT}`))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
