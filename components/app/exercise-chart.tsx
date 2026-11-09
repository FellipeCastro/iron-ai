"use client";

import { useState } from "react";
import { LineChart } from "@/components/charts/line-chart";
import { Card } from "./ui";

export type ExerciseChartPoint = { t: number; label: string; maxWeight: number; maxWeightReps: number; bestE1rm: number; calories: number };

const metrics = {
  maxWeight: {
    label: "Carga máxima",
    unit: "kg",
    help: "A maior carga usada em cada treino e as repetições feitas com ela.",
    secondary: { key: "maxWeightReps", label: "Repetições", unit: "reps" },
  },
  bestE1rm: { label: "1RM estimado", unit: "kg", help: "Quanto você levantaria em 1 repetição, estimado pela melhor série." },
  calories: { label: "Calorias", unit: "kcal", help: "Estimativa das calorias gastas neste exercício em cada treino." },
} as const satisfies Record<string, { label: string; unit: string; help: string; secondary?: { key: keyof ExerciseChartPoint; label: string; unit: string } }>;

const periods = [
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "Tudo", days: null },
] as const;

type Metric = keyof typeof metrics;

export function ExerciseChart({ points, now }: { points: ExerciseChartPoint[]; now: number }) {
  const [metric, setMetric] = useState<Metric>("maxWeight");
  const [period, setPeriod] = useState<(typeof periods)[number]["label"]>("90 dias");

  const days = periods.find((p) => p.label === period)!.days;
  const visible = days === null ? points : points.filter((p) => p.t >= now - days * 86_400_000);
  const m = metrics[metric];
  const secondary = "secondary" in m ? m.secondary : undefined;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Segmented options={Object.keys(metrics) as Metric[]} value={metric} onChange={setMetric} label={(k) => metrics[k].label} />
        <Segmented options={periods.map((p) => p.label)} value={period} onChange={setPeriod} label={(k) => k} />
      </div>
      <p className="mt-4 text-[14px] text-[#5b5b66]">{m.help}</p>
      <div className="mt-4">
        {visible.length >= 2 ? (
          <LineChart
            label={`${m.label} por treino`}
            name={m.label}
            unit={m.unit}
            secondary={secondary && { name: secondary.label, unit: secondary.unit }}
            points={visible.map((p) => ({ label: p.label, value: p[metric], value2: secondary ? p[secondary.key] : undefined }))}
          />
        ) : (
          <p className="flex h-[260px] items-center justify-center rounded-[20px] bg-[#f9f9fb] text-[14px] text-[#5b5b66]">
            Poucos treinos neste período. Escolha um período maior.
          </p>
        )}
      </div>
    </Card>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <div className="flex w-full gap-1 overflow-x-auto rounded-full bg-[#f5f5f8] p-1 sm:w-auto" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={`flex-1 rounded-full px-2 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors sm:flex-none sm:px-4 sm:text-[14px] ${
            o === value ? "bg-white text-[#111] shadow-[0_2px_8px_rgba(0,0,0,0.08)]" : "text-[#5b5b66] hover:text-[#111]"
          }`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}
