import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Empty, ErrorState, Loading, PageHeader, Panel, btnDark, btnLight } from '../components/app/ui'
import { useExercises, useRoutine } from '../hooks/useData'
import { ApiError, type Routine as RoutineData, type RoutineInput, useApi } from '../lib/api'

const field = 'h-11 rounded-lg border border-neutral-200 bg-white px-3 text-base outline-none focus:border-neutral-800'
const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const MAX_WORKOUTS = 7
const letter = (i: number) => String.fromCharCode(65 + i)

type Draft = { name: string; focus: string; weekday: number | null; exercises: { name: string; sets: number }[] }

const blankWorkout = (): Draft => ({ name: '', focus: '', weekday: null, exercises: [{ name: '', sets: 3 }] })

function toDraft(routine: RoutineData): Draft[] {
  if (routine.workouts.length === 0) return [blankWorkout()]
  return routine.workouts.map((w) => ({
    name: w.name,
    focus: w.focus,
    weekday: w.weekday,
    exercises: w.exercises.map((e) => ({ name: e.name, sets: e.sets })),
  }))
}

function validate(draft: Draft[]): string | null {
  for (const [i, w] of draft.entries()) {
    if (!w.name.trim()) return `Treino ${letter(i)}: dê um nome ao treino.`
    if (w.exercises.some((e) => !e.name.trim())) return `Treino ${letter(i)}: preencha o nome de todos os exercícios.`
  }
  return null
}

function ambiguityMessage(err: unknown): string | null {
  if (!(err instanceof ApiError) || !err.detail || typeof err.detail !== 'object' || !('ambiguous' in err.detail)) return null
  const items = err.detail.ambiguous as { typed: string; options: string[] }[]
  const text = items.map((a) => (a.options.length ? `“${a.typed}” pode ser: ${a.options.join(', ')}.` : `Não entendi “${a.typed}”.`)).join(' ')
  return `${text} Escreva o nome completo do exercício.`
}

