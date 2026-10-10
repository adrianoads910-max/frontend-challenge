import type { Category, Edition, Network, Nft } from "@/api/contracts";
import { CATEGORIES, NETWORKS } from "@/api/contracts";
import { eth } from "@/lib/eth";
import { artworkUrl } from "@/lib/images";

/*
 * Deterministic fixtures. Everything derives from a seeded PRNG, so a reset always restores the
 * exact same catalog (names, prices, stock, dates) — tests and visual baselines rely on that.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ARTWORKS = ["ape-varsity", "ape-bucket-hat", "ape-turtleneck", "ape-headphones"] as const;
export type Artwork = (typeof ARTWORKS)[number];


const CATALOG_EPOCH = Date.UTC(2026, 8, 1); // 2026-09-01: fixed so "recent" ordering never drifts

interface Seed {
  name: string;
  artwork: Artwork;
  price: string;
  previousPrice?: string;
  category: Category;
  network: Network;
  attributes: string[];
}

/** The NFTs that appear in the Figma file, with their exact names and prices. */
const FIGMA_NFTS: Seed[] = [
  { name: "Emerald Ape #042", artwork: "ape-varsity", price: "1.19", category: "digital-art", network: "ethereum", attributes: ["Óculos", "Esmeralda", "Raro"] },
  { name: "Sage Nomad #009", artwork: "ape-bucket-hat", price: "1.69", category: "digital-art", network: "ethereum", attributes: ["Chapéu", "Moletom", "Incomum"] },
  { name: "Neon Vessel #552", artwork: "ape-turtleneck", price: "1.99", previousPrice: "2.29", category: "collectibles", network: "polygon", attributes: ["Gola alta", "Brinco", "Raro"] },
  { name: "Cosmic Bloom #118", artwork: "ape-bucket-hat", price: "1.29", category: "generative", network: "solana", attributes: ["Chapéu", "Lilás", "Comum"] },
  { name: "Violet Nomad #314", artwork: "ape-bucket-hat", price: "1.39", category: "3d-art", network: "ethereum", attributes: ["Chapéu", "Moletom", "Incomum"] },
  { name: "Ivory Baron #088", artwork: "ape-turtleneck", price: "1.79", category: "photography", network: "ethereum", attributes: ["Blazer", "Gola alta", "Épico"] },
  { name: "Golden Beat #207", artwork: "ape-headphones", price: "0.99", category: "music", network: "polygon", attributes: ["Fones", "Dourado", "Comum"] },
  { name: "Golden Signal #160", artwork: "ape-headphones", price: "0.39", category: "music", network: "solana", attributes: ["Fones", "Jaqueta", "Comum"] },
];

const ADJECTIVES = ["Amber", "Copper", "Velvet", "Lunar", "Rustic", "Silent", "Crimson", "Misty", "Royal", "Wild", "Hidden", "Electric"];
const NOUNS = ["Ape", "Nomad", "Baron", "Signal", "Bloom", "Vessel", "Drifter", "Oracle", "Sentinel", "Echo", "Monk", "Rider"];
const ATTRS: Record<Artwork, string[]> = {
  "ape-varsity": ["Óculos", "Jaqueta", "Corrente"],
  "ape-bucket-hat": ["Chapéu", "Moletom", "Lilás"],
  "ape-turtleneck": ["Blazer", "Gola alta", "Brinco"],
  "ape-headphones": ["Fones", "Dourado", "Jaqueta"],
};
const RARITY = ["Comum", "Incomum", "Raro", "Épico"];

export const CATALOG_SIZE = 40;

function editionsFor(id: string, price: string, previousPrice: string | null, rand: () => number, index: number): Edition[] {
  // A few deterministic edge cases: one NFT completely sold out, one with an unavailable edition,
  // one with very low stock (quantity limit scenarios).
  const soldOut = index === 13;
  const lowStock = index === 4;
  const limitedDown = index === 2;
  // Price variations are expressed in integer cents and applied with exact ETH arithmetic.
  const bump = (base: string, cents: number) => {
    const abs = Math.abs(cents);
    return eth.add(base, `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`);
  };
  return [
    {
      id: `${id}-e10`, label: "1/10", kind: "limited", price: bump(price, 40), previousPrice: null,
      available: soldOut || limitedDown ? 0 : 2 + Math.floor(rand() * 6), maxPerOrder: 2,
    },
    {
      id: `${id}-e50`, label: "1/50", kind: "limited", price, previousPrice,
      available: soldOut ? 0 : lowStock ? 2 : 8 + Math.floor(rand() * 30), maxPerOrder: 10,
    },
    {
      id: `${id}-open`, label: "Aberta", kind: "open", price: bump(price, -Math.min(20, Number(price.replace(".", "")) - 5)),
      previousPrice: null, available: soldOut ? 0 : 999, maxPerOrder: 25,
    },
  ];
}

