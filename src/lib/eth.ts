/**
 * ETH amounts travel as decimal strings ("1.19", "0.0021") and are computed with bigint fixed-point
 * at 18 decimals (wei). No `number` is ever used for money, so sums, discounts and fees are exact.
 */
export type EthString = string;

const DECIMALS = 18;
const SCALE = 10n ** BigInt(DECIMALS);
const ETH_RE = /^(-)?(\d+)(?:\.(\d{1,18}))?$/;

export function isEthString(value: unknown): value is EthString {
  return typeof value === "string" && ETH_RE.test(value);
}

/** Parses a decimal string into wei. Throws on anything that is not a plain decimal. */
export function toWei(value: EthString): bigint {
  const match = ETH_RE.exec(value);
  if (!match) throw new Error(`invalid ETH amount "${value}"`);
  const [, sign, int, frac = ""] = match;
  const wei = BigInt(int!) * SCALE + BigInt(frac.padEnd(DECIMALS, "0"));
  return sign ? -wei : wei;
}

/** Canonical string: no trailing zeros, at least `minDecimals` decimals ("1.2" → "1.20" with 2). */
export function fromWei(wei: bigint, minDecimals = 2): EthString {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const int = abs / SCALE;
  let frac = (abs % SCALE).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  if (frac.length < minDecimals) frac = frac.padEnd(minDecimals, "0");
  return `${negative ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

export const eth = {
  add: (...values: EthString[]) => fromWei(values.reduce((acc, v) => acc + toWei(v), 0n)),
  sub: (a: EthString, b: EthString) => fromWei(toWei(a) - toWei(b)),
  mul: (a: EthString, quantity: number) => {
    if (!Number.isSafeInteger(quantity)) throw new Error("quantity must be an integer");
    return fromWei(toWei(a) * BigInt(quantity));
  },
  /** a × basisPoints / 10_000, rounded down to the wei (discounts never round up). */
  percent: (a: EthString, basisPoints: number) => fromWei((toWei(a) * BigInt(basisPoints)) / 10_000n),
  min: (a: EthString, b: EthString) => (toWei(a) <= toWei(b) ? a : b),
  cmp: (a: EthString, b: EthString) => {
    const d = toWei(a) - toWei(b);
    return d === 0n ? 0 : d > 0n ? 1 : -1;
  },
  eq: (a: EthString, b: EthString) => toWei(a) === toWei(b),
  isZero: (a: EthString) => toWei(a) === 0n,
  /** Display: up to `maxDecimals` decimals (truncated, never rounded up), at least 2. */
  format: (a: EthString, maxDecimals = 4) => {
    const wei = toWei(a);
    const step = 10n ** BigInt(DECIMALS - maxDecimals);
    return fromWei((wei / step) * step);
  },
};
