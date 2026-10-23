import { Search } from 'lucide-react'
import { useState } from 'react'
import type { RecordItem } from '../../lib/api'
import { fmtDate, fmtKg, norm } from '../../lib/format'

const weekdays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Dias do mês em grade de semanas (domingo a sábado); só os dias treinados ficam marcados. */
export function CalendarGrid({ month, days }: { month: string; days: string[] }) {
  const [year, m] = month.split('-').map(Number)
  const trained = new Set(days)
  const offset = new Date(year, m - 1, 1).getDay()
  const total = new Date(year, m, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
  const iso = (d: number) => `${month}-${String(d).padStart(2, '0')}`

  return (
    <div className="grid h-full grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-1 sm:gap-1.5">
      {weekdays.map((w) => (
        <span key={w} className="text-center text-xs font-medium text-neutral-400">
          {w}
        </span>
      ))}
      {cells.map((d, i) =>
        d === null ? (
          <span key={`e${i}`} />
        ) : (
          <span
            key={d}
            className={`grid min-h-0 place-items-center rounded-lg text-xs font-medium sm:text-sm ${trained.has(iso(d)) ? 'bg-ink text-white' : 'text-neutral-500'}`}
          >
            {d}
          </span>
        ),
      )}
    </div>
  )
}

export function RecordsTable({ records }: { records: RecordItem[] }) {
  const [query, setQuery] = useState('')
  const shown = records.filter((r) => norm(r.exercise).includes(norm(query.trim())))

  return (
    <>
      <div className="relative w-full max-w-[360px]">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar exercício"
          aria-label="Buscar exercício nos recordes"
          className="h-11 w-full rounded-lg border border-neutral-200 bg-white pr-4 pl-10 text-base outline-none focus:border-neutral-800"
        />
      </div>
      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Nenhum exercício encontrado.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[15px]">
            <thead className="text-sm text-neutral-500">
              <tr>
                <th className="py-2 font-medium">Exercício</th>
                <th className="py-2 font-medium">Recorde</th>
                <th className="py-2 text-right font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.exercise} className="border-t border-neutral-100">
                  <td className="py-3">
                    <p className="font-medium">{r.exercise}</p>
                    {r.group && <p className="text-xs text-neutral-500">{r.group}</p>}
                  </td>
                  <td className="py-3 font-semibold">{r.weight_kg > 0 ? `${fmtKg(r.weight_kg)} kg × ${r.reps}` : `${r.reps} reps`}</td>
                  <td className="py-3 text-right text-neutral-500">{fmtDate(r.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
