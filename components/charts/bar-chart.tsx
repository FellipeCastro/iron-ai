"use client";

import { useState } from "react";
import { CHART, formatAxis, formatValue, niceTicks, useElementWidth } from "./scale";

export type BarDatum = { label: string; value: number; detail?: string; muted?: boolean };

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 44 };

function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function BarChart({ data, unit, label }: { data: BarDatum[]; unit?: string; label: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const ticks = niceTicks(0, Math.max(...data.map((d) => d.value), 1));
  const top = ticks.at(-1)!;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / data.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = band < 44 ? 2 : 1;
  const current = active === null ? null : data[active];

  return (
    <div ref={ref} className="relative" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={label} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={CHART.grid} />
              <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill={CHART.axis} className="tabular-nums">
                {formatAxis(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const h = Math.max(0, y(0) - y(d.value));
            return (
              <g
                key={d.label}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${d.label}: ${formatValue(d.value, unit)}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="cursor-default outline-none"
              >
                <rect x={cx - band / 2} y={PAD.top} width={band} height={plotH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={barPath(cx - barW / 2, y(d.value), barW, h)}
                    fill={d.muted ? CHART.seriesMuted : CHART.series}
                    opacity={active === null || active === i ? 1 : 0.55}
                  />
                )}
                {i % labelEvery === (data.length - 1) % labelEvery && (
                  <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize={12} fill={CHART.axis}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {current && active !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[12px] bg-[#1e1a24] px-3 py-2 text-[12px] whitespace-nowrap text-white shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
          style={{ left: PAD.left + band * active + band / 2, top: y(current.value) - 8 }}
        >
          <p className="text-[15px] font-semibold">{formatValue(current.value, unit)}</p>
          <p className="text-white/70">
            {current.label}
            {current.detail ? ` · ${current.detail}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
