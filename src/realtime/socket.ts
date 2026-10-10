import type { QueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import {
  type CatalogPage,
  type Nft,
  NftUpdatedEvent,
  type Order,
  OrderUpdatedEvent,
} from "@/api/contracts";
import { qk } from "@/api/endpoints";
import { eth } from "@/lib/eth";
import { sessionStore } from "@/lib/session";

/*
 * Realtime client. Guarantees (ARCHITECTURE.md → "Tempo real"):
 *  - duplicates are dropped by eventId; stale events by per-resource version (never regress);
 *  - order events of another user are dropped (ownerId ≠ current session);
 *  - after a reconnect, active resources are reconciled through REST;
 *  - a session change tears down the socket and every listener before reconnecting with the new
 *    identity, so events of a previous session can never touch the new user's cache.
 */

export type RealtimeNotice =
  | { kind: "nft-updated"; nftId: string; name?: string; priceUp?: boolean; soldOut: boolean }
  | { kind: "order-updated"; order: Order }
  | { kind: "connection"; status: "connected" | "reconnecting" | "offline" };

type NoticeListener = (notice: RealtimeNotice) => void;

const SEEN_LIMIT = 500;

export class RealtimeClient {
  private socket: Socket | null = null;
  private seen = new Set<string>();
  private versions = new Map<string, number>();
  private listeners = new Set<NoticeListener>();
  private connectedOnce = false;
  status: "connected" | "reconnecting" | "offline" = "offline";

  private readonly queryClient: QueryClient;

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
  }

  onNotice(listener: NoticeListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(notice: RealtimeNotice) {
    for (const l of this.listeners) l(notice);
  }

  /** (Re)connects with the identity of the current session. */
  connect(token: string | null) {
    this.disconnect();
    const socket = io(window.location.origin, {
      path: "/socket.io",
      transports: ["websocket"],
      query: token ? { token } : {},
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
    });
    this.socket = socket;

    socket.on("connect", () => {
      this.setStatus("connected");
      if (this.connectedOnce) this.reconcile();
      this.connectedOnce = true;
    });
    socket.on("disconnect", (reason) => {
      // "io client disconnect" = we closed it on purpose (logout / user switch).
      this.setStatus(reason === "io client disconnect" ? "offline" : "reconnecting");
    });
    socket.io.on("reconnect_attempt", () => this.setStatus("reconnecting"));
    socket.on("nft.updated", (raw: unknown) => this.handleNft(raw));
    socket.on("order.updated", (raw: unknown) => this.handleOrder(raw));
  }

  /** Removes every listener and closes the transport. Also clears per-session event state. */
  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.io.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.seen.clear();
    this.versions.clear();
    this.connectedOnce = false;
    this.setStatus("offline");
  }

  /** Test hook used by the control panel: drop the transport without forgetting the session. */
  get connected() {
    return this.socket?.connected ?? false;
  }

  private setStatus(status: RealtimeClient["status"]) {
    if (this.status === status) return;
    this.status = status;
    this.notify({ kind: "connection", status });
  }

  /** Returns false for duplicates and stale versions. */
  private accept(eventId: string, resourceKey: string, version: number, cachedVersion?: number) {
    if (this.seen.has(eventId)) return false;
    this.seen.add(eventId);
    if (this.seen.size > SEEN_LIMIT) this.seen.delete(this.seen.values().next().value!);
    const known = Math.max(this.versions.get(resourceKey) ?? 0, cachedVersion ?? 0);
    if (version <= known) return false;
    this.versions.set(resourceKey, version);
    return true;
  }

  private handleNft(raw: unknown) {
    const parsed = NftUpdatedEvent.safeParse(raw);
    if (!parsed.success) return;
    const event = parsed.data;
    const nftId = event.resource.id;
    const cached = this.queryClient.getQueryData<Nft>(qk.nft(nftId));
    if (!this.accept(event.eventId, `nft:${nftId}`, event.version, cached?.version)) return;

    const previousPrice = cached?.price;
    // Detail: patch editions in place.
    this.queryClient.setQueryData<Nft>(qk.nft(nftId), (nft) =>
      nft && {
        ...nft,
        version: event.version,
        price: event.data.price,
        previousPrice: event.data.previousPrice,
        soldOut: event.data.soldOut,
        editions: nft.editions.map((e) => {
          const update = event.data.editions.find((u) => u.id === e.id);
          return update ? { ...e, ...update } : e;
        }),
      },
    );
    // Catalog pages: patch the summary wherever it appears (ordering is reconciled on next fetch).
    this.queryClient.setQueriesData<CatalogPage>({ queryKey: qk.catalogAll }, (page) =>
      page && {
        ...page,
        items: page.items.map((item) =>
          item.id === nftId && item.version < event.version
            ? { ...item, price: event.data.price, previousPrice: event.data.previousPrice, soldOut: event.data.soldOut, version: event.version }
            : item,
        ),
      },
    );
    // Cart: the server re-prices; refetch whichever cart is active.
    void this.queryClient.invalidateQueries({ queryKey: qk.cartAll });
    this.notify({
      kind: "nft-updated",
      nftId,
      name: cached?.name,
      priceUp: previousPrice ? eth.cmp(event.data.price, previousPrice) > 0 : undefined,
      soldOut: event.data.soldOut,
    });
  }

  private handleOrder(raw: unknown) {
    const parsed = OrderUpdatedEvent.safeParse(raw);
    if (!parsed.success) return;
    const event = parsed.data;
    const userId = sessionStore.userId();
    if (!userId || event.resource.ownerId !== userId) return; // another session's event
    const key = qk.order(userId, event.resource.id);
    const cached = this.queryClient.getQueryData<Order>(key);
    if (!this.accept(event.eventId, `order:${event.resource.id}`, event.version, cached?.version)) return;
    this.queryClient.setQueryData<Order>(key, event.data.order);
    void this.queryClient.invalidateQueries({ queryKey: qk.pendingOrders(userId) });
    void this.queryClient.invalidateQueries({ queryKey: qk.cartAll });
    this.notify({ kind: "order-updated", order: event.data.order });
  }

  /** After a reconnect, events may have been missed: re-read active resources from REST. */
  private reconcile() {
    void this.queryClient.invalidateQueries({
      predicate: (q) => ["nft", "catalog", "cart"].includes(String(q.queryKey[0])) || (q.queryKey[0] === "user" && q.queryKey[2] === "order"),
      refetchType: "active",
    });
  }
}
