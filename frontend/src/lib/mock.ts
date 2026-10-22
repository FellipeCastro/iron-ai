export const user = { name: 'Fellipe Castro', email: 'fehcastru@gmail.com', linked: true, handle: '@fellipe_castro' }

export type Target = { set: number; reps: number; kg: number; done?: boolean }
export type RoutineExercise = { name: string; group: string; targets: Target[] }
export type Workout = { id: string; name: string; focus: string; exercises: RoutineExercise[] }

const sets = (...pairs: [number, number][]): Target[] => pairs.map(([reps, kg], i) => ({ set: i + 1, reps, kg }))

export const workouts: Workout[] = [
  {
    id: 'A',
    name: 'Treino A',
    focus: 'Peito e tríceps',
    exercises: [
      { name: 'Supino reto', group: 'Peito', targets: sets([12, 20], [12, 30], [12, 40]) },
      { name: 'Supino inclinado', group: 'Peito', targets: sets([12, 16], [11, 20], [10, 24]) },
      { name: 'Crucifixo', group: 'Peito', targets: sets([12, 20], [12, 30], [12, 40]) },
      { name: 'Tríceps corda', group: 'Tríceps', targets: sets([12, 15], [12, 20], [10, 25]) },
    ],
  },
  {
    id: 'B',
    name: 'Treino B',
    focus: 'Costas e bíceps',
    exercises: [
      { name: 'Puxada frontal', group: 'Costas', targets: sets([12, 40], [10, 45], [9, 50]) },
      { name: 'Remada curvada', group: 'Costas', targets: sets([12, 30], [10, 35], [8, 40]) },
      { name: 'Rosca direta', group: 'Bíceps', targets: sets([12, 14], [10, 17], [8, 20]) },
    ],
  },
  {
    id: 'C',
    name: 'Treino C',
    focus: 'Pernas e ombros',
    exercises: [
      { name: 'Agachamento livre', group: 'Pernas', targets: sets([12, 40], [10, 50], [8, 60]) },
      { name: 'Leg press', group: 'Pernas', targets: sets([12, 100], [12, 120], [10, 140]) },
      { name: 'Desenvolvimento', group: 'Ombros', targets: sets([12, 12], [10, 15], [9, 18]) },
    ],
  },
]

export const nextWorkoutId = 'B'

export type Session = {
  id: string
  date: string
  workout: string
  focus: string
  volume: number
  sets: { exercise: string; reps: number; kg: number }[]
}

export const sessions: Session[] = [
  {
    id: 's5',
    date: '21 out 2026',
    workout: 'Treino A',
    focus: 'Peito e tríceps',
    volume: 5820,
    sets: [
      { exercise: 'Supino reto', reps: 12, kg: 20 },
      { exercise: 'Supino reto', reps: 12, kg: 30 },
      { exercise: 'Supino reto', reps: 11, kg: 40 },
      { exercise: 'Supino inclinado', reps: 12, kg: 16 },
      { exercise: 'Supino inclinado', reps: 10, kg: 20 },
      { exercise: 'Tríceps corda', reps: 12, kg: 25 },
    ],
  },
  {
    id: 's4',
    date: '19 out 2026',
    workout: 'Treino C',
    focus: 'Pernas e ombros',
    volume: 9240,
    sets: [
      { exercise: 'Agachamento livre', reps: 12, kg: 40 },
      { exercise: 'Agachamento livre', reps: 10, kg: 50 },
      { exercise: 'Leg press', reps: 12, kg: 140 },
      { exercise: 'Desenvolvimento', reps: 10, kg: 18 },
    ],
  },
  {
    id: 's3',
    date: '17 out 2026',
    workout: 'Treino B',
    focus: 'Costas e bíceps',
    volume: 6310,
    sets: [
      { exercise: 'Puxada frontal', reps: 12, kg: 40 },
      { exercise: 'Puxada frontal', reps: 10, kg: 45 },
      { exercise: 'Remada curvada', reps: 10, kg: 40 },
      { exercise: 'Rosca direta', reps: 12, kg: 20 },
    ],
  },
  {
    id: 's2',
    date: '14 out 2026',
    workout: 'Treino A',
    focus: 'Peito e tríceps',
    volume: 5480,
    sets: [
      { exercise: 'Supino reto', reps: 12, kg: 20 },
      { exercise: 'Supino reto', reps: 10, kg: 30 },
      { exercise: 'Supino inclinado', reps: 10, kg: 16 },
      { exercise: 'Tríceps corda', reps: 11, kg: 25 },
    ],
  },
]

const weekStarts = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']
const dm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
const weeks = weekStarts.map((iso) => {
  const start = new Date(iso)
  const end = new Date(start.getTime() + 6 * 86_400_000)
  return { week: dm(start), range: `${dm(start)} - ${dm(end)}` }
})

export const progress = [
  { ...weeks[0], kg: 25, rm: 33, volume: 4200 },
  { ...weeks[1], kg: 27.5, rm: 36.7, volume: 4650 },
  { ...weeks[2], kg: 27.5, rm: 37.9, volume: 4900 },
  { ...weeks[3], kg: 30, rm: 40, volume: 5300 },
  { ...weeks[4], kg: 30, rm: 41.5, volume: 5480 },
  { ...weeks[5], kg: 30, rm: 42.5, volume: 5820 },
]

export const progressExercises = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name)))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

export function groupSets(list: Session['sets']) {
  const map = new Map<string, { reps: number; kg: number }[]>()
  for (const s of list) map.set(s.exercise, [...(map.get(s.exercise) ?? []), { reps: s.reps, kg: s.kg }])
  return [...map].map(([exercise, sets]) => ({ exercise, sets }))
}

export const weeklyOverview = [
  { ...weeks[0], volume: 14200, treinos: 3 },
  { ...weeks[1], volume: 15800, treinos: 3 },
  { ...weeks[2], volume: 13900, treinos: 2 },
  { ...weeks[3], volume: 17100, treinos: 4 },
  { ...weeks[4], volume: 19800, treinos: 4 },
  { ...weeks[5], volume: 21400, treinos: 4 },
]

export const oneRmByExercise = [
  { ...weeks[0], supino: 33, puxada: 58, agachamento: 78 },
  { ...weeks[1], supino: 36.7, puxada: 60, agachamento: 82 },
  { ...weeks[2], supino: 37.9, puxada: 62, agachamento: 84 },
  { ...weeks[3], supino: 40, puxada: 63, agachamento: 88 },
  { ...weeks[4], supino: 41.5, puxada: 66, agachamento: 90 },
  { ...weeks[5], supino: 42.5, puxada: 68, agachamento: 94 },
]
