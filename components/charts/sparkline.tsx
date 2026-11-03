import { CHART } from "./scale";

const path = (values: number[]) => {
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  // A flat series sits in the middle instead of on the floor.
  const y = (v: number) => (range === 0 ? 20 : 36 - ((v - min) / range) * 32);
  return values.map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * 100},${y(v)}`).join("");
};

// Static trend lines for list rows (weight and, optionally, reps, each on its own scale); values are always reachable on the exercise page.
export function Sparkline({ values, values2, className = "h-10 w-28" }: { values: number[]; values2?: number[]; className?: string }) {
  if (values.length < 2) return null;
  const line = { fill: "none", strokeWidth: 2, vectorEffect: "non-scaling-stroke", strokeLinejoin: "round", strokeLinecap: "round" } as const;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={className} aria-hidden>
      <path d={path(values)} stroke={CHART.series} {...line} />
      {values2 && values2.length === values.length && <path d={path(values2)} stroke={CHART.series2} {...line} />}
    </svg>
  );
}
