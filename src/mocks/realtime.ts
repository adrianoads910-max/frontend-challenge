import { toSocketIo } from "@mswjs/socket.io-binding";
import { ws } from "msw";
import type { NftUpdatedEvent, OrderUpdatedEvent } from "@/api/contracts";
import { db } from "./db";

/*
 * Socket.IO "server" running inside MSW, speaking the real Socket.IO protocol to socket.io-client
 * through @mswjs/socket.io-binding.
 *
 * Transport notes (see ARCHITECTURE.md → Realtime):
 *  - MSW only intercepts WebSocket, so the client is forced to `transports: ["websocket"]`
 *    (no HTTP long-polling handshake).
 *  - msw 2.15 does not match a URL pattern when the Socket.IO query string is present, so the link
 *    listens to "*" and non-Socket.IO sockets (e.g. Vite HMR) are passed through to the real server.
 *  - The binding has no rooms/namespaces: per-user delivery is done here by checking the owner of
 *    each order event against the connection's session.
 */

type Event = NftUpdatedEvent | OrderUpdatedEvent;

interface Client {
  userId: string | null;
  send: (event: Event) => void;
  close: () => void;
}

const clients = new Set<Client>();
/** While set, new Socket.IO connections are refused (realtime outage scenario). */
let blockedUntil = 0;

function canReceive(client: Client, event: Event) {
  return event.type === "nft.updated" || event.resource.ownerId === client.userId;
}

db.subscribe((event) => {
  for (const client of clients) if (canReceive(client, event)) client.send(event);
});

const link = ws.link("*");

export const realtimeHandlers = [
  link.addEventListener("connection", (connection) => {
    const url = new URL(connection.client.url);
    if (!url.pathname.startsWith("/socket.io")) {
      connection.server.connect();
      return;
    }
    if (Date.now() < blockedUntil) {
      connection.client.close();
      return;
    }
    const token = url.searchParams.get("token");
    const io = toSocketIo(connection);
    const client: Client = {
      userId: token ? db.sessionUserId(token) : null,
      send: (event) => io.client.emit(event.type, event),
      close: () => connection.client.close(),
    };
    clients.add(client);
    connection.client.addEventListener("close", () => clients.delete(client));
  }),
];

// ------------------------------------------------------------------ failure injection (control panel / tests)

/** Refuses (and drops) Socket.IO connections for `ms` milliseconds. */
export function blockConnections(ms: number): number {
  blockedUntil = Date.now() + ms;
  return disconnectAll();
}

/** Server-side drop of every socket: socket.io-client reconnects on its own. */
export function disconnectAll(): number {
  const count = clients.size;
  // Deleting the current element while iterating a Set is safe in JS.
  for (const c of clients) c.close();
  return count;
}

/** Re-delivers the last event unchanged (same eventId): the client must ignore it. */
export function replayLastEvent(type?: Event["type"]): Event | null {
  const event = [...db.recentEvents].reverse().find((e) => !type || e.type === type);
  if (!event) return null;
  for (const c of clients) if (canReceive(c, event)) c.send(event);
  return event;
}

/** Delivers an OLD version of the last nft.updated with a bogus price: must not regress the UI. */
export function sendStaleNftEvent(): Event | null {
  const last = [...db.recentEvents].reverse().find((e): e is NftUpdatedEvent => e.type === "nft.updated");
  if (!last) return null;
  const stale: NftUpdatedEvent = {
    ...last,
    eventId: `stale-${last.eventId}`,
    version: last.version - 1,
    data: { ...last.data, price: "999.99", editions: last.data.editions.map((e) => ({ ...e, price: "999.99" })) },
  };
  for (const c of clients) c.send(stale);
  return stale;
}

export const connectedClients = () => clients.size;
