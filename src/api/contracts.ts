import { z } from "zod";
import { isEthString } from "@/lib/eth";

/*
 * REST + realtime contracts, shared by the client (axios + TanStack Query) and the MSW handlers.
 * Every response that crosses the network is parsed with these schemas on the client, so a contract
 * drift fails loudly instead of rendering garbage. See docs/API.md for the endpoint table.
 */

export const Eth = z.string().refine(isEthString, "invalid ETH amount");
export type Eth = z.infer<typeof Eth>;

export const NETWORKS = ["ethereum", "polygon", "solana"] as const;
export const Network = z.enum(NETWORKS);
export type Network = z.infer<typeof Network>;

export const WALLET_PROVIDERS = ["metamask", "walletconnect", "coinbase"] as const;
export const WalletProvider = z.enum(WALLET_PROVIDERS);
export type WalletProvider = z.infer<typeof WalletProvider>;

export const CATEGORIES = [
  "digital-art",
  "photography",
  "music",
  "3d-art",
  "collectibles",
  "generative",
  "games",
  "signatures",
  "utility",
] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

// ------------------------------------------------------------------ errors

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "INVALID_CREDENTIALS",
  "UNAUTHENTICATED",
  "SESSION_EXPIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "EMAIL_TAKEN",
  "USERNAME_TAKEN",
  "OUT_OF_STOCK",
  "QUANTITY_LIMIT",
  "EDITION_UNAVAILABLE",
  "COUPON_INVALID",
  "COUPON_EXPIRED",
  "QUOTE_STALE",
  "IDEMPOTENCY_CONFLICT",
  "WALLET_REJECTED",
  "TRANSIENT",
  "INTERNAL",
] as const;
export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    /** Field-level messages for forms (VALIDATION_ERROR, EMAIL_TAKEN…). */
    fields: z.record(z.string(), z.string()).optional(),
    /** Extra payload, e.g. the fresh quote on QUOTE_STALE. */
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

// ------------------------------------------------------------------ session & account

export const User = z.object({
  id: z.string(),
  displayName: z.string(),
  username: z.string(),
  email: z.email(),
  ensName: z.string().nullable(),
  walletNickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof User>;

export const Session = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
  user: User,
});
export type Session = z.infer<typeof Session>;

const password = z
  .string()
  .min(8, "Mínimo de 8 caracteres")
  .regex(/[A-Za-z]/, "Inclua ao menos uma letra")
  .regex(/\d/, "Inclua ao menos um número");

export const LoginInput = z.object({
  email: z.email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const RegisterInput = z.object({
  displayName: z.string().trim().min(2, "Mínimo de 2 caracteres").max(60),
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{3,24}$/, "3 a 24 caracteres: letras minúsculas, números e _"),
  email: z.email("E-mail inválido"),
  password,
  acceptTerms: z.literal(true, "Aceite os termos para continuar"),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const ProfileInput = z.object({
  displayName: z.string().trim().min(2, "Mínimo de 2 caracteres").max(60),
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{3,24}$/, "3 a 24 caracteres: letras minúsculas, números e _"),
  email: z.email("E-mail inválido"),
  ensName: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,32}$/, "3 a 32 caracteres: letras minúsculas, números e -"),
  walletNickname: z.string().trim().min(2, "Mínimo de 2 caracteres").max(40),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

export const PasswordChangeInput = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "A nova senha deve ser diferente da atual",
  });
export type PasswordChangeInput = z.infer<typeof PasswordChangeInput>;

/** Avatar travels as a data URL (image/png|jpeg|webp, ≤ 512 KB after client-side resize). */
export const AvatarInput = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Formato de imagem inválido")
    .max(700_000, "Imagem muito grande"),
});

// ------------------------------------------------------------------ wallets

const evmAddress = /^0x[a-fA-F0-9]{40}$/;
const solanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidAddress(network: Network, address: string): boolean {
  return network === "solana" ? solanaAddress.test(address) : evmAddress.test(address);
}

export const WalletRole = z.enum(["primary", "secondary"]);
export type WalletRole = z.infer<typeof WalletRole>;

