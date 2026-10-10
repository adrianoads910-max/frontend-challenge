import { useQueries } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api, qk } from "@/api/endpoints";
import { requireAuth } from "@/app/guards";
import { Button } from "@/components/ui/button";
import { AccountLayout } from "@/features/account/account-layout";
import { NftCard, NftCardSkeleton } from "@/features/catalog/nft-card";
import { useFavorites } from "@/hooks/data";

export const Route = createFileRoute("/favoritos")({
  beforeLoad: requireAuth,
  head: () => ({ meta: [{ title: "Lista de interesse — Kurio" }] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const favorites = useFavorites();
  const ids = favorites.data?.nftIds ?? [];
  // Each NFT shares its cache entry with the detail page (and is kept fresh by nft.updated).
  const nfts = useQueries({ queries: ids.map((id) => ({ queryKey: qk.nft(id), queryFn: ({ signal }: { signal: AbortSignal }) => api.nfts.get(id, signal) })) });

  return (
    <AccountLayout>
      <h1 className="mb-8 text-lg font-bold">Lista de interesse</h1>
      {favorites.isPending ? (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <NftCardSkeleton key={i} />)}</div>
      ) : favorites.isError ? (
        <div role="alert" className="space-y-3">
          <p>Não foi possível carregar seus favoritos.</p>
          <Button onClick={() => void favorites.refetch()}>Tentar novamente</Button>
        </div>
      ) : ids.length === 0 ? (
        <div role="status" className="rounded-md border border-dashed border-line p-10 text-center">
          <p className="font-bold">Nenhum NFT favoritado ainda.</p>
          <Link to="/" hash="catalogo" className="mt-3 inline-block text-copper-light hover:underline">Explorar o mercado</Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
          {nfts.map((q, i) => (
            <li key={ids[i]}>{q.data ? <NftCard nft={q.data} /> : <NftCardSkeleton />}</li>
          ))}
        </ul>
      )}
    </AccountLayout>
  );
}
