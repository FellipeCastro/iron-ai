import { useAuth } from '@clerk/react'
import { useCallback } from 'react'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  detail?: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
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
export type RoutineInput = { workouts: { name: string; weekday: number | null; exercises: { name: string; sets: number }[] }[] }
export type SessionSet = { exercise: string; set_number: number; reps: number; kg: number }
export type Session = { id: number; date: string; workout: string; letter: string | null; focus: string; volume: number; sets: SessionSet[] }
export type WeekPoint = { week: string; range: string; week_start: string }
export type MuscleShare = { name: string; sets: number; pct: number }
export type Dashboard = {
  stats: {
    days_trained_week: number
    days_planned_week: number
    records_month: number
    top_muscle: MuscleShare | null
    streak_weeks: number
    streak_record_weeks: number
  }
  weekly: (WeekPoint & { treinos: number })[]
  muscles: MuscleShare[]
  by_workout: { name: string; treinos: number }[]
  calendar: { month: string; days: string[] }
}
export type ExerciseRecord = { weight_kg: number; reps: number; date: string }
export type RecordItem = ExerciseRecord & { exercise: string; group: string | null }
export type Progress = {
  exercise: string
  points: (WeekPoint & { kg: number })[]
  kg_change: number | null
  record: ExerciseRecord | null
  rm_estimate: number | null
}
export type Settings = { reminder_time: string | null; training_days: number[]; weight_increment_kg: number; timezone: string }

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
        throw new ApiError(res.status, messageFrom(body?.detail, 'Algo deu errado. Tente novamente.'), body?.detail)
      }
      return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
    },
    [getToken],
  )
}
