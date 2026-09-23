// Display formatting: GBP everywhere, rates to one decimal place.
const gbpFmt = (decimals: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const gbp0 = gbpFmt(0);
const gbp2 = gbpFmt(2);
const int = new Intl.NumberFormat("en-GB");

export const DASH = "—";

/** Totals: whole pounds. */
export function money(n: number | null | undefined): string {
  return n == null || !isFinite(n) ? DASH : gbp0.format(n);
}

/** Unit costs (CPL, CAC): pence. */
export function money2(n: number | null | undefined): string {
  return n == null || !isFinite(n) ? DASH : gbp2.format(n);
}

export function count(n: number | null | undefined): string {
  return n == null ? DASH : int.format(n);
}

/** Ratio (0–1) as a percentage to one decimal place. */
export function pct(r: number | null | undefined): string {
  return r == null || !isFinite(r) ? DASH : `${(r * 100).toFixed(1)}%`;
}
