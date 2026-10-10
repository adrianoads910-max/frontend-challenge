import { useSyncExternalStore } from "react";
import { Session, type User } from "@/api/contracts";

/*
 * Session store: the token survives refreshes (localStorage) and is re-validated against
 * GET /api/auth/session on boot. Every change notifies subscribers synchronously so that the query
 * cache and the socket can be torn down BEFORE another user's data can be requested.
 */

const KEY = "kurio.session";

type Listener = (next: Session | null, previous: Session | null) => void;

let current: Session | null = read();
const listeners = new Set<Listener>();

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = Session.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const sessionStore = {
  get: () => current,
  token: () => current?.token ?? null,
  userId: () => current?.user.id ?? null,
  set(next: Session | null) {
    const previous = current;
    current = next;
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode: session lives in memory only */
    }
    for (const l of listeners) l(next, previous);
  },
  updateUser(user: User) {
    if (current) sessionStore.set({ ...current, user });
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useSession(): Session | null {
  return useSyncExternalStore(
    (cb) => sessionStore.subscribe(cb),
    () => current,
  );
}
