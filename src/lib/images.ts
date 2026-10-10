/** Artwork keys returned by the API (`nft.image`) map to responsive WebP files in /public. */
export type ArtworkWidth = 256 | 512 | 1024;

export const artworkUrl = (artwork: string, width: ArtworkWidth = 512) => `/images/nfts/${artwork}-${width}.webp`;

export const artworkSrcSet = (artwork: string) =>
  ([256, 512, 1024] as const).map((w) => `${artworkUrl(artwork, w)} ${w}w`).join(", ");