export function buildCatalog(): Nft[] {
  const rand = mulberry32(42);
  const seeds: Seed[] = [...FIGMA_NFTS];
  while (seeds.length < CATALOG_SIZE) {
    const i = seeds.length;
    const artwork = ARTWORKS[i % ARTWORKS.length]!;
    const cents = 20 + Math.floor(rand() * 1200);
    const onSale = rand() < 0.15;
    seeds.push({
      name: `${ADJECTIVES[i % ADJECTIVES.length]} ${NOUNS[(i * 7) % NOUNS.length]} #${String(100 + ((i * 37) % 900)).padStart(3, "0")}`,
      artwork,
      price: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`,
      ...(onSale ? { previousPrice: `${Math.floor(cents / 100) + 1}.${String(cents % 100).padStart(2, "0")}` } : {}),
      category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)]!,
      network: NETWORKS[Math.floor(rand() * NETWORKS.length)]!,
      attributes: [...ATTRS[artwork].slice(0, 2), RARITY[Math.floor(rand() * RARITY.length)]!],
    });
  }

  return seeds.map((s, index) => {
    const number = s.name.split("#")[1]!;
    const id = `nft-${number}-${index}`;
    const editions = editionsFor(id, s.price, s.previousPrice ?? null, rand, index);
    const soldOut = editions.every((e) => e.available === 0);
    const gallery = [s.artwork, ...ARTWORKS.filter((a) => a !== s.artwork)].map((a) => artworkUrl(a, 1024));
    return {
      id,
      name: s.name,
      image: s.artwork,
      category: s.category,
      network: s.network,
      price: editions[1]!.price,
      previousPrice: editions[1]!.previousPrice,
      soldOut,
      version: 1,
      description: `${s.name} é uma obra digital finalizada à mão da coleção Kurio Editions. Cada atributo fica armazenado nos metadados do token e verificado na rede. A obra explora identidade, movimento e luz em um mundo digital sem fronteiras. A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro permanente de procedência. Nova Sato recebe 5% de direitos autorais nas vendas secundárias.`,
      tokenId: `#${number.padStart(4, "0")}`,
      collection: "Kurio Apes",
      creator: "Nova Sato",
      attributes: s.attributes,
      rating: (4 + Math.floor(rand() * 10) / 10).toFixed(1),
      ratingCount: 5 + Math.floor(rand() * 60),
      gallery,
      editions,
      createdAt: new Date(CATALOG_EPOCH - index * 36 * 3600_000).toISOString(),
    } satisfies Nft;
  });
}

/** Estimated network fee per order, in ETH (Figma shows 0.016 ETH for Ethereum). */
export const NETWORK_FEES: Record<Network, string> = {
  ethereum: "0.016",
  polygon: "0.002",
  solana: "0.0005",
};

export interface CouponDef {
  code: string;
  description: string;
  basisPoints?: number;
  fixed?: string;
  expiresAt: string;
}

export const COUPONS: CouponDef[] = [
  { code: "KURIO10", description: "10% de desconto no lançamento", basisPoints: 1000, expiresAt: "2099-12-31T23:59:59.000Z" },
  { code: "GENESIS", description: "0.05 ETH de desconto", fixed: "0.05", expiresAt: "2099-12-31T23:59:59.000Z" },
  { code: "EXPIRADO", description: "Cupom de lançamento encerrado", basisPoints: 2000, expiresAt: "2025-01-01T00:00:00.000Z" },
];

/** Fictitious accounts. Passwords are stored hashed by the mock (see db.ts), never in clear. */
export const DEMO_USERS = [
  { id: "user-ana", displayName: "Ana Colecionadora", username: "ana_kurio", email: "ana@kurio.dev", password: "Kurio2026", ensName: "anakurio", walletNickname: "Cofre principal" },
  { id: "user-bruno", displayName: "Bruno Criador", username: "bruno_art", email: "bruno@kurio.dev", password: "Kurio2026", ensName: "brunoart", walletNickname: "Carteira de estúdio" },
] as const;
