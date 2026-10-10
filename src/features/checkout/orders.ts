import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateOrderInput, Network, Order } from "@/api/contracts";
import { api, qk } from "@/api/endpoints";
import { ApiError } from "@/lib/http";
import { sessionStore, useSession } from "@/lib/session";

/*
 * Order creation is the one operation that must never be duplicated:
 *  - one Idempotency-Key per purchase attempt (= per quote), persisted in sessionStorage so double
 *    clicks, automatic retries after a timeout and even a page refresh reuse the same key → the
 *    server returns the same order;
 *  - a different quote (prices changed → user confirmed again) gets a new key, because the body
 *    differs and reusing the key would be an IDEMPOTENCY_CONFLICT;
 *  - only transient failures (timeout, network, 503) are retried automatically.
 */

const ATTEMPTS_KEY = "kurio.checkout.attempts";
const MAX_ATTEMPTS = 3;

function readAttempts(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function idempotencyKeyFor(quoteId: string): string {
  const attempts = readAttempts();
  if (!attempts[quoteId]) {
    attempts[quoteId] = crypto.randomUUID();
    sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  }
  return attempts[quoteId];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useQuote() {
  return useMutation({ mutationFn: (network: Network) => api.checkout.quote(network) });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput): Promise<Order> => {
      const key = idempotencyKeyFor(input.quoteId);
      for (let attempt = 1; ; attempt++) {
        try {
          return await api.orders.create(input, key);
        } catch (error) {
          const retryable = error instanceof ApiError && (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR" || error.code === "TRANSIENT");
          if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
          await sleep(600 * attempt);
        }
      }
    },
    onSuccess: (order) => {
      const userId = sessionStore.userId();
      if (!userId) return;
      queryClient.setQueryData(qk.order(userId, order.id), order);
      void queryClient.invalidateQueries({ queryKey: qk.pendingOrders(userId) });
    },
  });
}

/** Pending orders of the current user: recovers an in-flight purchase after refresh/reconnect. */
export function usePendingOrders() {
  const session = useSession();
  return useQuery({
    queryKey: qk.pendingOrders(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) => api.orders.pending(signal).then((r) => r.items),
    enabled: Boolean(session),
  });
}

/**
 * An order. Realtime (order.updated) is the primary update path; while the order is pending a
 * slow REST poll is kept as a safety net in case the socket is down.
 */
export function useOrder(orderId: string) {
  const session = useSession();
  return useQuery({
    queryKey: qk.order(session?.user.id ?? "anonymous", orderId),
    queryFn: ({ signal }) => api.orders.get(orderId, signal),
    enabled: Boolean(session),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 5_000 : false),
    retry: (count, error) => error instanceof ApiError && error.transient && count < 2,
  });
}
