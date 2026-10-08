// server/routes/public.ts — what the shop itself calls. Never exposes codes or cards.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DB } from "../db";
import { getSettings, getStore, listStores } from "../catalog";
import { ApiError } from "../errors";
import { checkVoucher, orderSchema, placeOrder } from "../orders";

export function publicRoutes(app: FastifyInstance, db: DB) {
  app.get("/api/site", async () => {
    const s = getSettings(db);
    return {
      title: s.title,
      gst: s.gst,
      classes: s.classes,
      alerts: s.alerts,
      discountCap: s.discountCap,
      stores: listStores(db).map(({ id, name, cover }) => ({ id, name, cover })),
    };
  });

  app.get<{ Params: { id: string } }>("/api/stores/:id", async (req) => {
    const store = getStore(db, req.params.id);
    if (!store) throw new ApiError(404, "NOT_FOUND", `Store "${req.params.id}" not found`);
    return store;
  });

  app.post("/api/vouchers/check", async (req) => {
    const { code } = z.object({ code: z.string().trim().min(1).max(40) }).parse(req.body);
    return checkVoucher(db, code);
  });

  app.post("/api/orders", async (req) => placeOrder(db, orderSchema.parse(req.body)));

  // Browsers that cached the old static version of the site still ask for
  // /stores/index.json. Answer with a banner (the old app shows `alerts`)
  // telling them to reload, instead of an empty shop. Never serves real data.
  app.get("/stores/index.json", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return {
      title: getSettings(db).title,
      alerts: [
        {
          severity: "warning",
          message:
            "This page is out of date. Please refresh it (pull down on an iPad, or press Ctrl+Shift+R / Cmd+Shift+R).",
        },
      ],
      classes: [],
      discountCodes: [],
      stores: [],
    };
  });
  app.get("/stores/*", async (_req, reply) =>
    reply.status(404).header("Cache-Control", "no-store").send({ error: "NOT_FOUND", message: "Please refresh the page" })
  );
}
