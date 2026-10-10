import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./http";

/*
 * Cache policy (documented in ARCHITECTURE.md → "Cache, retries e sincronização"):
 *  - queries: staleTime 30 s; catalog/detail are additionally kept fresh by nft.updated events.
 *  - retries: only transient failures (network, timeout, 5xx/503), at most 2, exponential backoff.
 *    4xx (validation, 401, 404, 409) never retry: retrying cannot change the answer.
 *  - mutations: no automatic retry (not all are idempotent). Orders retry explicitly with the
 *    same Idempotency-Key, see useCreateOrder.
 *  - refetch on window focus for active queries; reconnect of the socket also reconciles.
 */

const shouldRetry = (failureCount: number, error: unknown) =>
  error instanceof ApiError && error.transient && error.code !== "CANCELLED" && failureCount < 2;

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache(),
    mutationCache: new MutationCache(),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}
