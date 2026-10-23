import type { SessionSet } from './api'

const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${months[m - 1]} ${y}`
}

/** Minúsculas e sem acento, para buscas. */
export const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const fmtTime = (t: string | null) => (t ? t.slice(0, 5) : null)

export const fmtKg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export function fmtVolume(kg: number) {
  return kg >= 1000 ? `${(kg / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t` : `${fmtKg(kg)} kg`
}

export function signed(v: number, suffix = '') {
  return `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suffix}`
}

export function groupSets(list: SessionSet[]) {
  const map = new Map<string, { reps: number; kg: number }[]>()
  for (const s of list) map.set(s.exercise, [...(map.get(s.exercise) ?? []), { reps: s.reps, kg: s.kg }])
  return [...map].map(([exercise, sets]) => ({ exercise, sets }))
}
