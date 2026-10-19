// server/index.ts — one process serves the shop, its API and /admin
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import { ZodError } from "zod";
import { openDb } from "./db";
import { seedIfEmpty } from "./seed";
import { adminEnabled } from "./auth";
import { ApiError } from "./errors";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";

if (existsSync(".env")) process.loadEnvFile(".env");

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
const SEED_DIR = path.resolve(process.env.SEED_DIR ?? "seed");
const STATIC_DIR = path.resolve(process.env.STATIC_DIR ?? "dist");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

const db = openDb(DATA_DIR);
mkdirSync(UPLOADS_DIR, { recursive: true });
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true });

const seeded = seedIfEmpty(db, SEED_DIR);
if (seeded) app.log.info(`Imported seed data from ${SEED_DIR}: ${seeded}`);
if (!adminEnabled()) app.log.warn("ADMIN_PASSWORD is not set — /admin is disabled");

app.setErrorHandler((err, req, reply) => {
  if (err instanceof ApiError) {
    return reply.status(err.status).send({ error: err.code, message: err.message, ...err.extra });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return reply.status(400).send({ error: "BAD_REQUEST", message: where + (first?.message ?? "Invalid request") });
  }
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status < 500) {
    return reply.status(status).send({ error: "BAD_REQUEST", message: (err as Error).message });
  }
  req.log.error(err);
  return reply.status(500).send({ error: "SERVER_ERROR", message: "Something went wrong" });
});

app.addHook("onSend", async (req, reply) => {
  if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
});

// Treat an empty JSON body as {} (e.g. POST /orders/:id/void).
app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
  try {
    done(null, body === "" ? {} : JSON.parse(body as string));
  } catch {
    done(new ApiError(400, "BAD_JSON", "Invalid JSON body"), undefined);
  }
});

await app.register(fastifyMultipart,{ limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

publicRoutes(app, db);
adminRoutes(app, db, UPLOADS_DIR);

// Product photos and store covers (/img/...): the data volume's copy wins, so
// a deploy doesn't need the gitignored public/img in the image.
const IMG_DIR = path.join(DATA_DIR, "img");
mkdirSync(IMG_DIR, { recursive: true });
await app.register(fastifyStatic, {
  root: [IMG_DIR, path.join(STATIC_DIR, "img")].filter((dir) => existsSync(dir)),
  prefix: "/img/",
  decorateReply: false,
  maxAge: "1h",
});

await app.register(fastifyStatic, {
  root: UPLOADS_DIR,
  prefix: "/uploads/",
  decorateReply: false,
  maxAge: "7d",
  immutable: true,
});

const hasClient = existsSync(path.join(STATIC_DIR, "index.html"));
if (hasClient) {
  await app.register(fastifyStatic, {
    root: STATIC_DIR,
    setHeaders(res, file) {
      if (file.includes(`${path.sep}assets${path.sep}`)) {
        res.header("Cache-Control", "public, max-age=31536000, immutable");
      } else if (file.endsWith(".html")) {
        res.header("Cache-Control", "no-cache");
      } else {
        res.header("Cache-Control", "public, max-age=3600");
      }
    },
  });
} else {
  app.log.info(`No built client in ${STATIC_DIR} — API only (use "npm run dev" for the UI)`);
}

// Client-side routes (/store/x, /checkout, /admin/...) all load the SPA.
app.setNotFoundHandler((req, reply) => {
  const isPage = req.method === "GET" && !req.url.startsWith("/api/") && !req.url.startsWith("/uploads/") && !req.url.startsWith("/img/");
  if (hasClient && isPage) {
    return reply.header("Cache-Control", "no-cache").sendFile("index.html", STATIC_DIR);
  }
  return reply.status(404).send({ error: "NOT_FOUND", message: "Not found" });
});

const close = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: PORT, host: HOST });
