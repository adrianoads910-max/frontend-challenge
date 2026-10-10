import type { Category, Network, OrderStatus, WalletProvider } from "@/api/contracts";

/** Display names used by filters (sidebar labels from the Figma file). */
export const CATEGORY_LABELS: Record<Category, string> = {
  "digital-art": "Arte digital",
  photography: "Fotografia",
  music: "Música",
  "3d-art": "Arte 3D",
  collectibles: "Colecionáveis",
  generative: "Generativa",
  games: "Jogos",
  signatures: "Assinaturas",
  utility: "Utilidade",
};

export const NETWORK_LABELS: Record<Network, string> = {
  ethereum: "Ethereum",
  polygon: "Polygon",
  solana: "Solana",
};

export const PROVIDER_LABELS: Record<WalletProvider, string> = {
  metamask: "MetaMask",
  walletconnect: "WalletConnect",
  coinbase: "Coinbase Wallet",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pagamento pendente",
  confirmed: "Pagamento confirmado",
  declined: "Pagamento recusado",
};
