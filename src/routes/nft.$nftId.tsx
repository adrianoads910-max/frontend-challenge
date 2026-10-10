import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Heart, Search, ShoppingCart, Star } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Edition, Nft } from "@/api/contracts";
import { Icon } from "@/components/icon";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FavoriteButton } from "@/features/catalog/favorite-button";
import { NftCard } from "@/features/catalog/nft-card";
import { useAddToCart, useCatalog, useFavorites, useNft, useToggleFavorite } from "@/hooks/data";
import { eth } from "@/lib/eth";
import { ApiError } from "@/lib/http";
import { artworkSrcSet, artworkUrl } from "@/lib/images";
import { NETWORK_LABELS } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { NotFound } from "./__root";

export const Route = createFileRoute("/nft/$nftId")({
  component: NftDetailPage,
});

function NftDetailPage() {
  const { nftId } = Route.useParams();
  const { data: nft, isPending, isError, error, refetch, isFetching } = useNft(nftId);

  useEffect(() => {
    if (nft) document.title = `${nft.name} — Kurio`;
  }, [nft]);

  if (isPending) return <DetailSkeleton />;
  if (isError) {
    if (error instanceof ApiError && error.status === 404) return <NotFound title="NFT não encontrado" description="Este NFT não existe ou foi removido do catálogo." />;
    return (
      <section role="alert" className="container-page py-20 text-center">
        <p className="font-bold">Não foi possível carregar este NFT.</p>
        <p className="mt-1 text-sm text-sand">{error instanceof ApiError ? error.message : "Tente novamente."}</p>
        <Button className="mt-4" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Tentando…" : "Tentar novamente"}
        </Button>
      </section>
    );
  }
  return <NftDetail key={nft.id} nft={nft} />;
}

/** First edition that can still be bought (the Figma highlights 1/50). */
function defaultEdition(nft: Nft): Edition | undefined {
  return nft.editions.find((e) => e.id.endsWith("-e50") && e.available > 0) ?? nft.editions.find((e) => e.available > 0);
}

/** Artwork key of the n-th gallery image (gallery holds 1024px URLs). */
const galleryKey = (nft: Nft, index: number) =>
  index === 0 ? nft.image : (nft.gallery[index]?.split("/").pop()?.replace(/-\d+\.webp$/, "") ?? nft.image);

