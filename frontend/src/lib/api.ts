import { useAuth } from '@clerk/react'
import { useCallback } from 'react'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type Me = {
  id: number
  name: string | null
  email: string | null
  timezone: string
  linked: boolean
  telegram: { linked_at: string } | null
  bot_username: string
}
export type LinkCode = { code: string; expires_at: string; deep_link: string; bot_username: string }
export type Target = { set: number; reps: number | null; kg: number | null }
export type RoutineExercise = { exercise_id: number; name: string; group: string | null; sets: number; targets: Target[] }
export type Workout = { id: number; letter: string; name: string; focus: string; weekday: number | null; exercises: RoutineExercise[] }
export type Routine = { workouts: Workout[]; next_workout_id: number | null; reminder_time: string | null }
export type SessionSet = { exercise: string; set_number: number; reps: number; kg: number }
export type Session = { id: number; date: string; workout: string; letter: string | null; focus: string; volume: number; sets: SessionSet[] }
export type WeekPoint = { week: string; range: string; week_start: string }
export type Dashboard = {
  stats: {
    workouts_month: number
    workouts_month_change: number
    volume_week: number
    volume_week_change_pct: number | null
    streak_weeks: number
    streak_record_weeks: number
  }
  weekly: (WeekPoint & { volume: number; treinos: number })[]
  one_rm: { series: { key: string; name: string }[]; data: (WeekPoint & Record<string, number | string | null>)[] }
}
export type Progress = {
  exercise: string
  points: (WeekPoint & { kg: number; rm: number; volume: number })[]
  summary: { kg: number; rm: number; volume: number; kg_change: number; rm_change: number; volume_change_pct: number | null } | null
}
export type Settings = { reminder_time: string | null; weight_increment_kg: number; timezone: string }

function messageFrom(detail: unknown, fallback: string) {
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message
  return fallback
}

/** Cliente HTTP que anexa o token de sessão do Clerk. */
export function useApi() {
  const { getToken } = useAuth()
  return useCallback(
    async <T,>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
      const token = await getToken()
      const headers = new Headers(init.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (init.json !== undefined) headers.set('Content-Type', 'application/json')
      let res: Response
      try {
        res = await fetch(`${API_URL}${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body })
      } catch {
        throw new ApiError(0, 'Não consegui falar com o servidor. Tente novamente.')
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(res.status, messageFrom(body?.detail, 'Algo deu errado. Tente novamente.'))
      }
      return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
    },
    [getToken],
  )
}
