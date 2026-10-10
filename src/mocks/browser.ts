import { setupWorker } from "msw/browser";
import { controlHandlers } from "./control";
import { db } from "./db";
import { handlers } from "./handlers";
import { realtimeHandlers } from "./realtime";
import { scenario } from "./scenarios";

/**
 * Starts the mock backend (REST via Service Worker, Socket.IO via WebSocket interception).
 * Must resolve BEFORE socket.io-client is imported — see main.tsx.
 */
export async function startMockBackend(): Promise<void> {
  await db.init();
  const active = scenario.load();
  db.declinePayments = active === "payment-declined";
  const worker = setupWorker(...controlHandlers, ...handlers, ...realtimeHandlers);
  await worker.start({
    quiet: import.meta.env.PROD,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    // Only /api and /__mock are mocked; assets, fonts and images go to the real server.
    onUnhandledRequest: "bypass",
  });
}
