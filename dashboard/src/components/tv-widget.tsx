"use client";

import { useEffect, useRef } from "react";

/**
 * TradingView Advanced Chart widget. No login required.
 * Docs: https://www.tradingview.com/widget/advanced-chart/
 */
export function TvAdvancedChart({
  symbol,
  height = 500,
}: {
  symbol: string; // e.g. "NASDAQ:AAPL"
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      hide_side_toolbar: false,
      allow_symbol_change: false,
      withdateranges: true,
      studies: ["MASimple@tv-basicstudies", "RSI@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
    });
    ref.current.appendChild(script);
  }, [symbol]);

  return (
    <div
      className="overflow-hidden rounded-lg border border-edge bg-bg-elev"
      style={{ height }}
    >
      <div
        ref={ref}
        className="tradingview-widget-container h-full w-full"
      />
    </div>
  );
}

/**
 * TradingView Technical Analysis widget — shows their Buy/Sell signals.
 */
export function TvTechnicalAnalysis({
  symbol,
  height = 425,
}: {
  symbol: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      interval: "1D",
      width: "100%",
      isTransparent: false,
      height,
      symbol,
      showIntervalTabs: true,
      displayMode: "single",
      locale: "en",
      colorTheme: "dark",
    });
    ref.current.appendChild(script);
  }, [symbol, height]);

  return (
    <div
      className="overflow-hidden rounded-lg border border-edge bg-bg-elev"
      style={{ height }}
    >
      <div
        ref={ref}
        className="tradingview-widget-container h-full w-full"
      />
    </div>
  );
}

/**
 * TradingView Symbol Info widget — financial summary at a glance.
 */
export function TvSymbolInfo({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      locale: "en",
      colorTheme: "dark",
      isTransparent: false,
    });
    ref.current.appendChild(script);
  }, [symbol]);

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-bg-elev">
      <div
        ref={ref}
        className="tradingview-widget-container w-full"
      />
    </div>
  );
}