function NftDetail({ nft }: { nft: Nft }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [editionId, setEditionId] = useState(() => defaultEdition(nft)?.id ?? nft.editions[0]!.id);
  const edition = nft.editions.find((e) => e.id === editionId)!;
  const limit = Math.min(edition.available, edition.maxPerOrder);
  const [requestedQuantity, setQuantity] = useState(1);
  // Always within the current edition limits (edition switch or realtime stock change).
  const quantity = Math.max(1, Math.min(requestedQuantity, Math.max(limit, 1)));
  const [image, setImage] = useState(0);
  const [zoom, setZoom] = useState(false);
  const addToCart = useAddToCart();
  const [formError, setFormError] = useState<string | null>(null);
  const qtyId = useId();

  // Realtime: flag a price change that happened while the page is open (reset on edition switch,
  // using React's "adjust state while rendering" pattern instead of an effect).
  const [seenPrice, setSeenPrice] = useState({ editionId, price: edition.price });
  if (seenPrice.editionId !== editionId) setSeenPrice({ editionId, price: edition.price });
  const priceChanged = seenPrice.editionId === editionId && !eth.eq(seenPrice.price, edition.price);

  const buy = (goToCart: boolean) => {
    setFormError(null);
    addToCart.mutate(
      { nftId: nft.id, editionId: edition.id, quantity },
      {
        onSuccess: () => {
          toast.success(`${nft.name} (${edition.label}) adicionado ao carrinho`);
          if (goToCart) void navigate({ to: "/carrinho" });
        },
        onError: (err) => setFormError(err instanceof ApiError ? err.message : "Não foi possível adicionar ao carrinho."),
      },
    );
  };

  const currentImage = galleryKey(nft, image);
  const unavailable = limit === 0;

  return (
    <article className="pb-44 md:pb-0" aria-labelledby="nft-title">
      {/* ---------- mobile top bar */}
      <div className="container-page flex items-center justify-between pt-6 md:hidden">
        <button type="button" onClick={() => router.history.back()} aria-label="Voltar" className="grid size-[34px] place-items-center rounded-full border border-line">
          <Icon name="arrow-left-2" size={18} />
        </button>
        <FavoriteButton nftId={nft.id} name={nft.name} />
      </div>

      <nav aria-label="Trilha" className="container-page hidden pt-7 pb-3 text-sm font-bold md:block">
        <ol className="flex gap-2">
          <li><Link to="/" className="hover:text-copper-light">Início</Link> /</li>
          <li><Link to="/" hash="catalogo" className="hover:text-copper-light">Mercado</Link></li>
          <li className="sr-only" aria-current="page">{nft.name}</li>
        </ol>
      </nav>

      <div className="container-page mt-4 grid gap-8 md:mt-0 md:grid-cols-2 lg:grid-cols-[100px_444px_minmax(0,1fr)] lg:gap-[26px] xl:gap-8">
        {/* thumbnails */}
        <div role="group" aria-label="Galeria de imagens" className="order-2 flex gap-4 overflow-x-auto md:col-span-2 lg:order-none lg:col-span-1 lg:flex-col">
          {nft.gallery.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setImage(i)}
              aria-label={`Mostrar imagem ${i + 1} de ${nft.gallery.length}`}
              aria-pressed={image === i}
              className={cn("shrink-0 overflow-hidden rounded-md border-2", image === i ? "border-copper" : "border-transparent hover:border-line-soft")}
            >
              <img src={artworkUrl(galleryKey(nft, i), 256)} alt="" width={100} height={100} loading="lazy" className="size-[84px] object-cover lg:size-[96px]" />
            </button>
          ))}
        </div>

        {/* main image */}
        <div className="relative order-1 rounded-md bg-surface-card p-5 lg:order-none">
          <img
            src={artworkUrl(currentImage, 1024)}
            srcSet={artworkSrcSet(currentImage)}
            sizes="(min-width: 1024px) 404px, 90vw"
            alt={`Arte do NFT ${nft.name}${image ? ` (imagem ${image + 1})` : ""}`}
            width={404}
            height={404}
            fetchPriority="high"
            className={cn("aspect-square w-full rounded-2xl object-cover", nft.soldOut && "grayscale")}
          />
          <button type="button" onClick={() => setZoom(true)} aria-label="Ampliar imagem" className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-ink/80 hover:text-copper-light">
            <Search className="size-5" aria-hidden />
          </button>
          <Dialog open={zoom} onOpenChange={setZoom}>
            <DialogContent className="sm:max-w-[min(92vw,820px)]">
              <DialogTitle>{nft.name}</DialogTitle>
              <DialogDescription className="sr-only">Imagem ampliada</DialogDescription>
              <img src={artworkUrl(currentImage, 1024)} alt={`Arte do NFT ${nft.name} ampliada`} className="w-full rounded-lg" />
            </DialogContent>
          </Dialog>
        </div>

        {/* info */}
        <div className="order-3 flex flex-col gap-4 md:col-span-2 lg:order-none lg:col-span-1">
          <h1 id="nft-title" className="text-[26px] leading-8 font-bold">{nft.name}</h1>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <p className="text-[22px] font-bold text-copper-light">
              <span className="sr-only">Preço da edição {edition.label}: </span>
              {eth.format(edition.price)} ETH
              {edition.previousPrice && <span className="ml-3 text-base font-normal text-sand line-through">{eth.format(edition.previousPrice)} ETH</span>}
              {priceChanged && (
                <span role="status" className="ml-3 rounded-sm bg-copper/20 px-2 py-0.5 align-middle text-xs font-bold">Preço atualizado agora</span>
              )}
            </p>
            <p className="flex items-center gap-1.5 text-sm">
              <span aria-hidden className="flex text-copper-light">
                {Array.from({ length: 5 }, (_, i) => <Star key={i} className="size-3.5" fill="currentColor" />)}
              </span>
              <span>{nft.rating} · {nft.ratingCount} avaliações de colecionadores</span>
            </p>
          </div>

          <section aria-labelledby="about-title">
            <h2 id="about-title" className="mb-2 text-sm font-bold">Sobre este NFT:</h2>
            <p className="text-sm leading-6 text-sand">
              Um colecionável digital finalizado à mão da coleção Kurio Editions, verificado na {NETWORK_LABELS[nft.network]}, com arte desbloqueável e acesso para colecionadores.
            </p>
          </section>

          <fieldset>
            <legend className="mb-2 text-sm font-bold">Edição:</legend>
            <div className="flex flex-wrap gap-2.5">
              {nft.editions.map((e) => {
                const soldOut = e.available === 0;
                return (
                  <label
                    key={e.id}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-copper-light",
                      e.id === editionId ? "border-copper font-bold text-copper-light" : "border-line hover:border-line-soft",
                      soldOut && "cursor-not-allowed text-khaki line-through opacity-60",
                    )}
                  >
                    <input type="radio" name="edition" value={e.id} checked={e.id === editionId} disabled={soldOut} onChange={() => setEditionId(e.id)} className="sr-only" />
                    {e.label === "Aberta" ? "ABERTA" : e.label}
                    {soldOut && <span className="sr-only"> (esgotada)</span>}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-sand" aria-live="polite">
              {unavailable
                ? nft.soldOut
                  ? "Este NFT está esgotado em todas as edições."
                  : "Esta edição está esgotada. Escolha outra edição."
                : `${edition.kind === "open" ? "Edição aberta" : `Restam ${edition.available}`} · máximo de ${edition.maxPerOrder} por pedido`}
            </p>
          </fieldset>

          <div className="hidden flex-wrap items-center justify-between gap-4 md:flex">
            <QuantityStepper id={qtyId} value={quantity} max={limit} onChange={setQuantity} disabled={unavailable} />
            <div className="flex gap-2">
              <Button onClick={() => buy(true)} disabled={unavailable || addToCart.isPending} className="h-10 min-w-32 rounded-md px-8 text-sm font-bold">
                {addToCart.isPending ? "Adicionando…" : unavailable ? "ESGOTADO" : "COMPRAR"}
              </Button>
              <FavoriteTextButton nft={nft} />
            </div>
          </div>
          {formError && <p role="alert" className="text-sm text-coral">{formError}</p>}

          <dl className="space-y-2 text-sm text-sand">
            <div className="flex gap-2"><dt>ID do token:</dt><dd>{nft.tokenId}</dd></div>
            <div className="flex gap-2"><dt>Coleção:</dt><dd>{nft.collection}</dd></div>
            <div className="flex gap-2"><dt>Atributos:</dt><dd>{nft.attributes.join(", ")}</dd></div>
          </dl>
          <ShareLinks name={nft.name} />
        </div>
      </div>

      <DetailTabs nft={nft} />
      <MoreFromCollection currentId={nft.id} />

      {/* ---------- mobile purchase bar */}
      <div className="fixed inset-x-0 bottom-[72px] z-30 rounded-t-[28px] bg-surface-card px-6 py-4 shadow-[0_-8px_24px_rgb(10_6_4/0.45)] md:hidden">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold" aria-hidden>Qtd.</span>
            <QuantityStepper id={`${qtyId}-m`} value={quantity} max={limit} onChange={setQuantity} disabled={unavailable} compact />
          </div>
          <p className="text-xl font-bold text-copper-light">
            <span className="sr-only">Total: </span>
            {eth.format(eth.mul(edition.price, quantity))} ETH
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => buy(true)} disabled={unavailable || addToCart.isPending} className="h-12 flex-1 rounded-full bg-gradient-to-r from-copper to-[#b97a45] text-base font-bold">
            {unavailable ? "Esgotado" : "Comprar NFT"}
          </Button>
          <Button variant="outline" onClick={() => buy(false)} disabled={unavailable || addToCart.isPending} className="size-12 rounded-full" aria-label="Adicionar ao carrinho sem sair da página">
            <ShoppingCart className="size-5" aria-hidden />
          </Button>
        </div>
      </div>
    </article>
  );
}