export const WalletInput = z
  .object({
    displayName: z.string().trim().min(2, "Mínimo de 2 caracteres").max(60),
    nickname: z.string().trim().min(2, "Mínimo de 2 caracteres").max(40),
    network: Network,
    profileName: z.string().trim().min(2, "Mínimo de 2 caracteres").max(40),
    address: z.string().trim(),
    secondaryAddress: z.string().trim().optional().or(z.literal("")),
    provider: WalletProvider,
    referralCode: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{4,12}$/, "4 a 12 caracteres maiúsculos ou números"),
    email: z.email("E-mail inválido"),
    ensName: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{3,32}$/, "3 a 32 caracteres: letras minúsculas, números e -"),
  })
  .superRefine((v, ctx) => {
    if (!isValidAddress(v.network, v.address)) {
      ctx.addIssue({
        code: "custom",
        path: ["address"],
        message: v.network === "solana" ? "Endereço Solana inválido" : "Endereço 0x inválido (40 hexadecimais)",
      });
    }
    if (v.secondaryAddress && !/\.eth$/.test(v.secondaryAddress) && !isValidAddress(v.network, v.secondaryAddress)) {
      ctx.addIssue({ code: "custom", path: ["secondaryAddress"], message: "Informe um nome .eth ou um endereço válido" });
    }
  });
export type WalletInput = z.infer<typeof WalletInput>;

export const Wallet = z.object({
  id: z.string(),
  role: WalletRole,
  displayName: z.string(),
  nickname: z.string(),
  network: Network,
  profileName: z.string(),
  address: z.string(),
  secondaryAddress: z.string().nullable(),
  provider: WalletProvider,
  referralCode: z.string(),
  email: z.string(),
  ensName: z.string(),
  updatedAt: z.iso.datetime(),
});
export type Wallet = z.infer<typeof Wallet>;

// ------------------------------------------------------------------ catalog

export const EditionKind = z.enum(["limited", "open"]);
export const Edition = z.object({
  id: z.string(),
  /** "1/10", "1/50", "Aberta" */
  label: z.string(),
  kind: EditionKind,
  price: Eth,
  /** Strike-through price when on sale. */
  previousPrice: Eth.nullable(),
  available: z.number().int().nonnegative(),
  /** Max units of this edition per order. */
  maxPerOrder: z.number().int().positive(),
});
export type Edition = z.infer<typeof Edition>;

export const NftSummary = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  category: Category,
  network: Network,
  /** Lowest available edition price, used by the grid and sorting. */
  price: Eth,
  previousPrice: Eth.nullable(),
  soldOut: z.boolean(),
  version: z.number().int(),
});
export type NftSummary = z.infer<typeof NftSummary>;

export const Nft = NftSummary.extend({
  description: z.string(),
  tokenId: z.string(),
  collection: z.string(),
  creator: z.string(),
  attributes: z.array(z.string()),
  rating: z.string(),
  ratingCount: z.number().int(),
  gallery: z.array(z.string()),
  editions: z.array(Edition),
  createdAt: z.iso.datetime(),
});
export type Nft = z.infer<typeof Nft>;

export const SORTS = ["recent", "price-asc", "price-desc", "popular"] as const;
export const Sort = z.enum(SORTS);
export type Sort = z.infer<typeof Sort>;

export const TABS = ["all", "new", "trending"] as const;
export const CatalogTab = z.enum(TABS);
export type CatalogTab = z.infer<typeof CatalogTab>;

/** The catalog query is the URL search state of the home page (validated by the router). */
export const CatalogQuery = z.object({
  q: z.string().trim().max(60).optional(),
  tab: CatalogTab.optional(),
  categories: z.array(Category).optional(),
  networks: z.array(Network).optional(),
  minPrice: Eth.optional(),
  maxPrice: Eth.optional(),
  sort: Sort.optional(),
  page: z.number().int().min(1).optional(),
});
export type CatalogQuery = z.infer<typeof CatalogQuery>;

export const Facet = z.object({ id: z.string(), count: z.number().int() });
export const CatalogPage = z.object({
  items: z.array(NftSummary),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  facets: z.object({
    categories: z.array(Facet),
    networks: z.array(Facet),
    priceRange: z.object({ min: Eth, max: Eth }),
  }),
});
export type CatalogPage = z.infer<typeof CatalogPage>;

// ------------------------------------------------------------------ favorites

export const Favorites = z.object({ nftIds: z.array(z.string()) });
export type Favorites = z.infer<typeof Favorites>;

// ------------------------------------------------------------------ cart

export const CartItem = z.object({
  id: z.string(),
  nftId: z.string(),
  editionId: z.string(),
  name: z.string(),
  image: z.string(),
  tokenId: z.string(),
  editionLabel: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: Eth,
  lineTotal: Eth,
  available: z.number().int().nonnegative(),
  maxPerOrder: z.number().int().positive(),
  /** Price at the moment the item was added: lets the UI explain a change. */
  priceWhenAdded: Eth,
  status: z.enum(["ok", "price-changed", "insufficient-stock", "sold-out"]),
});
export type CartItem = z.infer<typeof CartItem>;

export const Coupon = z.object({ code: z.string(), description: z.string() });

