// server/auth.ts — single shared admin password, in-memory sessions
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "./errors";

const COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

const sessions = new Map<string, number>(); // token -> expiry
const failures = new Map<string, { count: number; since: number }>(); // ip -> failures

const sha = (s: string) => createHash("sha256").update(s).digest();

export function adminEnabled() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function readCookie(req: FastifyRequest, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function setCookie(req: FastifyRequest, reply: FastifyReply, value: string, maxAgeSec: number) {
  const secure = req.protocol === "https" ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`
  );
}

export function isLoggedIn(req: FastifyRequest) {
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export async function requireAdmin(req: FastifyRequest) {
  if (!isLoggedIn(req)) throw new ApiError(401, "UNAUTHORISED", "Please log in");
}

export function login(req: FastifyRequest, reply: FastifyReply, password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new ApiError(503, "ADMIN_DISABLED", "Admin is disabled. Set ADMIN_PASSWORD on the server.");
  }

  const ip = req.ip;
  const f = failures.get(ip);
  if (f && Date.now() - f.since < FAILURE_WINDOW_MS && f.count >= MAX_FAILURES) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Try again in 15 minutes.");
  }

  if (!timingSafeEqual(sha(password), sha(expected))) {
    const fresh = !f || Date.now() - f.since >= FAILURE_WINDOW_MS;
    failures.set(ip, fresh ? { count: 1, since: Date.now() } : { ...f, count: f.count + 1 });
    throw new ApiError(401, "BAD_PASSWORD", "Wrong password");
  }

  failures.delete(ip);
  const token = randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  setCookie(req, reply, token, SESSION_TTL_MS / 1000);
}

export function logout(req: FastifyRequest, reply: FastifyReply) {
  const token = readCookie(req, COOKIE);
  if (token) sessions.delete(token);
  setCookie(req, reply, "", 0);
}
