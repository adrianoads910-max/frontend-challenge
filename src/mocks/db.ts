import type {
  Cart,
  CartItem,
  CatalogPage,
  CatalogQuery,
  CollectorInput,
  ErrorCode,
  Network,
  Nft,
  NftSummary,
  NftUpdatedEvent,
  Order,
  OrderUpdatedEvent,
  Quote,
  QuoteLine,
  User,
  Wallet,
  WalletInput,
  WalletRole,
} from "@/api/contracts";
import { CATEGORIES, NETWORKS } from "@/api/contracts";
import { eth } from "@/lib/eth";
import { buildCatalog, COUPONS, type CouponDef, DEMO_USERS, NETWORK_FEES } from "./fixtures";

/*
 * In-browser "backend" state used by the MSW handlers. It is the single source of truth for REST
 * responses AND realtime events, so both always agree. State persists in localStorage to survive
 * refreshes; `reset()` restores the deterministic fixtures.
 */

const STORAGE_KEY = "kurio.mock.db.v1";
export const PAGE_SIZE = 9;
export const SESSION_TTL_MS = 30 * 60_000;
export const QUOTE_TTL_MS = 5 * 60_000;

interface StoredUser extends User {
  passwordHash: string;
  salt: string;
}
interface StoredSession {
  token: string;
  userId: string;
  expiresAt: string;
}
interface StoredCartItem {
  id: string;
  nftId: string;
  editionId: string;
  quantity: number;
  priceWhenAdded: string;
}
interface StoredCart {
  id: string;
  ownerId: string | null;
  version: number;
  items: StoredCartItem[];
  couponCode: string | null;
}
interface StoredQuote extends Quote {
  ownerId: string;
}
interface StoredOrder extends Order {
  ownerId: string;
  quoteId: string;
  settleAt: string;
}

export interface DbState {
  nfts: Nft[];
  users: StoredUser[];
  sessions: StoredSession[];
  carts: StoredCart[];
  favorites: Record<string, string[]>;
  wallets: Record<string, Wallet[]>;
  quotes: StoredQuote[];
  orders: StoredOrder[];
  idempotency: Record<string, { ownerId: string; bodyHash: string; orderId: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, fields?: Record<string, string>, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.details = details;
  }
}

// ------------------------------------------------------------------ helpers

const now = () => new Date();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, salt: string) {
  return sha256(`${salt}:${password}`);
}

export function stableHash(value: unknown): Promise<string> {
  const canonical = (v: unknown): string =>
    v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? `[${v.map(canonical).join(",")}]`
        : `{${Object.keys(v as object)
            .sort()
            .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
            .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
            .join(",")}}`;
  return sha256(canonical(value));
}

type Listener = (event: NftUpdatedEvent | OrderUpdatedEvent) => void;

// ------------------------------------------------------------------ database

export class MockDb {
  state!: DbState;
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Last events emitted, kept to replay duplicates / stale versions in failure scenarios. */
  readonly recentEvents: Array<NftUpdatedEvent | OrderUpdatedEvent> = [];
  /** Delay before a pending order settles (ms). Scenarios may change it. */
  settleDelayMs = 2500;
  /** When true the next settlement declines the payment. */
  declinePayments = false;

