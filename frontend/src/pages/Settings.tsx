import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Card, PageHeader, btnDark } from '../components/app/ui'

const field = 'mt-2 h-12 w-full rounded-lg border border-neutral-200 bg-white px-4 text-base outline-none focus:border-neutral-800'

export default function Settings() {
  const [saved, setSaved] = useState(false)
  return (
    <>
      <PageHeader title="Configurações" subtitle="Ajuste lembretes, incremento de carga e fuso. As mudanças valem para o Iron no Telegram." />
      <div className="mx-auto mt-10 flex max-w-[720px] flex-col gap-6 lg:mt-[64px]">
        <Card>
          <form
            className="grid gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              setSaved(true)
            }}
          >
            <label className="text-sm font-semibold">
              Horário do lembrete
              <input type="time" defaultValue="18:00" className={field} />
            </label>
            <label className="text-sm font-semibold">
              Incremento de carga (kg)
              <input type="number" step="0.5" defaultValue={5} className={field} />
              <span className="mt-1 block text-sm font-normal text-neutral-500">Somado quando você completa 12 reps e a meta volta para 8.</span>
            </label>
            <label className="text-sm font-semibold">
              Fuso horário
              <select defaultValue="America/Sao_Paulo" className={field}>
                <option>America/Sao_Paulo</option>
                <option>America/Manaus</option>
                <option>America/Fortaleza</option>
              </select>
            </label>
            <div className="flex items-center gap-4">
              <button type="submit" className={btnDark}>
                Salvar alterações
              </button>
              {saved && <span className="text-sm font-medium text-emerald-600">Salvo!</span>}
            </div>
          </form>
        </Card>
        <Card className="!border !border-red-200">
          <h3 className="text-xl font-semibold">Excluir conta</h3>
          <p className="mt-2 text-[15px] text-neutral-500">Remove sua conta, o vínculo com o Telegram e todo o histórico de treinos. Essa ação não pode ser desfeita.</p>
          <button
            type="button"
            className="mt-5 inline-flex h-12 items-center gap-2 rounded-lg bg-white px-5 font-semibold text-red-600 ring-1 ring-red-300 transition hover:bg-red-50"
          >
            <Trash2 className="size-4" /> Excluir minha conta
          </button>
        </Card>
      </div>
    </>
  )
}
