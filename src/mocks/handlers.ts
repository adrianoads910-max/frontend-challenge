import { delay, http, HttpResponse, type JsonBodyType, type PathParams } from "msw";
import type { z } from "zod";
import {
  AddToCartInput,
  AvatarInput,
  CATEGORIES,
  CatalogQuery,
  CreateOrderInput,
  LoginInput,
  NETWORKS,
  Network,
  PasswordChangeInput,
  ProfileInput,
  QuoteInput,
  RegisterInput,
  SORTS,
  TABS,
  WalletInput,
  type WalletConnection,
} from "@/api/contracts";
import { ApiError, db } from "./db";
import { scenario } from "./scenarios";

/*
 * REST handlers. Every /api route goes through `route()`, which applies the active scenario
 * (latency, offline, transient 503), resolves the session and maps ApiError → JSON error body.
 * Components and hooks never see fixtures: they only talk to these endpoints through axios.
 */

const API = "/api";

interface Ctx<P extends PathParams> {
  request: Request;
  params: P;
  token: string | null;
}

/** Explicit non-200 response (status / headers); plain return values are sent as 200 JSON. */
class Reply {
  readonly status: number;
  readonly body: JsonBodyType;
  readonly headers: Record<string, string>;

  constructor(status: number, body: JsonBodyType = null, headers: Record<string, string> = {}) {
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}
const reply = (status: number, body?: JsonBodyType, headers?: Record<string, string>) => new Reply(status, body, headers);

type Result = Reply | JsonBodyType;

function errorResponse(err: ApiError) {
  return HttpResponse.json(
    { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}), ...(err.details !== undefined ? { details: err.details } : {}) } },
    { status: err.status, headers: err.status === 503 ? { "Retry-After": "1" } : undefined },
  );
}

function route<P extends PathParams = PathParams>(
  fn: (ctx: Ctx<P>) => Promise<Result> | Result,
  opts: { catalog?: boolean } = {},
) {
  return async ({ request, params }: { request: Request; params: P }) => {
    await delay(scenario.latency(Boolean(opts.catalog)));
    if (scenario.current === "offline") return HttpResponse.error();
    if (scenario.shouldFailTransiently()) {
      return errorResponse(new ApiError(503, "TRANSIENT", "Serviço temporariamente indisponível. Tente novamente."));
    }
    const auth = request.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    try {
      const result = await fn({ request, params, token });
      if (result instanceof Reply) {
        if (result.status === 204) return new HttpResponse(null, { status: 204, headers: result.headers });
        return HttpResponse.json(result.body, { status: result.status, headers: result.headers });
      }
      return HttpResponse.json(result);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err);
      console.error("[mock] unhandled error", err);
      return errorResponse(new ApiError(500, "INTERNAL", "Erro interno inesperado"));
    }
  };
}

/** Server-side validation with the shared schemas → 422 with field messages. */
async function body<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Corpo da requisição inválido");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    throw new ApiError(422, "VALIDATION_ERROR", "Verifique os campos destacados", fields);
  }
  return parsed.data;
}

function parseCatalogQuery(url: URL) {
  const sp = url.searchParams;
  const list = <T extends string>(key: string, allowed: readonly T[]) =>
    sp.getAll(key).filter((v): v is T => (allowed as readonly string[]).includes(v));
  const raw = {
    q: sp.get("q") ?? undefined,
    tab: TABS.find((t) => t === sp.get("tab")),
    categories: list("category", CATEGORIES),
    networks: list("network", NETWORKS),
    minPrice: sp.get("minPrice") ?? undefined,
    maxPrice: sp.get("maxPrice") ?? undefined,
    sort: SORTS.find((s) => s === sp.get("sort")),
    page: sp.get("page") ? Number(sp.get("page")) : undefined,
  };
  const parsed = CatalogQuery.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Parâmetros de busca inválidos");
  return parsed.data;
}

const cartHeader = (request: Request) => request.headers.get("x-cart-id");

/** Fires `fn` once, `ms` after the quote is generated, in the checkout failure scenarios. */
function scheduleCheckoutScenario(firstNftId: string | undefined, editionId: string | undefined) {
  if (!firstNftId || !editionId) return;
  if (scenario.current === "price-change") {
    setTimeout(() => db.mutateNft(firstNftId, { editionId, priceDelta: "0.10" }), 1500);
  } else if (scenario.current === "sold-out") {
    setTimeout(() => db.mutateNft(firstNftId, { editionId, available: 0 }), 1500);
  }
}

const connections = new Map<string, WalletConnection>();