  async init(): Promise<void> {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      try {
        this.state = JSON.parse(raw) as DbState;
        this.resumePendingOrders();
        return;
      } catch {
        /* corrupted → reset */
      }
    }
    await this.reset();
  }

  async reset(): Promise<void> {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    const users: StoredUser[] = [];
    for (const u of DEMO_USERS) {
      const salt = `salt-${u.id}`;
      users.push({
        id: u.id,
        displayName: u.displayName,
        username: u.username,
        email: u.email,
        ensName: u.ensName,
        walletNickname: u.walletNickname,
        avatarUrl: null,
        createdAt: "2026-01-15T12:00:00.000Z",
        salt,
        passwordHash: await hashPassword(u.password, salt),
      });
    }
    const stamp = "2026-09-01T12:00:00.000Z";
    this.state = {
      nfts: buildCatalog(),
      users,
      sessions: [],
      carts: [],
      favorites: { "user-ana": [] },
      wallets: {
        "user-ana": [
          {
            id: "wallet-ana-primary", role: "primary", displayName: "Ana Colecionadora", nickname: "Cofre principal",
            network: "ethereum", profileName: "anakurio", address: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
            secondaryAddress: null, provider: "metamask", referralCode: "KURIO2026", email: "ana@kurio.dev",
            ensName: "anakurio", updatedAt: stamp,
          },
        ],
        "user-bruno": [],
      },
      quotes: [],
      orders: [],
      idempotency: {},
    };
    this.recentEvents.length = 0;
    this.persist();
  }

  persist(): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: NftUpdatedEvent | OrderUpdatedEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > 50) this.recentEvents.shift();
    for (const l of this.listeners) l(event);
  }

  // ---------------------------------------------------------------- auth

  publicUser(u: StoredUser): User {
    const { passwordHash: _h, salt: _s, ...user } = u;
    return user;
  }

  async register(input: { username: string; email: string; password: string }) {
    const email = input.email.toLowerCase();
    const fields: Record<string, string> = {};
    if (this.state.users.some((u) => u.email === email)) fields.email = "Este e-mail já está cadastrado";
    if (this.state.users.some((u) => u.username === input.username)) fields.username = "Este nome de usuário já está em uso";
    if (Object.keys(fields).length) {
      throw new ApiError(409, fields.email ? "EMAIL_TAKEN" : "USERNAME_TAKEN", "Conta já existente", fields);
    }
    const salt = id("salt");
    const user: StoredUser = {
      id: id("user"), displayName: input.username, username: input.username, email,
      ensName: null, walletNickname: null, avatarUrl: null, createdAt: now().toISOString(),
      salt, passwordHash: await hashPassword(input.password, salt),
    };
    this.state.users.push(user);
    this.state.wallets[user.id] = [];
    this.state.favorites[user.id] = [];
    return this.openSession(user);
  }

  async login(emailRaw: string, password: string) {
    const user = this.state.users.find((u) => u.email === emailRaw.toLowerCase());
    if (!user || (await hashPassword(password, user.salt)) !== user.passwordHash) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos");
    }
    return this.openSession(user);
  }

  openSession(user: StoredUser, ttlMs = SESSION_TTL_MS) {
    const session: StoredSession = {
      token: `tok_${crypto.randomUUID().replace(/-/g, "")}`,
      userId: user.id,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    this.state.sessions.push(session);
    this.persist();
    return { token: session.token, expiresAt: session.expiresAt, user: this.publicUser(user) };
  }

  logout(token: string) {
    this.state.sessions = this.state.sessions.filter((s) => s.token !== token);
    this.persist();
  }

  /** Throws 401 UNAUTHENTICATED / SESSION_EXPIRED. */
  requireUser(token: string | null): StoredUser {
    if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Faça login para continuar");
    const session = this.state.sessions.find((s) => s.token === token);
    if (!session) throw new ApiError(401, "SESSION_EXPIRED", "Sua sessão expirou. Entre novamente.");
    if (new Date(session.expiresAt) <= now()) {
      this.state.sessions = this.state.sessions.filter((s) => s.token !== token);
      this.persist();
      throw new ApiError(401, "SESSION_EXPIRED", "Sua sessão expirou. Entre novamente.");
    }
    return this.state.users.find((u) => u.id === session.userId)!;
  }

  optionalUser(token: string | null): StoredUser | null {
    if (!token) return null;
    try {
      return this.requireUser(token);
    } catch {
      return null;
    }
  }

  /** Forces every session of a user (or all) to expire — "session expired" scenario. */
  expireSessions(userId?: string) {
    for (const s of this.state.sessions) if (!userId || s.userId === userId) s.expiresAt = new Date(0).toISOString();
    this.persist();
  }

  sessionUserId(token: string): string | null {
    const s = this.state.sessions.find((x) => x.token === token && new Date(x.expiresAt) > now());
    return s?.userId ?? null;
  }

  // ---------------------------------------------------------------- profile

  updateProfile(user: StoredUser, input: { displayName: string; username: string; email: string; ensName: string; walletNickname: string }) {
    const email = input.email.toLowerCase();
    const fields: Record<string, string> = {};
    if (this.state.users.some((u) => u.id !== user.id && u.email === email)) fields.email = "Este e-mail já está cadastrado";
    if (this.state.users.some((u) => u.id !== user.id && u.username === input.username)) fields.username = "Este nome de usuário já está em uso";
    if (Object.keys(fields).length) throw new ApiError(409, fields.email ? "EMAIL_TAKEN" : "USERNAME_TAKEN", "Dados já em uso", fields);
    Object.assign(user, { ...input, email });
    this.persist();
    return this.publicUser(user);
  }

  setAvatar(user: StoredUser, dataUrl: string | null) {
    user.avatarUrl = dataUrl;
    this.persist();
    return this.publicUser(user);
  }

  async changePassword(user: StoredUser, current: string, next: string) {
    if ((await hashPassword(current, user.salt)) !== user.passwordHash) {
      throw new ApiError(422, "VALIDATION_ERROR", "Senha atual incorreta", { currentPassword: "Senha atual incorreta" });
    }
    user.salt = id("salt");
    user.passwordHash = await hashPassword(next, user.salt);
    this.persist();
  }

  // ---------------------------------------------------------------- wallets

  listWallets(userId: string): Wallet[] {
    return [...(this.state.wallets[userId] ?? [])].sort((a, b) => (a.role === "primary" ? -1 : b.role === "primary" ? 1 : 0));
  }

  upsertWallet(userId: string, role: WalletRole, input: WalletInput, walletId?: string): Wallet {
    const list = (this.state.wallets[userId] ??= []);
    const existing = walletId ? list.find((w) => w.id === walletId) : list.find((w) => w.role === role);
    if (walletId && !existing) throw new ApiError(404, "NOT_FOUND", "Carteira não encontrada");
    if (!existing && role === "secondary" && !list.some((w) => w.role === "primary")) {
      throw new ApiError(422, "VALIDATION_ERROR", "Cadastre a carteira principal primeiro");
    }
    const clash = list.find((w) => w.id !== existing?.id && w.address.toLowerCase() === input.address.toLowerCase());
    if (clash) throw new ApiError(409, "VALIDATION_ERROR", "Endereço já cadastrado", { address: "Este endereço já está cadastrado em outra carteira" });
    const wallet: Wallet = {
      id: existing?.id ?? id("wallet"),
      role: existing?.role ?? role,
      ...input,
      secondaryAddress: input.secondaryAddress || null,
      updatedAt: now().toISOString(),
    };
    if (existing) list.splice(list.indexOf(existing), 1, wallet);
    else list.push(wallet);
    this.persist();
    return wallet;
  }

  // ---------------------------------------------------------------- catalog

  summary(n: Nft): NftSummary {
    return { id: n.id, name: n.name, image: n.image, category: n.category, network: n.network, price: n.price, previousPrice: n.previousPrice, soldOut: n.soldOut, version: n.version };
  }

  findNft(nftId: string): Nft {
    const nft = this.state.nfts.find((n) => n.id === nftId);
    if (!nft) throw new ApiError(404, "NOT_FOUND", "NFT não encontrado");
    return nft;
  }

  queryCatalog(q: CatalogQuery, emptyCatalog = false): CatalogPage {
    const text = q.q?.toLowerCase();
    const inPrice = (n: Nft) =>
      (!q.minPrice || eth.cmp(n.price, q.minPrice) >= 0) && (!q.maxPrice || eth.cmp(n.price, q.maxPrice) <= 0);
    const base = emptyCatalog ? [] : this.state.nfts.filter((n) => !text || n.name.toLowerCase().includes(text));
    const byTab = base.filter(
      (n) =>
        (q.tab !== "new" || new Date(n.createdAt) >= new Date("2026-08-15")) &&
        (q.tab !== "trending" || n.ratingCount >= 30),
    );
    const matches = (n: Nft, skip: "category" | "network" | null) =>
      (skip === "category" || !q.categories?.length || q.categories.includes(n.category)) &&
      (skip === "network" || !q.networks?.length || q.networks.includes(n.network)) &&
      inPrice(n);
    const filtered = byTab.filter((n) => matches(n, null));

    const sort = q.sort ?? "recent";
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "price-asc") return eth.cmp(a.price, b.price) || a.id.localeCompare(b.id);
      if (sort === "price-desc") return eth.cmp(b.price, a.price) || a.id.localeCompare(b.id);
      if (sort === "popular") return b.ratingCount - a.ratingCount || a.id.localeCompare(b.id);
      return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
    });
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const page = Math.min(q.page ?? 1, totalPages);
    const prices = this.state.nfts.map((n) => n.price).sort(eth.cmp);
    return {
      items: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((n) => this.summary(n)),
      page,
      pageSize: PAGE_SIZE,
      total: sorted.length,
      totalPages,
      // Facet counts ignore their own dimension (counts for other categories stay visible).
      facets: {
        categories: CATEGORIES.map((c) => ({ id: c, count: byTab.filter((n) => matches(n, "category") && n.category === c).length })),
        networks: NETWORKS.map((nw) => ({ id: nw, count: byTab.filter((n) => matches(n, "network") && n.network === nw).length })),
        priceRange: { min: prices[0] ?? "0.00", max: prices.at(-1) ?? "0.00" },
      },
    };
  }

  /** Changes price / stock of an NFT (control panel & scenarios) and broadcasts nft.updated. */
  mutateNft(nftId: string, change: { priceDelta?: string; price?: string; available?: number; editionId?: string }) {
    const nft = this.findNft(nftId);
    for (const e of nft.editions) {
      if (change.editionId && e.id !== change.editionId) continue;
      if (change.price) e.price = change.price;
      else if (change.priceDelta) e.price = eth.add(e.price, change.priceDelta);
      if (change.available !== undefined) e.available = change.available;
    }
    this.refreshNft(nft);
    this.touchCartsContaining(nft.id);
    this.persist();
    this.emitNft(nft);
    return nft;
  }

  private refreshNft(nft: Nft) {
    const main = nft.editions.find((e) => e.id.endsWith("-e50")) ?? nft.editions[0]!;
    nft.price = main.price;
    nft.previousPrice = main.previousPrice;
    nft.soldOut = nft.editions.every((e) => e.available === 0);
    nft.version += 1;
  }

  emitNft(nft: Nft) {
    this.emit({
      type: "nft.updated",
      eventId: id("evt"),
      occurredAt: now().toISOString(),
      version: nft.version,
      resource: { type: "nft", id: nft.id },
      data: {
        price: nft.price,
        previousPrice: nft.previousPrice,
        soldOut: nft.soldOut,
        editions: nft.editions.map(({ id: eid, price, previousPrice, available }) => ({ id: eid, price, previousPrice, available })),
      },
    });
  }

  // ---------------------------------------------------------------- favorites

  favorites(userId: string) {
    return (this.state.favorites[userId] ??= []);
  }

  setFavorite(userId: string, nftId: string, on: boolean) {
    this.findNft(nftId);
    const list = this.favorites(userId);
    const idx = list.indexOf(nftId);
    if (on && idx < 0) list.push(nftId);
    if (!on && idx >= 0) list.splice(idx, 1);
    this.persist();
    return { nftIds: [...list] };
  }

  // ---------------------------------------------------------------- cart

  /** Authenticated users own one cart; guests use the cart id sent in X-Cart-Id. */
  cartFor(user: StoredUser | null, guestCartId: string | null): StoredCart {
    if (user) {
      let cart = this.state.carts.find((c) => c.ownerId === user.id);
      if (!cart) {
        cart = { id: id("cart"), ownerId: user.id, version: 1, items: [], couponCode: null };
        this.state.carts.push(cart);
      }
      return cart;
    }
    const cartId = guestCartId && /^[a-z0-9-]{8,64}$/i.test(guestCartId) ? guestCartId : null;
    if (!cartId) throw new ApiError(400, "VALIDATION_ERROR", "X-Cart-Id ausente");
    let cart = this.state.carts.find((c) => c.id === cartId && c.ownerId === null);
    if (!cart) {
      cart = { id: cartId, ownerId: null, version: 1, items: [], couponCode: null };
      this.state.carts.push(cart);
    }
    return cart;
  }

  private touchCartsContaining(nftId: string) {
    for (const c of this.state.carts) if (c.items.some((i) => i.nftId === nftId)) c.version += 1;
  }

  addToCart(cart: StoredCart, nftId: string, editionId: string, quantity: number) {
    const nft = this.findNft(nftId);
    const edition = nft.editions.find((e) => e.id === editionId);
    if (!edition) throw new ApiError(404, "NOT_FOUND", "Edição não encontrada");
    if (edition.available === 0) throw new ApiError(409, "EDITION_UNAVAILABLE", "Esta edição está esgotada");
    const existing = cart.items.find((i) => i.editionId === editionId);
    const nextQty = (existing?.quantity ?? 0) + quantity;
    this.assertQuantity(edition, nextQty);
    if (existing) existing.quantity = nextQty;
    else cart.items.push({ id: id("item"), nftId, editionId, quantity, priceWhenAdded: edition.price });
    cart.version += 1;
    this.persist();
  }

  updateCartItem(cart: StoredCart, itemId: string, quantity: number) {
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new ApiError(404, "NOT_FOUND", "Item não encontrado no carrinho");
    const edition = this.findNft(item.nftId).editions.find((e) => e.id === item.editionId)!;
    this.assertQuantity(edition, quantity);
    item.quantity = quantity;
    // Explicitly changing the quantity acknowledges the current price.
    item.priceWhenAdded = edition.price;
    cart.version += 1;
    this.persist();
  }

  removeCartItem(cart: StoredCart, itemId: string) {
    const before = cart.items.length;
    cart.items = cart.items.filter((i) => i.id !== itemId);
    if (cart.items.length === before) throw new ApiError(404, "NOT_FOUND", "Item não encontrado no carrinho");
    cart.version += 1;
    this.persist();
  }

  acknowledgePrices(cart: StoredCart) {
    for (const item of cart.items) {
      const edition = this.findNft(item.nftId).editions.find((e) => e.id === item.editionId)!;
      item.priceWhenAdded = edition.price;
    }
    cart.version += 1;
    this.persist();
  }

  private assertQuantity(edition: Nft["editions"][number], quantity: number) {
    if (quantity > edition.maxPerOrder) {
      throw new ApiError(409, "QUANTITY_LIMIT", `Limite de ${edition.maxPerOrder} unidade(s) por pedido nesta edição`, undefined, { max: edition.maxPerOrder });
    }
    if (quantity > edition.available) {
      throw new ApiError(409, "OUT_OF_STOCK", `Apenas ${edition.available} unidade(s) disponível(is)`, undefined, { available: edition.available });
    }
  }

  coupon(code: string): CouponDef {
    const c = COUPONS.find((x) => x.code === code.trim().toUpperCase());
    if (!c) throw new ApiError(422, "COUPON_INVALID", "Cupom inválido", { code: "Cupom inválido" });
    if (new Date(c.expiresAt) <= now()) throw new ApiError(422, "COUPON_EXPIRED", "Este cupom expirou", { code: "Este cupom expirou" });
    return c;
  }

  applyCoupon(cart: StoredCart, code: string) {
    cart.couponCode = this.coupon(code).code;
    cart.version += 1;
    this.persist();
  }

  removeCoupon(cart: StoredCart) {
    cart.couponCode = null;
    cart.version += 1;
    this.persist();
  }

  /** Moves guest items into the user's cart (quantities capped by limits/stock). */
  mergeCarts(user: StoredUser, guestCartId: string) {
    const guest = this.state.carts.find((c) => c.id === guestCartId && c.ownerId === null);
    const cart = this.cartFor(user, null);
    if (!guest) return cart;
    for (const g of guest.items) {
      const edition = this.state.nfts.find((n) => n.id === g.nftId)?.editions.find((e) => e.id === g.editionId);
      if (!edition) continue;
      const existing = cart.items.find((i) => i.editionId === g.editionId);
      const qty = Math.min((existing?.quantity ?? 0) + g.quantity, edition.maxPerOrder, Math.max(edition.available, 1));
      if (existing) existing.quantity = qty;
      else cart.items.push({ ...g, id: id("item"), quantity: qty });
    }
    if (!cart.couponCode && guest.couponCode) cart.couponCode = guest.couponCode;
    this.state.carts = this.state.carts.filter((c) => c !== guest);
    cart.version += 1;
    this.persist();
    return cart;
  }

  /** Server-side pricing: every number the UI shows comes from here. */
  priceCart(cart: StoredCart, network: Network = "ethereum"): Cart {
    const items: CartItem[] = cart.items.flatMap((i) => {
      const nft = this.state.nfts.find((n) => n.id === i.nftId);
      const edition = nft?.editions.find((e) => e.id === i.editionId);
      if (!nft || !edition) return [];
      const status: CartItem["status"] =
        edition.available === 0
          ? "sold-out"
          : i.quantity > edition.available
            ? "insufficient-stock"
            : !eth.eq(edition.price, i.priceWhenAdded)
              ? "price-changed"
              : "ok";
      return [{
        id: i.id, nftId: nft.id, editionId: edition.id, name: nft.name, image: nft.image, tokenId: nft.tokenId,
        editionLabel: edition.label, quantity: i.quantity, unitPrice: edition.price,
        lineTotal: eth.mul(edition.price, i.quantity), available: edition.available, maxPerOrder: edition.maxPerOrder,
        priceWhenAdded: i.priceWhenAdded, status,
      }];
    });
    const billable = items.filter((i) => i.status !== "sold-out");
    const subtotal = eth.add("0", ...billable.map((i) => i.lineTotal));
    const couponDef = cart.couponCode ? COUPONS.find((c) => c.code === cart.couponCode) ?? null : null;
    const couponValid = couponDef && new Date(couponDef.expiresAt) > now();
    const discount = couponValid ? this.discountFor(couponDef, subtotal) : "0.00";
    const networkFee = billable.length ? NETWORK_FEES[network] : "0.00";
    return {
      id: cart.id,
      version: cart.version,
      items,
      coupon: couponValid ? { code: couponDef.code, description: couponDef.description } : null,
      subtotal,
      discount,
      networkFee,
      total: eth.add(eth.sub(subtotal, discount), networkFee),
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
    };
  }

  private discountFor(c: CouponDef, subtotal: string) {
    if (c.basisPoints) return eth.percent(subtotal, c.basisPoints);
    return eth.min(c.fixed ?? "0", subtotal);
  }

  // ---------------------------------------------------------------- checkout

  quote(user: StoredUser, network: Network): Quote {
    const cart = this.cartFor(user, null);
    const priced = this.priceCart(cart, network);
    if (!priced.items.length) throw new ApiError(422, "VALIDATION_ERROR", "Seu carrinho está vazio");
    const blocked = priced.items.find((i) => i.status === "sold-out" || i.status === "insufficient-stock");
    if (blocked) {
      throw new ApiError(409, "OUT_OF_STOCK", `${blocked.name} (${blocked.editionLabel}) não tem estoque suficiente`, undefined, { itemId: blocked.id });
    }
    if (cart.couponCode && !priced.coupon) {
      cart.couponCode = null;
      cart.version += 1;
      this.persist();
      throw new ApiError(422, "COUPON_EXPIRED", "O cupom aplicado expirou e foi removido");
    }
    const lines: QuoteLine[] = priced.items.map((i) => ({
      nftId: i.nftId, editionId: i.editionId, name: i.name, image: i.image, tokenId: i.tokenId,
      editionLabel: i.editionLabel, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal,
    }));
    const quote: StoredQuote = {
      id: id("quote"), ownerId: user.id, network, lines, coupon: priced.coupon,
      subtotal: priced.subtotal, discount: priced.discount, networkFee: priced.networkFee, total: priced.total,
      cartVersion: cart.version, expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
    };
    this.state.quotes = [...this.state.quotes.filter((q) => q.ownerId !== user.id), quote];
    this.persist();
    const { ownerId: _o, ...publicQuote } = quote;
    return publicQuote;
  }

  async createOrder(user: StoredUser, idempotencyKey: string, body: { quoteId: string; walletId: string; network: Network; collector: CollectorInput }) {
    const bodyHash = await stableHash(body);
    const previous = this.state.idempotency[idempotencyKey];
    if (previous) {
      if (previous.ownerId !== user.id || previous.bodyHash !== bodyHash) {
        throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Esta tentativa de compra já foi usada com outros dados");
      }
      return { order: this.publicOrder(this.state.orders.find((o) => o.id === previous.orderId)!), replay: true };
    }

    const wallet = this.listWallets(user.id).find((w) => w.id === body.walletId);
    if (!wallet) throw new ApiError(422, "VALIDATION_ERROR", "Selecione uma carteira cadastrada", { walletId: "Carteira inválida" });
    const quote = this.state.quotes.find((q) => q.id === body.quoteId && q.ownerId === user.id);
    const fresh = this.quote(user, body.network); // throws on stock problems
    const stale =
      !quote ||
      new Date(quote.expiresAt) <= now() ||
      quote.network !== body.network ||
      quote.total !== fresh.total ||
      JSON.stringify(quote.lines) !== JSON.stringify(fresh.lines) ||
      quote.coupon?.code !== fresh.coupon?.code;
    if (stale) {
      throw new ApiError(409, "QUOTE_STALE", "Os valores do pedido mudaram. Revise e confirme novamente.", undefined, { quote: fresh });
    }

    // Reserve stock now; released if the payment is declined.
    for (const line of fresh.lines) {
      const nft = this.findNft(line.nftId);
      const edition = nft.editions.find((e) => e.id === line.editionId)!;
      edition.available -= line.quantity;
      this.refreshNft(nft);
    }
    const created = now();
    const order: StoredOrder = {
      id: id("order"), ownerId: user.id, quoteId: fresh.id, status: "pending", version: 1, network: body.network,
      walletAddress: wallet.address, walletProvider: wallet.provider,
      lines: fresh.lines, coupon: fresh.coupon, subtotal: fresh.subtotal, discount: fresh.discount,
      networkFee: fresh.networkFee, total: fresh.total, txHash: null, explorerUrl: null, declineReason: null,
      createdAt: created.toISOString(), updatedAt: created.toISOString(),
      settleAt: new Date(created.getTime() + this.settleDelayMs).toISOString(),
    };
    this.state.orders.push(order);
    this.state.idempotency[idempotencyKey] = { ownerId: user.id, bodyHash, orderId: order.id };
    this.state.quotes = this.state.quotes.filter((q) => q.ownerId !== user.id);
    this.persist();
    for (const line of fresh.lines) this.emitNft(this.findNft(line.nftId));
    this.scheduleSettlement(order);
    return { order: this.publicOrder(order), replay: false };
  }

  publicOrder(o: StoredOrder): Order {
    const { ownerId: _o, quoteId: _q, settleAt: _s, ...order } = o;
    return order;
  }

  findOrder(user: StoredUser, orderId: string): Order {
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order) throw new ApiError(404, "NOT_FOUND", "Pedido não encontrado");
    if (order.ownerId !== user.id) throw new ApiError(403, "FORBIDDEN", "Este pedido pertence a outra conta");
    return this.publicOrder(order);
  }

  listOrders(user: StoredUser, status?: string): Order[] {
    return this.state.orders
      .filter((o) => o.ownerId === user.id && (!status || o.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => this.publicOrder(o));
  }

  private scheduleSettlement(order: StoredOrder) {
    const delay = Math.max(0, new Date(order.settleAt).getTime() - Date.now());
    this.timers.set(order.id, setTimeout(() => this.settle(order.id), delay));
  }

  private resumePendingOrders() {
    for (const o of this.state.orders) if (o.status === "pending") this.scheduleSettlement(o);
  }

  /** Terminal transition. Confirmed → remove exactly the purchased quantities from the cart. */
  settle(orderId: string, outcome?: "confirmed" | "declined") {
    this.timers.delete(orderId);
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order || order.status !== "pending") return;
    const status = outcome ?? (this.declinePayments ? "declined" : "confirmed");
    order.status = status;
    order.version += 1;
    order.updatedAt = now().toISOString();
    if (status === "confirmed") {
      order.txHash = `0x${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
      order.explorerUrl = `https://etherscan.io/tx/${order.txHash}#simulated`;
      const cart = this.state.carts.find((c) => c.ownerId === order.ownerId);
      if (cart) {
        for (const line of order.lines) {
          const item = cart.items.find((i) => i.editionId === line.editionId);
          if (item) item.quantity -= line.quantity;
        }
        cart.items = cart.items.filter((i) => i.quantity > 0);
        cart.version += 1;
      }
    } else {
      order.declineReason = "Pagamento recusado pela carteira (simulação)";
      for (const line of order.lines) {
        const nft = this.state.nfts.find((n) => n.id === line.nftId);
        const edition = nft?.editions.find((e) => e.id === line.editionId);
        if (nft && edition) {
          edition.available += line.quantity;
          this.refreshNft(nft);
        }
      }
    }
    this.persist();
    this.emit({
      type: "order.updated",
      eventId: id("evt"),
      occurredAt: order.updatedAt,
      version: order.version,
      resource: { type: "order", id: order.id, ownerId: order.ownerId },
      data: { status: order.status, order: this.publicOrder(order) },
    });
    if (status === "declined") for (const line of order.lines) this.emitNft(this.findNft(line.nftId));
  }
}

export const db = new MockDb();
