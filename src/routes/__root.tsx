import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "@/app/context";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MockPanel } from "@/components/mock-panel";
import { RealtimeAnnouncer } from "@/components/realtime-announcer";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="container-page grid min-h-[50vh] place-items-center py-20 text-center">
      <div>
        <h1 className="text-2xl font-bold">Algo deu errado nesta página.</h1>
        <p className="mt-2 text-sand">{import.meta.env.DEV ? error.message : "Tente novamente; se persistir, recarregue a página."}</p>
        <button type="button" onClick={reset} className="mt-6 rounded-md bg-copper px-5 py-2.5 font-bold text-ink hover:bg-copper-light">
          Tentar novamente
        </button>
      </div>
    </section>
  );
}

function RootLayout() {
  return (
    <>
      <a href="#conteudo" className="sr-only z-50 rounded-md bg-copper px-4 py-2 text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Pular para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
      <SiteFooter />
      <MobileTabBar />
      <RealtimeAnnouncer />
      {import.meta.env.VITE_ENABLE_MOCKS !== "false" && <MockPanel />}
    </>
  );
}

export function NotFound() {
  return (
    <section className="container-page grid min-h-[50vh] place-items-center py-20 text-center">
      <div>
        <p className="text-6xl font-bold text-copper">404</p>
        <h1 className="mt-4 text-2xl font-bold">Página não encontrada</h1>
        <p className="mt-2 text-sand">O endereço acessado não existe ou foi removido.</p>
        <Link to="/" className="mt-6 inline-block rounded-md bg-copper px-5 py-2.5 font-bold text-ink hover:bg-copper-light">
          Voltar ao início
        </Link>
      </div>
    </section>
  );
}
