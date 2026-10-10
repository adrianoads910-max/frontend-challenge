import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { OutOfScopeLink } from "@/components/layout/out-of-scope";
import { artworkSrcSet, artworkUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

const SLIDES = [
  { title: ["SEJA DONO DO FUTURO", "DA ARTE DIGITAL"], artwork: "ape-varsity", nftId: "nft-042-0", name: "Emerald Ape #042" },
  { title: ["COLECIONE EDIÇÕES", "RARAS E VERIFICADAS"], artwork: "ape-turtleneck", nftId: "nft-552-2", name: "Neon Vessel #552" },
  { title: ["APOIE ARTISTAS", "EMERGENTES"], artwork: "ape-headphones", nftId: "nft-207-6", name: "Golden Beat #207" },
];

/** Hero with manual slides (no autoplay: respects reduced motion and screen-reader users). */
export function Hero() {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index]!;
  return (
    <section aria-roledescription="carrossel" aria-label="Destaques" className="container-page mt-4 md:mt-[52px]">
      <div className="relative grid grid-cols-[1fr_128px] items-center gap-3 overflow-hidden rounded-2xl bg-surface-card p-4 md:grid-cols-[1fr_450px] md:gap-6 md:rounded-none md:bg-transparent md:p-0">
        <div className="md:pl-[52px]" aria-live="polite">
          <p className="mb-2 text-xs md:mb-6 md:text-sm">Bem-vindo à Kurio</p>
          <h1 className="mb-2 text-[17px] leading-7 font-bold md:mb-6 md:text-[43px] md:leading-[70px]">
            {slide.title[0]} <br className="hidden md:block" />
            {slide.title[1]}
          </h1>
          <p className="mb-2 line-clamp-3 max-w-[557px] text-xs leading-5 text-sand md:mb-8 md:line-clamp-none md:text-sm md:leading-6">
            Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte digital rara, apoie artistas e tenha uma parte da cultura da internet.
          </p>
          <Link
            to="/"
            hash="catalogo"
            className="inline-flex items-center gap-2 text-xs font-bold text-copper-light md:h-10 md:rounded-md md:bg-copper md:px-7 md:text-sm md:text-ink md:hover:bg-copper-light"
          >
            EXPLORAR <Icon name="arrow-right" size={14} className="md:hidden" />
          </Link>
          <div className="col-span-2 mt-3 flex justify-center gap-2 md:mt-0 md:justify-end md:pr-16" role="group" aria-label="Escolher destaque">
            {SLIDES.map((s, i) => (
              <button
                key={s.nftId}
                type="button"
                aria-label={`Destaque ${i + 1} de ${SLIDES.length}: ${s.name}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn("size-2.5 rounded-full transition-colors", i === index ? "bg-copper" : "bg-copper/40 hover:bg-copper/70")}
              />
            ))}
          </div>
        </div>
        <Link to="/nft/$nftId" params={{ nftId: slide.nftId }} className="block" aria-label={`Ver ${slide.name}`}>
          <img
            src={artworkUrl(slide.artwork, 512)}
            srcSet={artworkSrcSet(slide.artwork)}
            sizes="(min-width: 768px) 450px, 90vw"
            alt={`Arte do NFT ${slide.name}`}
            width={450}
            height={450}
            fetchPriority="high"
            className="aspect-square w-full rounded-xl object-cover shadow-card md:rounded-2xl"
          />
        </Link>
      </div>
    </section>
  );
}

export function FeaturedNft() {
  return (
    <section aria-labelledby="featured-title" className="hidden rounded-md bg-surface-card lg:block">
      <div className="px-3 pt-4">
        <h2 id="featured-title" className="text-2xl leading-8 font-bold text-copper">NFT EM DESTAQUE</h2>
        <p className="mb-3 pl-5 text-base font-bold">OFERTA LIMITADA</p>
      </div>
      <Link to="/nft/$nftId" params={{ nftId: "nft-009-1" }} aria-label="Ver Sage Nomad #009 em destaque">
        <img src={artworkUrl("ape-bucket-hat", 512)} alt="Arte do NFT Sage Nomad #009" width={310} height={368} loading="lazy" className="h-[368px] w-full rounded-2xl object-cover" />
      </Link>
    </section>
  );
}

const PROMOS = [
  {
    title: "Lançamentos gênesis de edição limitada",
    text: "Colecione edições escassas diretamente dos criadores antes da revelação pública.",
    artwork: "ape-varsity",
    search: { tab: "new" as const },
  },
  {
    title: "Arte digital selecionada e muito mais",
    text: "Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.",
    artwork: "ape-turtleneck",
    search: { categories: ["digital-art" as const] },
  },
];

export function Promos() {
  return (
    <section aria-label="Coleções em destaque" className="container-page mt-20 grid gap-6 md:grid-cols-2">
      {PROMOS.map((p) => (
        <article key={p.title} className="grid grid-cols-[minmax(0,180px)_1fr] overflow-hidden rounded-md bg-surface-card md:grid-cols-[200px_1fr]">
          <img src={artworkUrl(p.artwork, 256)} alt="" width={200} height={200} loading="lazy" className="h-full w-full object-cover" />
          <div className="flex flex-col items-end justify-center gap-3 p-4 text-right">
            <h2 className="text-sm leading-5 font-bold md:text-base">{p.title}</h2>
            <p className="text-xs leading-5 text-copper-light">{p.text}</p>
            <Link to="/" search={p.search} hash="catalogo" className="inline-flex items-center gap-1 rounded-md bg-copper px-5 py-1.5 text-sm font-bold text-ink hover:bg-copper-light">
              Explorar <Icon name="arrow-right" size={14} />
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}

const POSTS = [
  { date: "12 de setembro", read: "6 min", title: "Como funciona a propriedade de NFTs", text: "Aprenda a colecionar, negociar e verificar ativos digitais.", artwork: "ape-turtleneck" },
  { date: "13 de setembro", read: "2 min", title: "10 artistas digitais para acompanhar", text: "Conheça criadores que moldam a cultura digital.", artwork: "ape-varsity" },
  { date: "15 de setembro", read: "3 min", title: "Raridade, atributos e procedência", text: "Entenda raridade, procedência, direitos autorais e utilidade.", artwork: "ape-bucket-hat" },
  { date: "15 de setembro", read: "2 min", title: "Como proteger sua carteira", text: "Proteja sua carteira, seus ativos e sua identidade.", artwork: "ape-headphones" },
];

export function Journal() {
  return (
    <section aria-labelledby="journal-title" className="container-page mt-20">
      <h2 id="journal-title" className="text-center text-2xl font-bold">Diário da Cunhagem</h2>
      <p className="mt-3 mb-8 text-center text-xs text-sand md:text-sm">Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.</p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {POSTS.map((p) => (
          <article key={p.title} className="overflow-hidden rounded-md bg-surface-card">
            <img src={artworkUrl(p.artwork, 512)} alt="" width={268} height={195} loading="lazy" className="h-[195px] w-full object-cover" />
            <div className="space-y-2 p-3">
              <p className="text-[10px] text-copper-light">{p.date} | Leitura de {p.read}</p>
              <h3 className="text-sm leading-5 font-bold">{p.title}</h3>
              <p className="text-[11px] leading-4 text-sand">{p.text}</p>
              <OutOfScopeLink label="Ler mais" className="text-[11px] font-bold text-copper-light">Ler mais →</OutOfScopeLink>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
