import { useClerk, useUser } from '@clerk/react'
import { LogOut, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, ErrorState, Loading, PageHeader, btnDark, btnLight } from '../components/app/ui'
import { useMe, useSettings } from '../hooks/useData'
import { type Settings as SettingsData, useApi } from '../lib/api'

const field = 'mt-2 h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-base outline-none focus:border-neutral-800 disabled:bg-gray-100 disabled:text-neutral-500'

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

type Status = { kind: 'saved' | 'error'; text: string } | null

function SaveRow({ saving, status, label = 'Salvar alterações' }: { saving: boolean; status: Status; label?: string }) {
  return (
    <div className="flex items-center gap-4">
      <button type="submit" disabled={saving} className={`${btnDark} disabled:opacity-60`}>
        {saving ? 'Salvando…' : label}
      </button>
      {status && (
        <span role="status" className={`text-sm font-medium ${status.kind === 'saved' ? 'text-emerald-600' : 'text-red-600'}`}>
          {status.text}
        </span>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-[15px] text-neutral-500">{hint}</p>}
      <div className="mt-6">{children}</div>
    </Card>
  )
}

function ProfileForm() {
  const { user } = useUser()
  const [first, setFirst] = useState(user?.firstName ?? '')
  const [last, setLast] = useState(user?.lastName ?? '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setStatus(null)
    try {
      await user.update({ firstName: first.trim(), lastName: last.trim() })
      setStatus({ kind: 'saved', text: 'Salvo!' })
    } catch (err) {
      const message = (err as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0]
      setStatus({ kind: 'error', text: message?.longMessage ?? message?.message ?? 'Não foi possível salvar o perfil.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-6" onSubmit={save}>
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Nome
          <input value={first} onChange={(e) => setFirst(e.target.value)} maxLength={60} className={field} autoComplete="given-name" />
        </label>
        <label className="text-sm font-semibold">
          Sobrenome
          <input value={last} onChange={(e) => setLast(e.target.value)} maxLength={60} className={field} autoComplete="family-name" />
        </label>
      </div>
      <label className="text-sm font-semibold">
        E-mail
        <input value={user?.primaryEmailAddress?.emailAddress ?? ''} disabled className={field} />
        <span className="mt-1 block text-sm font-normal text-neutral-500">O e-mail é o da sua conta de login e não pode ser alterado aqui.</span>
      </label>
      <SaveRow saving={saving} status={status} />
    </form>
  )
}

function PreferencesForm({ initial }: { initial: SettingsData }) {
  const api = useApi()
  const [time, setTime] = useState(initial.reminder_time?.slice(0, 5) ?? '')
  const [increment, setIncrement] = useState(String(initial.weight_increment_kg))
  const [timezone, setTimezone] = useState(initial.timezone)
  const [status, setStatus] = useState<Status>(null)
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
      <SaveRow saving={saving} status={status} />
    </form>
  )
}

function TelegramSection() {
  const { data, error, refetch } = useMe()
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data) return <Loading />
  return data.linked ? (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-[15px]">
        <span className="font-semibold text-emerald-600">Vinculado</span>
        {data.telegram && <span className="text-neutral-500"> desde {new Date(data.telegram.linked_at).toLocaleDateString('pt-BR')}</span>}
      </p>
      <a href={`https://t.me/${data.bot_username}`} target="_blank" rel="noreferrer" className={btnLight}>
        <Send className="size-4 text-sky-500" /> Abrir o Iron
      </a>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-[15px] text-neutral-500">Sua conta ainda não está conectada ao bot.</p>
      <Link to="/vincular" className={btnDark}>
        Vincular Telegram
      </Link>
    </div>
  )
}

export default function Profile() {
  const { data, error, refetch } = useSettings()
  const { user } = useUser()
  const { signOut } = useClerk()
  const api = useApi()
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
      <PageHeader title="Seu perfil" subtitle="Dados da conta, preferências de treino e o vínculo com o Iron no Telegram." />
      <div className="mx-auto mt-10 flex max-w-[720px] flex-col gap-6 lg:mt-[64px]">
        {user && (
          <Section title="Dados pessoais">
            <ProfileForm />
          </Section>
        )}
        <Section title="Preferências de treino" hint="Valem também para o Iron no Telegram.">
          {error ? <ErrorState error={error} onRetry={refetch} /> : data ? <PreferencesForm initial={data} /> : <Loading />}
        </Section>
        <Section title="Telegram">
          <TelegramSection />
        </Section>
        <Section title="Sessão">
          <button type="button" onClick={() => signOut({ redirectUrl: '/' })} className={btnLight}>
            <LogOut className="size-4" /> Sair da conta
          </button>
        </Section>
        <Card className="!border !border-red-200">
          <h2 className="text-xl font-semibold">Excluir conta</h2>
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
