import { Link } from "@tanstack/react-router";
import type { NftSummary } from "@/api/contracts";
import { Skeleton } from "@/components/ui/skeleton";
import { eth } from "@/lib/eth";
import { cn } from "@/lib/utils";
import { artworkUrl } from "@/lib/images";
import { FavoriteButton } from "./favorite-button";

export function NftCard({ nft, priority = false, className }: { nft: NftSummary; priority?: boolean; className?: string }) {
  return (
    <article className={cn("group relative flex flex-col gap-3", className)} aria-labelledby={`nft-${nft.id}-name`}>
      <div className="relative overflow-hidden rounded-lg bg-surface-card p-2.5 shadow-card transition-transform duration-200 group-hover:-translate-y-1">
        <img
          src={artworkUrl(nft.image, 512)}
          srcSet={`${artworkUrl(nft.image, 256)} 256w, ${artworkUrl(nft.image, 512)} 512w`}
          sizes="(min-width: 1024px) 250px, (min-width: 768px) 30vw, 45vw"
          alt={`Arte do NFT ${nft.name}`}
          width={512}
          height={512}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          className={cn("aspect-square w-full rounded-md object-cover", nft.soldOut && "opacity-60 grayscale")}
        />
        {nft.soldOut && (
          <span className="absolute top-4 left-4 rounded-sm bg-ink/90 px-2 py-1 text-xs font-bold text-cream">Esgotado</span>
        )}
        <FavoriteButton nftId={nft.id} name={nft.name} className="absolute top-4 right-4" />
      </div>
      <div className="flex flex-col gap-1.5 px-0.5">
        <h3 id={`nft-${nft.id}-name`} className="text-[15px] leading-4">
          {/* Stretched link: the whole card is clickable, the heart stays a separate control. */}
          <Link to="/nft/$nftId" params={{ nftId: nft.id }} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {nft.name}
          </Link>
        </h3>
        <p className="flex items-baseline gap-2 text-[15px] font-bold text-copper-light">
          <span>
            <span className="sr-only">Preço: </span>
            {eth.format(nft.price)} ETH
          </span>
          {nft.previousPrice && (
            <span className="font-normal text-sand line-through">
              <span className="sr-only">Antes: </span>
              {eth.format(nft.previousPrice)} ETH
            </span>
          )}
        </p>
      </div>
    </article>
  );
}

/** Same footprint as NftCard: no layout shift when data arrives. */
export function NftCardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="rounded-lg bg-surface-card p-2.5">
        <Skeleton className="aspect-square w-full" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}