function FavoriteTextButton({ nft }: { nft: Nft }) {
  const session = useSession();
  const navigate = useNavigate();
  const { data } = useFavorites();
  const toggle = useToggleFavorite();
  const favorite = data?.nftIds.includes(nft.id) ?? false;
  return (
    <Button
      variant="outline"
      aria-pressed={favorite}
      onClick={() => {
        if (!session) return void navigate({ to: "/entrar", search: { redirect: `/nft/${nft.id}` } });
        toggle.mutate({ nftId: nft.id, favorite: !favorite, name: nft.name });
      }}
      className="h-10 gap-2 rounded-md border-copper px-3 text-sm text-copper-light"
    >
      <Heart className="size-5" fill={favorite ? "currentColor" : "none"} aria-hidden />
      {favorite ? "Favoritado" : "Favoritar"}
    </Button>
  );
}

function ShareLinks({ name }: { name: string }) {
  const url = window.location.href;
  const text = encodeURIComponent(`${name} na Kurio`);
  const links = [
    { label: "LinkedIn", icon: "linkedin" as const, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: "e-mail", icon: "message" as const, href: `mailto:?subject=${text}&body=${encodeURIComponent(url)}` },
    { label: "Twitter", icon: "twitter" as const, href: `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}` },
  ];
  return (
    <p className="flex items-center gap-3 text-sm font-bold">
      Compartilhar este NFT:
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`Compartilhar por ${l.label} (abre em nova aba)`} className="hover:text-copper-light">
          <Icon name={l.icon} />
        </a>
      ))}
    </p>
  );
}

