"use client";

import { useEffect, useRef, useState } from "react";

export const CHART = {
  series: "#3b82f6",
  seriesMuted: "#bfdbfe",
  series2: "#f97316",
  grid: "#ececec",
  axis: "#8a8a94",
  surface: "#ffffff",
};

/** Round tick values covering [min, max] (about `count` ticks). */
export function niceTicks(min: number, max: number, count = 4) {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export const formatAxis = (n: number) => (Math.abs(n) >= 1000 ? compact.format(n) : full.format(n));
export const formatValue = (n: number, unit?: string) => `${full.format(n)}${unit ? ` ${unit}` : ""}`;
