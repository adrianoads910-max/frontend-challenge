import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/query-client";
import { sessionStore } from "@/lib/session";
import { RealtimeClient } from "@/realtime/socket";
import { routeTree } from "@/routeTree.gen";
import { AppContext, type AppServices } from "./context";
import { setupSessionLifecycle } from "./session-lifecycle";

export function mountApp(container: HTMLElement) {
  const queryClient = createQueryClient();
  const realtime = new RealtimeClient(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient, session: sessionStore.get },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0, // TanStack Query owns freshness
    scrollRestoration: true,
  });

  const lifecycle = setupSessionLifecycle(queryClient, realtime, () => {
    // Keep the current location so the user resumes exactly where the session expired.
    const here = router.state.location.href;
    if (!here.startsWith("/entrar")) void router.navigate({ to: "/entrar", search: { redirect: here, expired: true } });
  });

  // Private routes re-check access whenever the identity changes.
  sessionStore.subscribe(() => void router.invalidate());

  const services: AppServices = { queryClient, realtime, lifecycle };

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AppContext.Provider value={services}>
          <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster position="bottom-right" closeButton />
          </TooltipProvider>
        </AppContext.Provider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter<typeof routeTree>>;
  }
}
