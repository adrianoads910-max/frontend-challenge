import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { CATEGORIES, CatalogTab, type CatalogQuery, Eth, NETWORKS, Sort } from "@/api/contracts";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CatalogFilters } from "@/features/catalog/filters";
import { FeaturedNft, Hero, Journal, Promos } from "@/features/catalog/home-sections";
import { NftCard, NftCardSkeleton } from "@/features/catalog/nft-card";
import { useCatalog } from "@/hooks/data";
import { ApiError } from "@/lib/http";
import { cn } from "@/lib/utils";

/** URL search state of the home page. Invalid values are dropped field by field (never throw). */
const HomeSearch = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  tab: CatalogTab.optional().catch(undefined),
  categories: z.array(z.enum(CATEGORIES)).optional().catch(undefined),
  networks: z.array(z.enum(NETWORKS)).optional().catch(undefined),
  minPrice: Eth.optional().catch(undefined),
  maxPrice: Eth.optional().catch(undefined),
  sort: Sort.optional().catch(undefined),
  page: z.number().int().min(1).max(500).optional().catch(undefined),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => HomeSearch.parse(search),
  head: () => ({ meta: [{ title: "Kurio — Marketplace de NFTs" }] }),
  component: HomePage,
});

const SORT_LABELS: Record<NonNullable<CatalogQuery["sort"]>, string> = {
  recent: "Listados recentemente",
  "price-asc": "Menor preço",
  "price-desc": "Maior preço",
  popular: "Mais populares",
};
const TAB_LABELS: Record<NonNullable<CatalogQuery["tab"]>, string> = { all: "Todos os NFTs", new: "Novos lançamentos", trending: "Em alta" };

