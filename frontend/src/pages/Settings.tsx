import { useClerk } from '@clerk/react'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Card, ErrorState, Loading, PageHeader, btnDark } from '../components/app/ui'
import { useSettings } from '../hooks/useData'
import { type Settings as SettingsData, useApi } from '../lib/api'

const field = 'mt-2 h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-base outline-none focus:border-neutral-800'

const ZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Fortaleza',
  'America/Bahia',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Belem',
  'America/Recife',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Noronha',
]

function Form({ initial }: { initial: SettingsData }) {
  const api = useApi()
  const [time, setTime] = useState(initial.reminder_time?.slice(0, 5) ?? '')
  const [increment, setIncrement] = useState(String(initial.weight_increment_kg))
  const [timezone, setTimezone] = useState(initial.timezone)
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const zones = ZONES.includes(initial.timezone) ? ZONES : [initial.timezone, ...ZONES]

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setStatus(null)
    try {
      await api<SettingsData>('/settings', {
        method: 'PUT',
        json: { reminder_time: time || null, weight_increment_kg: Number(increment.replace(',', '.')), timezone },
      })
      setStatus({ kind: 'saved', text: 'Salvo!' })
    } catch (err) {
      setStatus({ kind: 'error', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-6" onSubmit={save}>
      <label className="text-sm font-semibold">
        Horário do lembrete
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        <span className="mt-1 block text-sm font-normal text-neutral-500">Deixe vazio para não receber lembretes.</span>
      </label>
      <label className="text-sm font-semibold">
        Incremento de carga (kg)
        <input type="number" step="0.5" min="0.5" max="20" required value={increment} onChange={(e) => setIncrement(e.target.value)} className={field} />
        <span className="mt-1 block text-sm font-normal text-neutral-500">Somado quando você completa 12 reps e a meta volta para 8.</span>
      </label>
      <label className="text-sm font-semibold">
        Fuso horário
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={field}>
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={saving} className={`${btnDark} disabled:opacity-60`}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
        {status && (
          <span role="status" className={`text-sm font-medium ${status.kind === 'saved' ? 'text-emerald-600' : 'text-red-600'}`}>
            {status.text}
          </span>
        )}
      </div>
    </form>
  )
}

export default function Settings() {
  const { data, error, refetch } = useSettings()
  const api = useApi()
  const { signOut } = useClerk()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function deleteAccount() {
    if (!window.confirm('Excluir sua conta e todo o histórico? Essa ação não pode ser desfeita.')) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api('/me', { method: 'DELETE' })
      await signOut({ redirectUrl: '/' })
    } catch (err) {
      setDeleteError((err as Error).message)
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader title="Configurações" subtitle="Ajuste lembretes, incremento de carga e fuso. As mudanças valem para o Iron no Telegram." />
      <div className="mx-auto mt-10 flex max-w-[720px] flex-col gap-6 lg:mt-[64px]">
        <Card>{error ? <ErrorState error={error} onRetry={refetch} /> : data ? <Form initial={data} /> : <Loading />}</Card>
        <Card className="!border !border-red-200">
          <h3 className="text-xl font-semibold">Excluir conta</h3>
          <p className="mt-2 text-[15px] text-neutral-500">Remove sua conta, o vínculo com o Telegram e todo o histórico de treinos. Essa ação não pode ser desfeita.</p>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleting}
            className="mt-5 inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 font-semibold text-red-600 ring-1 ring-red-300 transition hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 className="size-4" /> {deleting ? 'Excluindo…' : 'Excluir minha conta'}
          </button>
          {deleteError && <p className="mt-3 text-sm font-medium text-red-600">{deleteError}</p>}
        </Card>
      </div>
    </>
  )
}
