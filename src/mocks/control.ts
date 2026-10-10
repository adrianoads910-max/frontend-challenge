import { http, HttpResponse } from "msw";
import { db } from "./db";
import { connectedClients, disconnectAll, replayLastEvent, sendStaleNftEvent } from "./realtime";
import { isScenario, SCENARIOS, scenario } from "./scenarios";

/*
 * Mock control plane (`/__mock/*`), used by the scenario panel and by Playwright. It changes the
 * simulated BACKEND (database, scenario, sockets); the UI then learns about it only through REST
 * responses and Socket.IO events, exactly as it would in production.
 */

const ok = (data: object = {}) => HttpResponse.json({ ok: true, ...data });

export const controlHandlers = [
  http.get("/__mock/state", () =>
    HttpResponse.json({
      scenario: scenario.current,
      scenarios: SCENARIOS,
      sockets: connectedClients(),
      nfts: db.state.nfts.map((n) => ({ id: n.id, name: n.name, price: n.price, version: n.version })),
      orders: db.state.orders.map((o) => ({ id: o.id, status: o.status, version: o.version })),
    }),
  ),
  http.post("/__mock/scenario", async ({ request }) => {
    const { id } = (await request.json()) as { id?: unknown };
    if (!isScenario(id)) return HttpResponse.json({ error: "unknown scenario" }, { status: 400 });
    scenario.set(id);
    db.declinePayments = id === "payment-declined";
    return ok({ scenario: id });
  }),
  http.post("/__mock/reset", async () => {
    await db.reset();
    scenario.set("default");
    db.declinePayments = false;
    return ok();
  }),
  http.post<{ id: string }>("/__mock/nfts/:id/mutate", async ({ params, request }) => {
    const change = (await request.json()) as { priceDelta?: string; price?: string; available?: number; editionId?: string };
    const nft = db.mutateNft(params.id, change);
    return ok({ version: nft.version });
  }),
  /** { pattern, method?, status, code, count } — status 0 simulates a network error. */
  http.post("/__mock/fail-next", async ({ request }) => {
    const rule = (await request.json()) as { pattern: string; method?: string; status?: number; code?: string; count?: number };
    scenario.failRules.push({
      pattern: rule.pattern,
      method: rule.method,
      status: rule.status ?? 503,
      code: rule.code ?? "TRANSIENT",
      remaining: rule.count ?? 1,
    });
    return ok();
  }),
  http.post("/__mock/sessions/expire", () => {
    db.expireSessions();
    return ok();
  }),
  http.post("/__mock/socket/disconnect", () => ok({ closed: disconnectAll() })),
  http.post("/__mock/events/duplicate", () => ok({ event: replayLastEvent() })),
  http.post("/__mock/events/stale", () => ok({ event: sendStaleNftEvent() })),
  http.post<{ id: string }>("/__mock/orders/:id/settle", async ({ params, request }) => {
    const { outcome } = (await request.json()) as { outcome?: "confirmed" | "declined" };
    db.settle(params.id, outcome);
    return ok();
  }),
  http.post("/__mock/settle-delay", async ({ request }) => {
    const { ms } = (await request.json()) as { ms?: number };
    if (typeof ms === "number" && ms >= 0) db.settleDelayMs = ms;
    return ok({ settleDelayMs: db.settleDelayMs });
  }),
];