function HomePage() {
  const query = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const catalog = useCatalog(query);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /** Any filter change resets pagination; history entries keep every state restorable. */
  const update = (patch: Partial<CatalogQuery>, resetPage = true) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, ...(resetPage ? { page: undefined } : {}) }), hash: "catalogo", resetScroll: false });

  const activeFilters = (query.categories?.length ?? 0) + (query.networks?.length ?? 0) + (query.minPrice || query.maxPrice ? 1 : 0);
  const data = catalog.data;

  return (
    <>
      <MobileSearch query={query} onSearch={(q) => update({ q })} onOpenFilters={() => setFiltersOpen(true)} activeFilters={activeFilters} />
      <Hero />

      <section id="catalogo" aria-labelledby="catalog-title" className="container-page mt-12 scroll-mt-4 md:mt-[52px]">
        <h2 id="catalog-title" className="sr-only">Catálogo de NFTs</h2>
        <div className="grid gap-8 lg:grid-cols-[310px_1fr] lg:gap-[26px]">
          <aside aria-label="Filtros" className="hidden flex-col gap-10 lg:flex">
            <div className="rounded-md bg-surface-card p-5">
              <CatalogFilters query={query} facets={data?.facets} onChange={update} idPrefix="desk" />
            </div>
            <FeaturedNft />
          </aside>

          <div className="min-w-0">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div role="group" aria-label="Seções do catálogo" className="flex gap-5 overflow-x-auto text-[15px]">
                {(Object.keys(TAB_LABELS) as Array<keyof typeof TAB_LABELS>).map((tab) => {
                  const active = (query.tab ?? "all") === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ tab: tab === "all" ? undefined : tab })}
                      className={cn("shrink-0 border-b-2 pb-1 whitespace-nowrap", active ? "border-copper font-bold text-copper-light" : "border-transparent hover:text-copper-light")}
                    >
                      {TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger render={<Button variant="outline" size="sm" className="hidden md:inline-flex lg:hidden" />}>
                    <SlidersHorizontal className="size-4" aria-hidden /> Filtros{activeFilters ? ` (${activeFilters})` : ""}
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[320px] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Filtros</SheetTitle>
                      <SheetDescription>Os filtros são combináveis e aplicados imediatamente.</SheetDescription>
                    </SheetHeader>
                    <div className="px-4 pb-8">
                      <CatalogFilters query={query} facets={data?.facets} onChange={update} idPrefix="mob" />
                    </div>
                  </SheetContent>
                </Sheet>
                <label className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="sr-only whitespace-nowrap sm:not-sr-only">Ordenar por:</span>
                  <select
                    value={query.sort ?? "recent"}
                    onChange={(e) => update({ sort: e.target.value === "recent" ? undefined : (e.target.value as CatalogQuery["sort"]) })}
                    aria-label="Ordenar por"
                    className="h-8 max-w-full min-w-0 rounded-md border border-line bg-ink px-2 text-sm hover:border-copper"
                  >
                    {Object.entries(SORT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <ActiveFilterSummary query={query} total={data?.total} onClear={() => navigate({ search: {}, hash: "catalogo", resetScroll: false })} />

            <CatalogResults catalog={catalog} />

            {data && data.totalPages > 1 && (
              <Pagination page={data.page} totalPages={data.totalPages} onPage={(page) => update({ page: page === 1 ? undefined : page }, false)} />
            )}
          </div>
        </div>
      </section>

      <Promos />
      <Journal />
    </>
  );
}

function CatalogResults({ catalog }: { catalog: ReturnType<typeof useCatalog> }) {
  const { data, isPending, isError, error, refetch, isPlaceholderData, isFetching } = catalog;

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:gap-x-[26px]" aria-busy="true" aria-label="Carregando NFTs">
        {Array.from({ length: 9 }, (_, i) => <NftCardSkeleton key={i} />)}
      </div>
    );
  }
  if (isError) {
    const offline = error instanceof ApiError && (error.code === "NETWORK_ERROR" || error.code === "TIMEOUT");
    return (
      <div role="alert" className="rounded-md border border-line bg-surface-card p-8 text-center">
        <Icon name="danger-triangle" size={28} className="mx-auto mb-3 text-coral" />
        <p className="font-bold">{offline ? "Sem conexão com o servidor." : "Não foi possível carregar os NFTs."}</p>
        <p className="mt-1 text-sm text-sand">{error instanceof ApiError ? error.message : "Tente novamente em instantes."}</p>
        <Button className="mt-4" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Tentando…" : "Tentar novamente"}
        </Button>
      </div>
    );
  }
  if (data.items.length === 0) {
    return (
      <div role="status" className="rounded-md border border-dashed border-line p-10 text-center">
        <p className="font-bold">Nenhum NFT encontrado.</p>
        <p className="mt-1 text-sm text-sand">Ajuste a busca ou remova alguns filtros.</p>
      </div>
    );
  }
  return (
    <div className="relative" aria-busy={isPlaceholderData}>
      <p className="sr-only" role="status">{isPlaceholderData ? "Atualizando resultados…" : `${data.total} NFTs encontrados`}</p>
      <ul aria-label="Resultados" aria-busy={isPlaceholderData} className={cn("grid grid-cols-2 gap-x-4 gap-y-8 transition-opacity md:grid-cols-3 lg:gap-x-[26px]", isPlaceholderData && "opacity-60")}>
        {data.items.map((nft, i) => (
          <li key={nft.id}>
            <NftCard nft={nft} priority={i < 3} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActiveFilterSummary({ query, total, onClear }: { query: CatalogQuery; total?: number; onClear: () => void }) {
  const any = query.q || query.categories?.length || query.networks?.length || query.minPrice || query.maxPrice || query.tab || query.sort;
  if (!any) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-sand">
      {query.q && <span>Busca: “<strong className="text-cream">{query.q}</strong>”</span>}
      {total !== undefined && <span>{total} resultado(s)</span>}
      <button type="button" onClick={onClear} className="text-copper-light underline-offset-4 hover:underline">Limpar filtros</button>
    </div>
  );
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const btn = "grid size-[30px] place-items-center rounded-sm border border-line text-sm transition-colors hover:border-copper";
  return (
    <nav aria-label="Paginação" className="mt-12 flex justify-end">
      <ul className="flex gap-2">
        <li>
          <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Página anterior">
            <Icon name="arrow-left-2" size={16} />
          </button>
        </li>
        {pages.map((p) => (
          <li key={p}>
            <button type="button" onClick={() => onPage(p)} aria-current={p === page ? "page" : undefined} aria-label={`Página ${p}`} className={cn(btn, p === page && "border-copper bg-copper font-bold text-ink")}>
              {p}
            </button>
          </li>
        ))}
        <li>
          <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page === totalPages} aria-label="Próxima página">
            <Icon name="arrow-right-2" size={16} />
          </button>
        </li>
      </ul>
    </nav>
  );
}

function MobileSearch({ query, onSearch, onOpenFilters, activeFilters }: { query: CatalogQuery; onSearch: (q: string | undefined) => void; onOpenFilters: () => void; activeFilters: number }) {
  const [value, setValue] = useState(query.q ?? "");
  return (
    <div className="container-page flex gap-2.5 pt-6 md:hidden">
      <form
        role="search"
        className="flex h-11 flex-1 items-center gap-2 rounded-xl bg-surface-card px-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(value.trim() || undefined);
        }}
      >
        <Icon name="search" className="text-sand" />
        <label htmlFor="mobile-search" className="sr-only">Buscar NFTs</label>
        <input id="mobile-search" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Explorar coleções" className="h-full min-w-0 flex-1 bg-transparent text-sm placeholder:text-sand" />
      </form>
      <button type="button" onClick={onOpenFilters} aria-label={`Abrir filtros${activeFilters ? ` (${activeFilters} ativos)` : ""}`} className="grid size-11 place-items-center rounded-xl bg-copper text-ink">
        <Icon name="filter" />
      </button>
    </div>
  );
}
