import type { ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from './ui'

const axis = { stroke: '#9ca3af', fontSize: 12, tickLine: false, axisLine: false } as const
const grid = <CartesianGrid stroke="#eef0f2" vertical={false} />
const fmt = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v))

type TipProps = { active?: boolean; payload?: { name: string; value: number; color: string; payload?: { range?: string } }[]; label?: string; unit?: string }

function Tip({ active, payload, label, unit = '' }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
      <p className="font-semibold">{payload[0].payload?.range ?? label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-neutral-600">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}:{' '}
          <span className="font-semibold text-ink">
            {p.value.toLocaleString('pt-BR')}
            {unit}
          </span>
        </p>
      ))}
    </div>
  )
}

type LegendItem = { name: string; color: string }

export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={`!p-4 sm:!p-6 lg:!p-8 ${className}`}>
      <h3 className="text-lg font-semibold sm:text-xl">{title}</h3>
      {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
      {legend && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
          {legend.map((l) => (
            <li key={l.name} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: l.color }} />
              {l.name}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 h-[220px] sm:h-[280px] lg:h-[320px]">{children}</div>
    </Card>
  )
}

const margin = { top: 8, right: 8, left: -12, bottom: 0 }
const xProps = { ...axis, dataKey: 'week', interval: 'preserveStartEnd' as const, minTickGap: 8, padding: { left: 8, right: 8 } }
const cursor = { stroke: '#d1d5db' }
const dot = { r: 3, fill: '#fff', strokeWidth: 2 }

export function VolumeArea({ data }: { data: { week: string; volume: number }[] }) {
  return (
    <ResponsiveContainer>
      <AreaChart data={data} margin={margin}>
        <defs>
          <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e1a24" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#1e1a24" stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis {...xProps} />
        <YAxis {...axis} width={44} tickFormatter={fmt} domain={[0, (max: number) => Math.ceil(max / 5000) * 5000]} tickCount={6} />
        <Tooltip content={<Tip unit=" kg" />} cursor={cursor} />
        <Area type="monotone" dataKey="volume" name="Volume" stroke="#1e1a24" strokeWidth={2.5} fill="url(#vol)" dot={dot} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function VolumeBars({
  data,
  dataKey = 'volume',
  name = 'Volume',
  unit = ' kg',
}: {
  data: object[]
  dataKey?: string
  name?: string
  unit?: string
}) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={margin}>
        {grid}
        <XAxis {...xProps} />
        <YAxis {...axis} width={44} tickFormatter={fmt} tickCount={5} allowDecimals={false} />
        <Tooltip content={<Tip unit={unit} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
        <Bar dataKey={dataKey} name={name} fill="#1e1a24" radius={[8, 8, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

type Series = { key: string; name: string; color: string; step?: boolean }

export function MultiLine({ data, series, unit = ' kg' }: { data: object[]; series: Series[]; unit?: string }) {
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={margin}>
        {grid}
        <XAxis {...xProps} />
        <YAxis {...axis} width={40} domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={(v) => String(Math.round(v))} tickCount={5} />
        <Tooltip content={<Tip unit={unit} />} cursor={cursor} />
        {series.map((s) => (
          <Line key={s.key} connectNulls type={s.step ? 'stepAfter' : 'monotone'} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={dot} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