export const handlers = [
  // ---------------------------------------------------------------- session
  http.post(`${API}/auth/register`, route(async ({ request }) => {
    const input = await body(request, RegisterInput);
    const session = await db.register(input);
    return reply(201, session);
  })),
  http.post(`${API}/auth/login`, route(async ({ request }) => {
    const input = await body(request, LoginInput);
    const session = await db.login(input.email, input.password);
    if (scenario.current === "session-short") {
      const user = db.state.users.find((u) => u.id === session.user.id)!;
      db.logout(session.token);
      return db.openSession(user, 20_000);
    }
    return session;
  })),
  http.get(`${API}/auth/session`, route(({ token }) => {
    const user = db.requireUser(token);
    const session = db.state.sessions.find((s) => s.token === token)!;
    return { token: token!, expiresAt: session.expiresAt, user: db.publicUser(user) };
  })),
  http.post(`${API}/auth/logout`, route(({ token }) => {
    if (token) db.logout(token);
    return reply(204);
  })),

  // ---------------------------------------------------------------- catalog
  http.get(`${API}/nfts`, route(({ request }) => {
    if (scenario.current === "server-error") throw new ApiError(500, "INTERNAL", "Falha ao carregar o catálogo");
    return db.queryCatalog(parseCatalogQuery(new URL(request.url)), scenario.current === "empty");
  }, { catalog: true })),
  http.get<{ id: string }>(`${API}/nfts/:id`, route(({ params }) => db.findNft(params.id))),

  // ---------------------------------------------------------------- favorites
  http.get(`${API}/me/favorites`, route(({ token }) => ({ nftIds: [...db.favorites(db.requireUser(token).id)] }))),
  http.put<{ id: string }>(`${API}/me/favorites/:id`, route(({ token, params }) => db.setFavorite(db.requireUser(token).id, params.id, true))),
  http.delete<{ id: string }>(`${API}/me/favorites/:id`, route(({ token, params }) => db.setFavorite(db.requireUser(token).id, params.id, false))),

  // ---------------------------------------------------------------- cart
  http.get(`${API}/cart`, route(({ request, token }) => db.priceCart(db.cartFor(db.optionalUser(token), cartHeader(request))))),
  http.post(`${API}/cart/items`, route(async ({ request, token }) => {
    const input = await body(request, AddToCartInput);
    const cart = db.cartFor(db.optionalUser(token), cartHeader(request));
    db.addToCart(cart, input.nftId, input.editionId, input.quantity);
    return reply(201, db.priceCart(cart));
  })),
  http.patch<{ itemId: string }>(`${API}/cart/items/:itemId`, route(async ({ request, token, params }) => {
    const { quantity } = await body(request, AddToCartInput.pick({ quantity: true }));
    const cart = db.cartFor(db.optionalUser(token), cartHeader(request));
    db.updateCartItem(cart, params.itemId, quantity);
    return db.priceCart(cart);
  })),
  http.delete<{ itemId: string }>(`${API}/cart/items/:itemId`, route(({ request, token, params }) => {
    const cart = db.cartFor(db.optionalUser(token), cartHeader(request));
    db.removeCartItem(cart, params.itemId);
    return db.priceCart(cart);
  })),
  http.post(`${API}/cart/acknowledge`, route(({ request, token }) => {
    const cart = db.cartFor(db.optionalUser(token), cartHeader(request));
    db.acknowledgePrices(cart);
    return db.priceCart(cart);
  })),
  http.post(`${API}/cart/coupon`, route(async ({ request, token }) => {
    const json = (await request.json().catch(() => ({}))) as { code?: unknown };
    if (typeof json.code !== "string" || !json.code.trim()) {
      throw new ApiError(422, "VALIDATION_ERROR", "Informe um cupom", { code: "Informe um cupom" });
    }
    const cart = db.cartFor(db.optionalUser(token), cartHeader(request));
    db.applyCoupon(cart, json.code);
    return db.priceCart(cart);
  })),
  http.delete(`${API}/cart/coupon`, route(({ request, token }) => {
    const cart = db.cartFor(db.optionalUser(token), cartHeader(request));
    db.removeCoupon(cart);
    return db.priceCart(cart);
  })),
  http.post(`${API}/cart/merge`, route(async ({ request, token }) => {
    const user = db.requireUser(token);
    const json = (await request.json().catch(() => ({}))) as { guestCartId?: unknown };
    if (typeof json.guestCartId !== "string") throw new ApiError(422, "VALIDATION_ERROR", "guestCartId ausente");
    return db.priceCart(db.mergeCarts(user, json.guestCartId));
  })),

  // ---------------------------------------------------------------- checkout & orders
  http.post(`${API}/checkout/quote`, route(async ({ request, token }) => {
    const user = db.requireUser(token);
    const { network } = await body(request, QuoteInput);
    const quote = db.quote(user, network);
    scheduleCheckoutScenario(quote.lines[0]?.nftId, quote.lines[0]?.editionId);
    return quote;
  })),
  http.post(`${API}/orders`, route(async ({ request, token }) => {
    const user = db.requireUser(token);
    const key = request.headers.get("idempotency-key");
    if (!key || !/^[A-Za-z0-9-]{8,80}$/.test(key)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Idempotency-Key obrigatório");
    }
    const input = await body(request, CreateOrderInput);
    const { order, replay } = await db.createOrder(user, key, input);
    // order-timeout: the order IS created, but the first response is slower than the client timeout.
    if (scenario.current === "order-timeout" && !scenario.timedOutKeys.has(key)) {
      scenario.timedOutKeys.add(key);
      await delay(12_000);
    }
    return reply(replay ? 200 : 201, order, replay ? { "Idempotent-Replay": "true" } : {});
  })),
  http.get(`${API}/orders`, route(({ request, token }) => {
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    return { items: db.listOrders(db.requireUser(token), status) };
  })),
  http.get<{ id: string }>(`${API}/orders/:id`, route(({ token, params }) => db.findOrder(db.requireUser(token), params.id))),

  // ---------------------------------------------------------------- profile
  http.get(`${API}/me/profile`, route(({ token }) => db.publicUser(db.requireUser(token)))),
  http.patch(`${API}/me/profile`, route(async ({ request, token }) => {
    const user = db.requireUser(token);
    return db.updateProfile(user, await body(request, ProfileInput));
  })),
  http.put(`${API}/me/avatar`, route(async ({ request, token }) => {
    const user = db.requireUser(token);
    return db.setAvatar(user, (await body(request, AvatarInput)).dataUrl);
  })),
  http.delete(`${API}/me/avatar`, route(({ token }) => db.setAvatar(db.requireUser(token), null))),
  http.post(`${API}/me/password`, route(async ({ request, token }) => {
    const user = db.requireUser(token);
    const input = await body(request, PasswordChangeInput);
    await db.changePassword(user, input.currentPassword, input.newPassword);
    return reply(204);
  })),

  // ---------------------------------------------------------------- wallets
  http.get(`${API}/me/wallets`, route(({ token }) => ({ items: db.listWallets(db.requireUser(token).id) }))),
  http.post(`${API}/me/wallets`, route(async ({ request, token }) => {
    const user = db.requireUser(token);
    const json = (await request.clone().json().catch(() => ({}))) as { role?: unknown };
    const role = json.role === "secondary" ? "secondary" : "primary";
    if (db.listWallets(user.id).some((w) => w.role === role)) {
      throw new ApiError(409, "VALIDATION_ERROR", "Esta carteira já existe; atualize-a em vez de criar outra");
    }
    return reply(201, db.upsertWallet(user.id, role, await body(request, WalletInput)));
  })),
  http.put<{ id: string }>(`${API}/me/wallets/:id`, route(async ({ request, token, params }) => {
    const user = db.requireUser(token);
    const wallet = db.listWallets(user.id).find((w) => w.id === params.id);
    if (!wallet) throw new ApiError(404, "NOT_FOUND", "Carteira não encontrada");
    return db.upsertWallet(user.id, wallet.role, await body(request, WalletInput), wallet.id);
  })),
  http.post<{ id: string }>(`${API}/me/wallets/:id/connect`, route(async ({ request, token, params }) => {
    const user = db.requireUser(token);
    const wallet = db.listWallets(user.id).find((w) => w.id === params.id);
    if (!wallet) throw new ApiError(404, "NOT_FOUND", "Carteira não encontrada");
    const json = (await request.json().catch(() => ({}))) as { network?: unknown };
    const network = Network.safeParse(json.network);
    if (!network.success) throw new ApiError(422, "VALIDATION_ERROR", "Rede inválida", { network: "Selecione uma rede" });
    if (scenario.current === "wallet-rejected") {
      throw new ApiError(409, "WALLET_REJECTED", "A conexão foi recusada na carteira. Tente novamente ou escolha outra carteira.");
    }
    const connection: WalletConnection = {
      walletId: wallet.id, network: network.data, address: wallet.address, provider: wallet.provider,
      connectedAt: new Date().toISOString(),
    };
    connections.set(`${user.id}:${wallet.id}`, connection);
    return connection;
  })),
  http.post<{ id: string }>(`${API}/me/wallets/:id/disconnect`, route(({ token, params }) => {
    connections.delete(`${db.requireUser(token).id}:${params.id}`);
    return reply(204);
  })),
];
