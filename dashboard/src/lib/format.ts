export function encodeSymbolPath(symbol: string): string {
  return symbol.split("/").map(encodeURIComponent).join("/");
}

export function fmtNum(v: number | null | undefined, dec = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return "$" + fmtNum(v, 2);
}

export function fmtPct(v: number | null | undefined, dec = 2): string {
  if (v === null || v === undefined) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(dec)}%`;
}

export function fmtMcap(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(0) + "M";
  return "$" + v.toFixed(0);
}

export function fmtVol(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

export type RatingLabel =
  | "Strong Buy"
  | "Buy"
  | "Neutral"
  | "Sell"
  | "Strong Sell";

export function ratingLabel(
  v: number | null | undefined,
): { label: RatingLabel; tone: "green" | "amber" | "red" } | null {
  if (v === null || v === undefined) return null;
  if (v >= 0.5) return { label: "Strong Buy", tone: "green" };
  if (v >= 0.1) return { label: "Buy", tone: "green" };
  if (v >= -0.1) return { label: "Neutral", tone: "amber" };
  if (v >= -0.5) return { label: "Sell", tone: "red" };
  return { label: "Strong Sell", tone: "red" };
}

export function rsiTone(v: number | null | undefined): "green" | "amber" | "red" {
  if (v === null || v === undefined) return "amber";
  if (v < 30) return "green";
  if (v > 70) return "red";
  return "amber";
}

export function fmtShares(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  // If close to a whole number, render as integer; else show up to 4 decimals.
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-6) return rounded.toLocaleString("en-US");
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}