export const Cart = z.object({
  id: z.string(),
  version: z.number().int(),
  items: z.array(CartItem),
  coupon: Coupon.nullable(),
  subtotal: Eth,
  discount: Eth,
  networkFee: Eth,
  total: Eth,
  itemCount: z.number().int(),
});
export type Cart = z.infer<typeof Cart>;

export const AddToCartInput = z.object({
  nftId: z.string(),
  editionId: z.string(),
  quantity: z.number().int().positive(),
});
export type AddToCartInput = z.infer<typeof AddToCartInput>;

// ------------------------------------------------------------------ checkout & orders

export const QuoteInput = z.object({ network: Network });
export type QuoteInput = z.infer<typeof QuoteInput>;

export const QuoteLine = z.object({
  nftId: z.string(),
  editionId: z.string(),
  name: z.string(),
  image: z.string(),
  tokenId: z.string(),
  editionLabel: z.string(),
  quantity: z.number().int(),
  unitPrice: Eth,
  lineTotal: Eth,
});
export type QuoteLine = z.infer<typeof QuoteLine>;

/** Server-authoritative price snapshot. Orders are only accepted for a still-valid quote. */
export const Quote = z.object({
  id: z.string(),
  network: Network,
  lines: z.array(QuoteLine),
  coupon: Coupon.nullable(),
  subtotal: Eth,
  discount: Eth,
  networkFee: Eth,
  total: Eth,
  cartVersion: z.number().int(),
  expiresAt: z.iso.datetime(),
});
export type Quote = z.infer<typeof Quote>;

export const CollectorInput = z.object({
  displayName: z.string().trim().min(2, "Mínimo de 2 caracteres").max(60),
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{3,24}$/, "3 a 24 caracteres: letras minúsculas, números e _"),
  profileName: z.string().trim().min(2, "Mínimo de 2 caracteres").max(40),
  email: z.email("E-mail inválido"),
  ensName: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,32}$/, "3 a 32 caracteres: letras minúsculas, números e -"),
  referralCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{4,12}$/, "4 a 12 caracteres maiúsculos ou números"),
  note: z.string().trim().max(280, "Máximo de 280 caracteres").optional(),
});
export type CollectorInput = z.infer<typeof CollectorInput>;

export const CreateOrderInput = z.object({
  quoteId: z.string(),
  walletId: z.string(),
  network: Network,
  collector: CollectorInput,
});
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

export const ORDER_STATUSES = ["pending", "confirmed", "declined"] as const;
export const OrderStatus = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatus>;

/** Receipt = immutable snapshot of the quote at order time. Later catalog changes never touch it. */
export const Order = z.object({
  id: z.string(),
  status: OrderStatus,
  version: z.number().int(),
  network: Network,
  walletAddress: z.string(),
  walletProvider: WalletProvider,
  lines: z.array(QuoteLine),
  coupon: Coupon.nullable(),
  subtotal: Eth,
  discount: Eth,
  networkFee: Eth,
  total: Eth,
  txHash: z.string().nullable(),
  explorerUrl: z.string().nullable(),
  declineReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Order = z.infer<typeof Order>;

export const OrderList = z.object({ items: z.array(Order) });

// ------------------------------------------------------------------ realtime events

const EventBase = z.object({
  /** Stable identity: duplicates carry the same id. */
  eventId: z.string(),
  occurredAt: z.iso.datetime(),
  /** Monotonic per resource: the client drops anything ≤ the version it already has. */
  version: z.number().int(),
});

export const NftUpdatedEvent = EventBase.extend({
  type: z.literal("nft.updated"),
  resource: z.object({ type: z.literal("nft"), id: z.string() }),
  data: z.object({
    price: Eth,
    previousPrice: Eth.nullable(),
    soldOut: z.boolean(),
    editions: z.array(Edition.pick({ id: true, price: true, previousPrice: true, available: true })),
  }),
});
export type NftUpdatedEvent = z.infer<typeof NftUpdatedEvent>;

export const OrderUpdatedEvent = EventBase.extend({
  type: z.literal("order.updated"),
  /** ownerId lets the client drop events that belong to another (previous) session. */
  resource: z.object({ type: z.literal("order"), id: z.string(), ownerId: z.string() }),
  data: z.object({ status: OrderStatus, order: Order }),
});
export type OrderUpdatedEvent = z.infer<typeof OrderUpdatedEvent>;

// ------------------------------------------------------------------ wallet connection (simulated)

export const WalletConnection = z.object({
  walletId: z.string(),
  network: Network,
  address: z.string(),
  provider: WalletProvider,
  connectedAt: z.iso.datetime(),
});
export type WalletConnection = z.infer<typeof WalletConnection>;