export default function Routine() {
  const { data, error, refetch } = useRoutine()
  const { data: known } = useExercises()
  const api = useApi()
  const [picked, setPicked] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft[] | null>(null) // não nulo = editando
  const [sel, setSel] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data) return <Loading />

  const editing = draft !== null
  const startEdit = (index = 0) => {
    setDraft(toDraft(data))
    setSel(index)
    setSaveError(null)
  }
  const cancel = () => setDraft(null)

  const patchWorkout = (i: number, patch: Partial<Draft>) => setDraft((d) => d && d.map((w, j) => (j === i ? { ...w, ...patch } : w)))
  const patchExercise = (i: number, k: number, patch: Partial<Draft['exercises'][number]>) =>
    patchWorkout(i, { exercises: draft![i].exercises.map((e, j) => (j === k ? { ...e, ...patch } : e)) })
  const moveExercise = (i: number, k: number, dir: -1 | 1) => {
    const list = [...draft![i].exercises]
    ;[list[k], list[k + dir]] = [list[k + dir], list[k]]
    patchWorkout(i, { exercises: list })
  }
  const addWorkout = () => {
    setDraft((d) => d && [...d, blankWorkout()])
    setSel(draft!.length)
  }
  const removeWorkout = (i: number) => {
    setDraft((d) => d && d.filter((_, j) => j !== i))
    setSel(Math.max(0, i - 1))
  }

  async function save() {
    if (!draft) return
    // exercícios em branco (linhas que o usuário não preencheu) são descartados
    const cleaned = draft.map((w) => ({ ...w, exercises: w.exercises.filter((e) => e.name.trim()) }))
    const problem = validate(draft.map((w, i) => ({ ...w, exercises: cleaned[i].exercises })))
    const empty = cleaned.findIndex((w) => w.exercises.length === 0)
    if (problem || empty >= 0) {
      setSaveError(problem ?? `Treino ${letter(empty)}: adicione ao menos um exercício.`)
      if (empty >= 0 && !problem) setSel(empty)
      return
    }
    setSaving(true)
    setSaveError(null)
    const body: RoutineInput = {
      workouts: cleaned.map((w) => ({
        name: w.name.trim(),
        weekday: w.weekday,
        exercises: w.exercises.map((x) => ({ name: x.name.trim(), sets: x.sets })),
      })),
    }
    try {
      await api<RoutineData>('/routine', { method: 'PUT', json: body })
      setPicked(null)
      setDraft(null)
      refetch()
    } catch (err) {
      setSaveError(ambiguityMessage(err) ?? (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (data.workouts.length === 0 && !editing) {
    return (
      <>
        <PageHeader title="Seus treinos" />
        <Empty title="Você ainda não tem uma rotina">
          Crie sua rotina aqui ou peça ao Iron no Telegram para montar ou importar. Ele resume e você confirma antes de salvar.
        </Empty>
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => startEdit()} className={btnDark}>
            Criar rotina
          </button>
        </div>
      </>
    )
  }

  const active = picked ?? data.next_workout_id ?? data.workouts[0]?.id
  const current = data.workouts.find((w) => w.id === active) ?? data.workouts[0]
  const currentDraft = draft?.[sel]

  return (
    <>
      <PageHeader title="Seus treinos" subtitle="Sequência rotativa. O próximo treino é sempre o seguinte ao último concluído." />
      <datalist id="known-exercises">{known?.map((n) => <option key={n} value={n} />)}</datalist>

      <div className="mt-10 grid items-start gap-6 lg:mt-[64px] lg:grid-cols-[1fr_1.6fr] lg:gap-8">
        <div className="flex flex-col gap-4 lg:gap-6">
          {editing
            ? draft.map((w, i) => (
                <button key={i} type="button" onClick={() => setSel(i)} className="text-left">
                  <Panel active={i === sel} className="transition-all duration-300">
                    <div className="flex items-center gap-4">
                      <span className={`grid size-[42px] shrink-0 place-items-center rounded-full text-lg font-bold ${i === sel ? 'bg-ink text-white' : 'bg-gray-100 text-ink'}`}>
                        {letter(i)}
                      </span>
                      <div>
                        <h3 className="text-xl leading-7 font-semibold">{w.name || 'Novo treino'}</h3>
                        <p className="text-base text-neutral-500">
                          {w.focus ? `${w.focus} · ` : ''}
                          {w.exercises.filter((e) => e.name.trim()).length} exercícios
                        </p>
                      </div>
                    </div>
                  </Panel>
                </button>
              ))
            : data.workouts.map((w) => (
                <button key={w.id} type="button" onClick={() => setPicked(w.id)} className="text-left">
                  <Panel active={w.id === current.id} className="transition-all duration-300">
                    <div className="flex items-center gap-4">
                      <span className={`grid size-[42px] shrink-0 place-items-center rounded-full text-lg font-bold ${w.id === current.id ? 'bg-ink text-white' : 'bg-gray-100 text-ink'}`}>
                        {w.letter}
                      </span>
                      <div>
                        <h3 className="text-xl leading-7 font-semibold">{w.name}</h3>
                        <p className="text-base text-neutral-500">
                          {w.focus ? `${w.focus} · ` : ''}
                          {w.exercises.length} exercícios
                        </p>
                      </div>
                    </div>
                    {w.id === data.next_workout_id && <p className="mt-3 text-sm font-medium text-emerald-600">Próximo treino</p>}
                  </Panel>
                </button>
              ))}
          {editing && draft.length < MAX_WORKOUTS && (
            <button type="button" onClick={addWorkout} className={btnLight}>
              <Plus className="size-4" /> Adicionar treino
            </button>
          )}
        </div>

        <div className="rounded-[32px] bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.04)] lg:p-8">
          {currentDraft ? (
            <>
              <div className="flex items-center gap-3">
                <input
                  aria-label="Nome do treino"
                  placeholder="Nome (ex.: Push)"
                  maxLength={60}
                  value={currentDraft.name}
                  onChange={(e) => patchWorkout(sel, { name: e.target.value })}
                  className={`${field} min-w-0 flex-1 !text-xl font-semibold`}
                />
                {draft.length > 1 && (
                  <button type="button" aria-label="Remover treino" onClick={() => removeWorkout(sel)} className="grid size-11 place-items-center rounded-lg text-red-600 hover:bg-red-50">
                    <Trash2 className="size-5" />
                  </button>
                )}
              </div>
              <label className="mt-4 flex items-center gap-3 text-sm font-semibold">
                Dia sugerido
                <select value={currentDraft.weekday ?? ''} onChange={(e) => patchWorkout(sel, { weekday: e.target.value === '' ? null : Number(e.target.value) })} className={field}>
                  <option value="">Sem dia fixo</option>
                  {WEEKDAYS.map((d, n) => (
                    <option key={d} value={n}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-6 flex flex-col gap-3">
                {currentDraft.exercises.map((x, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <input
                      aria-label="Exercício"
                      list="known-exercises"
                      placeholder="Exercício"
                      maxLength={60}
                      value={x.name}
                      onChange={(e) => patchExercise(sel, k, { name: e.target.value })}
                      className={`${field} min-w-0 flex-1`}
                    />
                    <input
                      aria-label="Séries"
                      type="number"
                      min={1}
                      max={10}
                      value={x.sets}
                      onChange={(e) => patchExercise(sel, k, { sets: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
                      className={`${field} w-16 text-center`}
                    />
                    <span className="hidden text-sm text-neutral-500 sm:inline">séries</span>
                    <button type="button" aria-label="Subir" disabled={k === 0} onClick={() => moveExercise(sel, k, -1)} className="grid size-9 place-items-center rounded-lg hover:bg-gray-100 disabled:opacity-30">
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" aria-label="Descer" disabled={k === currentDraft.exercises.length - 1} onClick={() => moveExercise(sel, k, 1)} className="grid size-9 place-items-center rounded-lg hover:bg-gray-100 disabled:opacity-30">
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remover exercício"
                      onClick={() => patchWorkout(sel, { exercises: currentDraft.exercises.filter((_, j) => j !== k) })}
                      className="grid size-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              {currentDraft.exercises.length < 30 && (
                <button type="button" onClick={() => patchWorkout(sel, { exercises: [...currentDraft.exercises, { name: '', sets: 3 }] })} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold hover:underline">
                  <Plus className="size-4" /> Adicionar exercício
                </button>
              )}

              <p className="mt-6 text-sm text-neutral-500">
                As metas de carga dos exercícios mantidos e o histórico são preservados. Ao salvar, a sequência recomeça pelo treino A.
              </p>
              {saveError && (
                <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                  {saveError}
                </p>
              )}
              <div className="mt-5 flex gap-3">
                <button type="button" onClick={save} disabled={saving} className={`${btnDark} disabled:opacity-60`}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <button type="button" onClick={cancel} disabled={saving} className={btnLight}>
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-2xl font-semibold">
                  {current.name} {current.focus && <span className="font-normal text-neutral-500">· {current.focus}</span>}
                </h2>
                <button
                  type="button"
                  aria-label="Editar treinos"
                  title="Editar treinos"
                  onClick={() => startEdit(Math.max(0, data.workouts.indexOf(current)))}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-neutral-600 transition hover:bg-gray-100 hover:text-ink"
                >
                  <Pencil className="size-5" />
                </button>
              </div>
              <div className="mt-6 divide-y divide-neutral-200/80">
                {current.exercises.map((e) => (
                  <div key={e.exercise_id} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="text-lg font-semibold">{e.name}</h3>
                      {e.group && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-neutral-600">{e.group}</span>}
                    </div>
                    <ul className="mt-3 space-y-1.5 text-[15px]">
                      {e.targets.map((t) => (
                        <li key={t.set} className="flex gap-2 rounded-lg bg-gray-100 px-3 py-2 font-medium">
                          <span className="w-[64px] text-neutral-500">{t.set} Série</span>
                          <span>{t.reps !== null ? `${t.reps} x ${t.kg}kg` : 'meta definida na primeira série'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm text-neutral-500">Você também pode alterar seus treinos pelo Iron no Telegram.</p>
            </>
          )}
        </div>
      </div>
    </>
  )
}
