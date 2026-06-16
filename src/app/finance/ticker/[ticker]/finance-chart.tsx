'use client';

/**
 * FinanceChart — lightweight-charts v5 candlestick + volume.
 *
 * Ported from the b1dz `trading-chart.tsx` pattern (createChart +
 * CandlestickSeries + HistogramSeries, ResizeObserver, theme-aware colors).
 * Pure render: it draws whatever candles it is given and renders defensively
 * against empty/partial data (PRD §6).
 */

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '@/lib/finance/market-data/types';

interface FinanceChartProps {
  candles: Candle[];
  loading?: boolean;
  /** When the user holds the symbol, annotate the chart with their cost basis. */
  avgCost?: number | null;
}

function toCandleData(bars: Candle[]): CandlestickData<UTCTimestamp>[] {
  return bars.map((b) => ({
    time: b.time as UTCTimestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

function toVolumeData(bars: Candle[]): HistogramData<UTCTimestamp>[] {
  return bars.map((b) => ({
    time: b.time as UTCTimestamp,
    value: b.volume,
    color: b.close >= b.open ? 'rgba(34, 197, 94, 0.45)' : 'rgba(248, 113, 113, 0.45)',
  }));
}

/** Read a CSS custom property from the element, falling back to a default. */
function cssVar(el: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

export function FinanceChart({ candles, loading = false, avgCost = null }: FinanceChartProps): React.ReactElement {
  const chartEl = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);

  // Create the chart once.
  useEffect(() => {
    if (!chartEl.current) return;
    const el = chartEl.current;
    const textColor = cssVar(el, '--color-text-secondary', '#a1a1aa');
    const gridColor = 'rgba(120, 120, 130, 0.18)';
    const borderColor = 'rgba(120, 120, 130, 0.35)';

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor },
      timeScale: { borderColor, timeVisible: false, secondsVisible: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#86efac',
      wickDownColor: '#fca5a5',
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resize = new ResizeObserver(() => chart.timeScale().fitContent());
    resize.observe(el);

    return () => {
      resize.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Push data whenever candles change.
  useEffect(() => {
    candleSeriesRef.current?.setData(toCandleData(candles));
    volumeSeriesRef.current?.setData(toVolumeData(candles));
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Cost-basis annotation (PRD §3.2) — a dashed price line at the user's avg cost.
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    if (avgCost && avgCost > 0) {
      priceLineRef.current = series.createPriceLine({
        price: avgCost,
        color: '#eab308',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Avg cost',
      });
    }
  }, [avgCost, candles]);

  return (
    <div className="relative">
      <div
        ref={chartEl}
        className="h-[360px] w-full overflow-hidden rounded-xl border border-border-subtle bg-bg-secondary"
      />
      {loading ? <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
          Loading chart…
        </div> : null}
      {!loading && candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
          No chart data available for this symbol.
        </div>
      )}
    </div>
  );
}
