import { type Dashboard, type Me, type Progress, type Routine, type Session, type Settings, useApi } from '../lib/api'
import { useQuery } from './useQuery'

export const useMe = () => {
  const api = useApi()
  return useQuery('me', () => api<Me>('/me'))
}

export const useRoutine = () => {
  const api = useApi()
  return useQuery('routine', () => api<Routine>('/routine'))
}

export const useSessions = (limit = 20) => {
  const api = useApi()
  return useQuery(`sessions-${limit}`, () => api<Session[]>(`/sessions?limit=${limit}`))
}

export const useDashboard = () => {
  const api = useApi()
  return useQuery('dashboard', () => api<Dashboard>('/dashboard'))
}

export const useExercises = () => {
  const api = useApi()
  return useQuery('exercises', () => api<string[]>('/exercises'))
}

export const useProgress = (exercise: string | null) => {
  const api = useApi()
  return useQuery(exercise && `progress-${exercise}`, () => api<Progress>(`/progress/${encodeURIComponent(exercise ?? '')}`))
}

export const useSettings = () => {
  const api = useApi()
  return useQuery('settings', () => api<Settings>('/settings'))
}
