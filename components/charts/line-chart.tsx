"use client";

import { useState } from "react";
import { CHART, formatAxis, formatValue, niceTicks, useElementWidth } from "./scale";

export type LinePoint = { label: string; value: number; detail?: string };

const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

export function LineChart({ points, unit, label }: { points: LinePoint[]; unit?: string; label: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const ticks = niceTicks(Math.max(0, min - (max - min) * 0.15), max);
  const lo = ticks[0];
  const hi = ticks.at(-1)!;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join("");
  const area = `${line}L${x(points.length - 1)},${y(lo)}L${x(0)},${y(lo)}Z`;
  const labelStep = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 80))));
  const last = points.length - 1;
  const current = active === null ? null : points[active];

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left - PAD.left) / (plotW || 1);
    setActive(Math.min(last, Math.max(0, Math.round(rel * last))));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") setActive((a) => Math.min(last, (a ?? -1) + 1));
    if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? last + 1) - 1));
  }

  return (
    <div ref={ref} className="relative">
      {width > 0 && points.length > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={label}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="block overflow-visible outline-none"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={CHART.grid} />
              <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill={CHART.axis} className="tabular-nums">
                {formatAxis(t)}
              </text>
            </g>
          ))}
          {points.map(
            (p, i) =>
              (last - i) % labelStep === 0 && (
                <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={12} fill={CHART.axis}>
                  {p.label}
                </text>
              ),
          )}
          <path d={area} fill={CHART.series} opacity={0.1} />
          <path d={line} fill="none" stroke={CHART.series} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {active !== null && (
            <>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="#111" strokeOpacity={0.25} />
              <circle cx={x(active)} cy={y(points[active].value)} r={5} fill={CHART.series} stroke={CHART.surface} strokeWidth={2} />
            </>
          )}
          {active === null && (
            <>
              <circle cx={x(last)} cy={y(points[last].value)} r={5} fill={CHART.series} stroke={CHART.surface} strokeWidth={2} />
              <text x={x(last)} y={y(points[last].value) - 12} textAnchor="end" fontSize={13} fontWeight={600} fill="#111">
                {formatValue(points[last].value, unit)}
              </text>
            </>
          )}
        </svg>
      )}
      {current && active !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-[12px] bg-[#1e1a24] px-3 py-2 text-[12px] whitespace-nowrap text-white shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
          style={{
            left: x(active),
            transform: `translateX(${x(active) > width / 2 ? "calc(-100% - 12px)" : "12px"})`,
          }}
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
