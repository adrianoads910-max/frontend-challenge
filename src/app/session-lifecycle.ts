import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Session } from "@/api/contracts";
import { api, qk } from "@/api/endpoints";
import { guestCartId, onSessionExpired, resetGuestCartId } from "@/lib/http";
import { sessionStore } from "@/lib/session";
import type { RealtimeClient } from "@/realtime/socket";

/*
 * Reacts to identity changes (login, logout, expiry, user switch):
 *  1. drops every private cache entry of the previous user + the cart;
 *  2. reconnects the socket with the new identity (old listeners released first);
 *  3. on login, merges the guest cart into the account cart.
 * It runs synchronously inside sessionStore.set(), so no component can render the new user with
 * the previous user's data.
 */

export interface SessionLifecycle {
  /** Called by login/register forms. Sets the session, then merges the guest cart. */
  signIn(session: Session): Promise<void>;
  signOut(): Promise<void>;
  /** Becomes true when the server rejected our token; the UI then asks to sign in again. */
  expired: boolean;
}

export function setupSessionLifecycle(
  queryClient: QueryClient,
  realtime: RealtimeClient,
  onExpired: () => void,
): SessionLifecycle {
  const lifecycle: SessionLifecycle = {
    expired: false,
    async signIn(session) {
      const guestId = guestCartId();
      lifecycle.expired = false;
      sessionStore.set(session);
      try {
        const cart = await api.cart.merge(guestId);
        queryClient.setQueryData(qk.cart(session.user.id), cart);
      } catch {
        // Merge failure is not fatal: the account cart is still valid; refetch it.
        void queryClient.invalidateQueries({ queryKey: qk.cart(session.user.id) });
      }
      resetGuestCartId();
    },
    async signOut() {
      try {
        await api.auth.logout();
      } catch {
        /* the token is dropped locally regardless */
      }
      sessionStore.set(null);
      resetGuestCartId();
    },
  };

  sessionStore.subscribe((next, previous) => {
    if (next?.user.id === previous?.user.id && next?.token === previous?.token) return;
    if (previous) queryClient.removeQueries({ queryKey: qk.user(previous.user.id) });
    queryClient.removeQueries({ queryKey: qk.cartAll });
    if (previous && next?.user.id !== previous.user.id) {
      // Pending mutations of the previous user must not land in the new user's cache.
      queryClient.getMutationCache().clear();
    }
    realtime.connect(next?.token ?? null);
  });

  onSessionExpired(() => {
    if (!sessionStore.get()) return;
    lifecycle.expired = true;
    sessionStore.set(null);
    resetGuestCartId();
    toast.warning("Sua sessão expirou. Entre novamente para continuar.");
    onExpired();
  });

  // Boot: connect with the stored identity, then confirm the stored session is still valid.
  realtime.connect(sessionStore.token());
  const stored = sessionStore.get();
  if (stored) {
    api.auth
      .session()
      .then((fresh) => sessionStore.set(fresh))
      .catch(() => {
        /* a 401 is handled by onSessionExpired; network errors keep the optimistic session */
      });
  }
  return lifecycle;
}