function DetailTabs({ nft }: { nft: Nft }) {
  const [first, rest] = nft.description.split(". A propriedade");
  return (
    <section className="container-page mt-16 hidden md:block" aria-label="Informações detalhadas">
      <Tabs defaultValue="details">
        <TabsList variant="line" className="w-full justify-start gap-8 border-b border-line">
          <TabsTrigger value="details" className="text-[17px]">Detalhes do NFT</TabsTrigger>
          <TabsTrigger value="reviews" className="text-[17px]">Avaliações de colecionadores ({nft.ratingCount})</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="space-y-4 pt-4 text-sm leading-6 text-sand">
          <p>{first}.</p>
          {rest && <p>A propriedade{rest}</p>}
          <dl className="space-y-3">
            <div><dt className="font-bold text-cream">Rede:</dt><dd>Cunhado na {NETWORK_LABELS[nft.network]} com procedência imutável e metadados armazenados no IPFS.</dd></div>
            <div><dt className="font-bold text-cream">Contrato:</dt><dd>Direitos autorais do criador: 5% nas vendas secundárias, pagos automaticamente pelos mercados compatíveis.</dd></div>
            <div><dt className="font-bold text-cream">Direitos autorais:</dt><dd>0x7A42...19E8 • Contrato inteligente ERC-721 verificado.</dd></div>
          </dl>
        </TabsContent>
        <TabsContent value="reviews" className="pt-4 text-sm text-sand">
          <p>Nota média {nft.rating} de 5 em {nft.ratingCount} avaliações. A leitura das avaliações individuais não faz parte desta demonstração.</p>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function MoreFromCollection({ currentId }: { currentId: string }) {
  const { data } = useCatalog({});
  const items = useMemo(() => data?.items.filter((n) => n.id !== currentId).slice(0, 5) ?? [], [data, currentId]);
  return (
    <section aria-labelledby="more-title" className="container-page mt-20 hidden md:block">
      <h2 id="more-title" className="mb-6 border-b border-line pb-3 text-[17px] font-bold text-copper-light">Mais desta coleção</h2>
      <ul className="grid grid-cols-3 gap-6 lg:grid-cols-5">
        {data
          ? items.map((n) => <li key={n.id}><NftCard nft={n} /></li>)
          : Array.from({ length: 5 }, (_, i) => <li key={i}><Skeleton className="aspect-[4/5] w-full" /></li>)}
      </ul>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="container-page grid gap-8 pt-14 md:grid-cols-2 lg:grid-cols-[100px_444px_1fr]" aria-busy="true" aria-label="Carregando NFT">
      <div className="hidden flex-col gap-4 lg:flex">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="size-[96px]" />)}
      </div>
      <Skeleton className="aspect-square w-full rounded-md" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
