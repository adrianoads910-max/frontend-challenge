import { z } from "zod";
import { request } from "@/lib/http";
import {
  type AddToCartInput,
  Cart,
  CatalogPage,
  type CatalogQuery,
  type CreateOrderInput,
  Favorites,
  type LoginInput,
  Nft,
  type Network,
  Order,
  OrderList,
  type PasswordChangeInput,
  type ProfileInput,
  Quote,
  type RegisterInput,
  Session,
  User,
  Wallet,
  WalletConnection,
  type WalletInput,
  type WalletRole,
} from "./contracts";

/** All REST calls of the app. Components use these through TanStack Query hooks only. */

const NoContent = { parse: () => undefined };

export function catalogParams(q: CatalogQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.q) sp.set("q", q.q);
  if (q.tab && q.tab !== "all") sp.set("tab", q.tab);
  for (const c of q.categories ?? []) sp.append("category", c);
  for (const n of q.networks ?? []) sp.append("network", n);
  if (q.minPrice) sp.set("minPrice", q.minPrice);
  if (q.maxPrice) sp.set("maxPrice", q.maxPrice);
  if (q.sort && q.sort !== "recent") sp.set("sort", q.sort);
  if (q.page && q.page > 1) sp.set("page", String(q.page));
  return sp;
}

export const api = {
  auth: {
    register: (input: Omit<RegisterInput, "acceptTerms">) =>
      request({ method: "POST", url: "/auth/register", data: input }, Session),
    login: (input: LoginInput) => request({ method: "POST", url: "/auth/login", data: input }, Session),
    session: (signal?: AbortSignal) => request({ url: "/auth/session", signal }, Session),
    logout: () => request({ method: "POST", url: "/auth/logout" }, NoContent),
  },
  nfts: {
    list: (q: CatalogQuery, signal?: AbortSignal) => request({ url: "/nfts", params: catalogParams(q), signal }, CatalogPage),
    get: (id: string, signal?: AbortSignal) => request({ url: `/nfts/${encodeURIComponent(id)}`, signal }, Nft),
  },
  favorites: {
    list: (signal?: AbortSignal) => request({ url: "/me/favorites", signal }, Favorites),
    add: (nftId: string) => request({ method: "PUT", url: `/me/favorites/${encodeURIComponent(nftId)}` }, Favorites),
    remove: (nftId: string) => request({ method: "DELETE", url: `/me/favorites/${encodeURIComponent(nftId)}` }, Favorites),
  },
  cart: {
    get: (signal?: AbortSignal) => request({ url: "/cart", signal }, Cart),
    add: (input: AddToCartInput) => request({ method: "POST", url: "/cart/items", data: input }, Cart),
    update: (itemId: string, quantity: number) => request({ method: "PATCH", url: `/cart/items/${itemId}`, data: { quantity } }, Cart),
    remove: (itemId: string) => request({ method: "DELETE", url: `/cart/items/${itemId}` }, Cart),
    acknowledge: () => request({ method: "POST", url: "/cart/acknowledge" }, Cart),
    applyCoupon: (code: string) => request({ method: "POST", url: "/cart/coupon", data: { code } }, Cart),
    removeCoupon: () => request({ method: "DELETE", url: "/cart/coupon" }, Cart),
    merge: (guestCartId: string) => request({ method: "POST", url: "/cart/merge", data: { guestCartId } }, Cart),
  },
  checkout: {
    quote: (network: Network) => request({ method: "POST", url: "/checkout/quote", data: { network } }, Quote),
  },
  orders: {
    create: (input: CreateOrderInput, idempotencyKey: string) =>
      request({ method: "POST", url: "/orders", data: input, headers: { "Idempotency-Key": idempotencyKey } }, Order),
    get: (id: string, signal?: AbortSignal) => request({ url: `/orders/${encodeURIComponent(id)}`, signal }, Order),
    pending: (signal?: AbortSignal) => request({ url: "/orders", params: { status: "pending" }, signal }, OrderList),
  },
  profile: {
    get: (signal?: AbortSignal) => request({ url: "/me/profile", signal }, User),
    update: (input: ProfileInput) => request({ method: "PATCH", url: "/me/profile", data: input }, User),
    setAvatar: (dataUrl: string) => request({ method: "PUT", url: "/me/avatar", data: { dataUrl } }, User),
    removeAvatar: () => request({ method: "DELETE", url: "/me/avatar" }, User),
    changePassword: (input: PasswordChangeInput) => request({ method: "POST", url: "/me/password", data: input }, NoContent),
  },
  wallets: {
    list: (signal?: AbortSignal) => request({ url: "/me/wallets", signal }, z.object({ items: z.array(Wallet) })),
    create: (role: WalletRole, input: WalletInput) => request({ method: "POST", url: "/me/wallets", data: { ...input, role } }, Wallet),
    update: (id: string, input: WalletInput) => request({ method: "PUT", url: `/me/wallets/${id}`, data: input }, Wallet),
    connect: (id: string, network: Network) => request({ method: "POST", url: `/me/wallets/${id}/connect`, data: { network } }, WalletConnection),
    disconnect: (id: string) => request({ method: "POST", url: `/me/wallets/${id}/disconnect` }, NoContent),
  },
};

/**
 * Query keys. Private data is namespaced by user id, so two sessions can never share a cache entry
 * (and logout can drop the whole `["user", id]` subtree at once).
 */
export const qk = {
  catalog: (q: CatalogQuery) => ["catalog", q] as const,
  catalogAll: ["catalog"] as const,
  nft: (id: string) => ["nft", id] as const,
  session: ["session"] as const,
  cart: (owner: string) => ["cart", owner] as const,
  cartAll: ["cart"] as const,
  user: (userId: string) => ["user", userId] as const,
  favorites: (userId: string) => ["user", userId, "favorites"] as const,
  profile: (userId: string) => ["user", userId, "profile"] as const,
  wallets: (userId: string) => ["user", userId, "wallets"] as const,
  order: (userId: string, orderId: string) => ["user", userId, "order", orderId] as const,
  pendingOrders: (userId: string) => ["user", userId, "orders", "pending"] as const,
};
