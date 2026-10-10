import type { QueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { Session } from "@/api/contracts";
import type { RealtimeClient } from "@/realtime/socket";
import type { SessionLifecycle } from "./session-lifecycle";

export interface AppServices {
  queryClient: QueryClient;
  realtime: RealtimeClient;
  lifecycle: SessionLifecycle;
}

export const AppContext = createContext<AppServices | null>(null);

export function useServices(): AppServices {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppContext missing");
  return ctx;
}

/** Router context: available in beforeLoad/loader of every route. */
export interface RouterContext {
  queryClient: QueryClient;
  session: () => Session | null;
}
