import Image from "next/image";
import Link from "next/link";
import { CtaBadges, SIGN_IN_URL } from "@/components/landing/cta-badges";
import { FeatureShowcase } from "@/components/landing/feature-showcase";
import {
  ArrowRightIcon,
  ChartUpIcon,
  ChevronDownIcon,
  DumbbellIcon,
  GithubIcon,
  InstagramIcon,
  LaurelIcon,
  MonitorIcon,
  StarIcon,
  TelegramIcon,
  TimerIcon,
} from "@/components/landing/icons";

const navLinks = [
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Recursos", href: "#recursos" },
  { label: "FAQ", href: "#faq" },
  { label: "Entrar", href: SIGN_IN_URL },
];

const chatCards = [
  {
    title: "Registro por texto livre",
    text: "Mande “supino reto 1 série 10kg” e pronto: a série fica salva no seu histórico.",
    image: "/assets/image-01.png",
    position: "50% 0%",
    height: "h-[543px]",
  },
  {
    title: "Plano do dia no seu horário",
    text: "No dia de treino, o Iron AI te avisa com o plano completo: exercícios, séries, reps e carga de hoje.",
    image: "/assets/image-02.png",
    position: "50% 0%",
    height: "h-[571px]",
  },
  {
    title: "Evolução em segundos",
    text: "Pergunte “evolução no supino reto” e receba o gráfico com carga atual, 1RM estimado e volume total do período.",
    image: "/assets/image-03.png",
    position: "50% 0%",
    height: "h-[571px]",
  },
  {
    title: "Errou? Ele corrige",
    text: "É só mandar “errei, foi 25kg” que a série é corrigida 🔥",
    image: "/assets/image-01.png",
    position: "50% 60%",
    height: "h-[571px]",
  },
  {
    title: "Metas automáticas",
    text: "Bateu a meta? +1 rep 😮",
    image: "/assets/image-04.png",
    position: "50% 35%",
    height: "h-[571px]",
  },
  {
    title: "Resumo de progressão",
    text: "Carga, repetições e volume comparados no período. Simples, rápido e sem planilha.",
    image: "/assets/image-04.png",
    position: "50% 75%",
    height: "h-[571px]",
  },
];

const reasons = [
  {
    icon: <TimerIcon className="size-7" />,
    title: "Economize seu tempo",
    text: "Nada de planilha nem app cheio de botões. Você escreve do seu jeito no Telegram e o Iron AI entende exercício, carga e repetições na hora.",
  },
  {
    icon: <ChartUpIcon className="size-7" />,
    title: "Progressão sem achismo",
    text: "Regra clara e automática: bateu a meta, ganha +1 rep. Chegou a 12 reps, a carga sobe e as reps voltam para 8. Simples assim.",
  },
  {
    icon: <DumbbellIcon className="size-8" />,
    title: "Treine com constância",
    text: "Lembretes nos seus dias e horários de treino, rodízio A→B→C automático e um resumo ao final de cada sessão para você não perder o ritmo.",
  },
];

const conversations = [
  { initial: "R", color: "bg-[#2AABEE]", label: "Registrar série", text: "“supino reto 3x10 com 20kg, depois 2x8 com 25kg”" },
  { initial: "C", color: "bg-[#f97316]", label: "Corrigir série", text: "“errei, a última série foi 25kg e não 20kg 🙈”" },
  {
    initial: "P",
    color: "bg-[#a855f7]",
    label: "Perguntar evolução",
    text: "“como está minha evolução no agachamento nos últimos 2 meses? quero ver se a carga subiu 📈”",
  },
  { initial: "E", color: "bg-[#eab308]", label: "Série extra", text: "“fiz também 3 séries de abdominal na polia ⭐”" },
  { initial: "T", color: "bg-[#64748b]", label: "Terminar treino", text: "“terminei por hoje, manda o resumo 💪🔥”" },
];

const faqs = [
  {
    q: "O Iron AI é grátis mesmo?",
    a: "Sim. O Iron AI é gratuito. Existe apenas um limite diário de mensagens para manter o serviço estável para todo mundo.",
  },
  {
    q: "Como conecto minha conta ao Telegram?",
    a: "Crie sua conta no site e clique em “Conectar Telegram”. Você será levado ao bot com um link único, e o vínculo é feito automaticamente.",
  },
  {
    q: "Mandei uma série errada. Como corrijo?",
    a: "Basta escrever a correção no chat, como “errei, foi 25kg”. A série é corrigida e suas metas são recalculadas.",
  },
  {
    q: "Como funciona a progressão automática de 8 a 12 repetições e quando a carga aumenta?",
    a: "Cada série tem uma meta. Se você bate a meta, a próxima ganha +1 rep. Ao chegar em 12 reps, a carga sobe pelo seu incremento configurado e as reps voltam para 8.",
  },
  {
    q: "Posso mudar o horário dos lembretes?",
    a: "Sim. No painel web você define seus dias de treino, horário do lembrete, fuso e incremento de carga.",
  },
  {
    q: "Como excluo minha conta e meus dados?",
    a: "Em Configurações, no painel web, use “Excluir conta”. Todos os seus dados são apagados de forma definitiva.",
  },
];

const footerColumns = [
  {
    title: "Legal",
    links: [
      { label: "Política de privacidade", href: "#" },
      { label: "Termos de uso", href: "#" },
      { label: "Exclusão de dados", href: "#" },
      { label: "Como usamos IA nos seus dados", href: "#" },
    ],
  },
  {
    title: "Produto",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "Contato", href: "#" },
      { label: "Painel web", href: SIGN_IN_URL },
      { label: "Relatórios", href: "#recursos", badge: "Novo" },
    ],
  },
];

function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-[3px] ${className}`} aria-label="Iron AI">
      <Image src="/assets/logo-icon-black.png" alt="" width={337} height={325} className="h-[30px] w-auto" />
      <Image src="/assets/logo-text-black.png" alt="Iron AI" width={448} height={124} className="h-[23px] w-auto" />
    </Link>
  );
}

function Chip({ title, value, className }: { title: string; value: string; className: string }) {
  return (
    <div
      className={`absolute z-10 rounded-[14px] bg-white px-3 py-2 text-center text-[12px] leading-[15px] font-semibold text-[#111] shadow-[0_6px_20px_rgba(0,0,0,0.12)] ${className}`}
    >
      {title}
      <br />
      {value}
    </div>
  );
}

export default function Home() {
  return (
    <div className="bg-[linear-gradient(180deg,#ffffff_0px,#fffffc_400px,#fffff6_1500px,#fffff1_2500px,#fdfef2_3000px,#f7fbf7_4000px,#f1f8fd_5000px)] text-[#111]">
      {/* Header */}
      <header className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-6 lg:px-20">
        <Logo />
        <nav className="hidden items-center gap-[30px] text-[16px] font-medium lg:flex">
          {navLinks.map((link) => (
            <Link key={link.label} href={link.href} className="hover:opacity-70">
              {link.label}
            </Link>
          ))}
        </nav>
        <CtaBadges size="sm" className="hidden md:flex" />
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 pt-10 pb-24 lg:min-h-[820px] lg:grid-cols-[1fr_700px] lg:px-0 lg:pt-0 lg:pb-0 lg:pl-[105px]">
        <div className="lg:-mt-[150px]">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-[#e3e3e3] bg-white py-1 pr-3 pl-2">
            <div className="flex -space-x-2">
              {[
                ["💪", "bg-[#fde68a]"],
                ["🏋️", "bg-[#bfdbfe]"],
                ["🔥", "bg-[#fecaca]"],
              ].map(([emoji, bg]) => (
                <span key={emoji} className={`flex size-[34px] items-center justify-center rounded-full border-2 border-white text-[16px] ${bg}`}>
                  {emoji}
                </span>
              ))}
            </div>
            <span className="text-[13px] font-medium sm:text-[14px]">
              Direto no Telegram com <StarIcon className="-mt-1 inline size-4" /> 100% grátis
            </span>
          </div>
          <h1 className="mt-6 text-[36px] leading-[46px] font-medium sm:text-[48px] sm:leading-[64px] tracking-[-0.01em]">
            <span className="font-bold">Conheça o Iron AI</span>
            <br />
            Registre seu treino
            <br />
            com uma mensagem
          </h1>
          <p className="mt-6 max-w-[520px] text-[16px] leading-6 text-[#5b5b66]">
            Conheça o Iron AI, o assistente de treino que vive no seu Telegram. Mande suas séries em texto livre e ele
            registra, calcula a próxima meta e acompanha sua evolução.
          </p>
          <CtaBadges className="mt-6" />
        </div>

        <div className="relative hidden h-[640px] lg:block">
          <Image
            src="/assets/image-01.png"
            alt="Conversa com o Iron AI registrando uma série de supino"
            width={527}
            height={1006}
            priority
            className="absolute top-0 left-0 w-[285px] -rotate-[3deg] drop-shadow-[0_20px_30px_rgba(0,0,0,0.18)]"
          />
          <svg
            viewBox="0 0 120 80"
            className="absolute top-[200px] left-[280px] w-[115px]"
            fill="none"
            stroke="#111"
            strokeWidth={1.6}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M2 18c18 10 32 30 52 34 14 3 14-14 8-28-6-14-16-14-16 2 0 18 16 34 40 36 12 1 22-2 30-6" />
            <path d="M108 50l9 5-9 5" />
          </svg>
          <Image
            src="/assets/image-02.png"
            alt="Plano de treino do dia enviado pelo Iron AI"
            width={529}
            height={991}
            priority
            className="absolute -top-[50px] left-[385px] w-[290px] rotate-[4deg] drop-shadow-[0_20px_30px_rgba(0,0,0,0.18)]"
          />
          <Chip title="Supino reto" value="25kg" className="-top-[20px] left-[425px]" />
          <Chip title="Meta" value="11 reps" className="top-[100px] left-[365px]" />
          <Chip title="Séries" value="3" className="top-[60px] left-[600px]" />
        </div>
      </section>

      {/* Chat cards */}
      <section id="como-funciona" className="mx-auto max-w-[1440px] px-6 pt-10 lg:px-[96px]">
        <h2 className="text-center text-[32px] leading-tight sm:text-[44px] font-medium tracking-[-0.01em] lg:text-[48px]">
          Tudo pelo chat, do jeito que você já fala 👀
        </h2>
        <div className="mt-[90px] grid gap-[21px] md:grid-cols-3">
          {[0, 1, 2].map((col) => (
            <div key={col} className={`flex flex-col gap-[21px] ${col === 1 ? "" : "md:mt-[80px]"}`}>
              {[chatCards[col], chatCards[col + 3]].map((card) => (
                <article
                  key={card.title}
                  className={`relative overflow-hidden rounded-[24px] bg-[#0b1626] shadow-[0_10px_30px_rgba(0,0,0,0.12)] ${card.height}`}
                >
                  <Image
                    src={card.image}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 402px, 100vw"
                    className="scale-[1.35] object-cover"
                    style={{ objectPosition: card.position }}
                  />
                  <div className="absolute inset-x-4 bottom-4 rounded-[14px] border border-white/25 bg-[linear-gradient(110deg,rgba(0,0,0,0.75),rgba(30,30,40,0.45))] px-6 pt-5 pb-6 text-white backdrop-blur-md">
                    <span className="block text-[22px] leading-3 font-black text-[#3b82f6]">&quot;</span>
                    <h3 className="mt-2 text-[20px] font-bold">{card.title}</h3>
                    <p className="mt-2 text-[14px] leading-5 text-white/90">{card.text}</p>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* What it includes */}
      <section id="recursos" className="pt-[240px]">
        <h2 className="mb-[70px] text-center text-[32px] leading-tight sm:text-[44px] font-medium tracking-[-0.01em] lg:text-[48px]">
          O que o Iron AI inclui?
        </h2>
        <FeatureShowcase />
      </section>

      {/* Why choose */}
      <section className="mx-auto max-w-[1440px] px-6 pt-[240px]">
        <h2 className="text-center text-[32px] leading-tight sm:text-[44px] font-semibold tracking-[-0.01em] lg:text-[48px]">
          Por que escolher o Iron AI?
        </h2>
        <p className="mt-2 text-center text-[18px] text-[#333]">O jeito mais simples de registrar e evoluir seu treino.</p>
        <div className="mx-auto mt-[84px] grid max-w-[1120px] gap-8 md:grid-cols-3">
          {reasons.map((reason) => (
            <article key={reason.title} className="rounded-[28px] bg-white px-8 pt-8 pb-10 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
              <div className="flex size-16 items-center justify-center rounded-xl bg-[#f5f5f8]">{reason.icon}</div>
              <h3 className="mt-6 text-[20px] font-bold">{reason.title}</h3>
              <p className="mt-6 text-[14px] leading-5 text-[#3f3f46]">{reason.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Highlight */}
      <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 pt-[235px] pb-[260px] lg:grid-cols-[1fr_480px] lg:pl-[145px] lg:pr-[110px]">
        <div>
          <p className="text-[14px] font-medium tracking-[0.08em] text-[#f43f5e] uppercase">Novo recurso</p>
          <h2 className="mt-6 text-[34px] leading-[44px] font-semibold sm:text-[48px] sm:leading-[60px] tracking-[-0.01em] text-[#1f2433]">
            Progressão automática
            <br />
            de 8 a 12 reps, sem
            <br />
            planilha! 📈💪
          </h2>
          <p className="mt-8 text-[18px] text-[#475569]">Você só treina, a conta é com a gente :)</p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <Image
            src="/assets/image-04.png"
            alt="Resumo de progressão no supino reto enviado pelo Iron AI"
            width={533}
            height={962}
            className="w-[355px] -rotate-[4deg] drop-shadow-[0_25px_35px_rgba(0,0,0,0.2)]"
          />
        </div>
      </section>

      {/* Conversations (dark) */}
      <section className="bg-[#1e1a24] px-6 pt-[157px] pb-[169px]">
        <h2 className="text-center text-[32px] leading-tight sm:text-[44px] font-semibold tracking-[-0.01em] text-white lg:text-[48px]">
          Fale do seu jeito, ele entende
        </h2>
        <div className="mx-auto mt-[68px] flex max-w-[1024px] flex-wrap justify-center gap-8">
          {conversations.map((item) => (
            <article
              key={item.label}
              className="min-h-[184px] w-full rounded-xl border border-white/10 bg-[#2d2935] px-8 pt-8 pb-8 shadow-[0_10px_30px_rgba(0,0,0,0.25)] sm:w-[320px]"
            >
              <div className="flex items-center gap-4">
                <span className={`flex size-[42px] items-center justify-center rounded-full text-[18px] font-bold text-white ${item.color}`}>
                  {item.initial}
                </span>
                <h3 className="text-[20px] font-semibold text-white">{item.label}</h3>
              </div>
              <p className="mt-5 text-[14px] leading-5 font-medium text-[#d4d4d8]">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-[linear-gradient(180deg,#f4f9f9,#f9fcf5)] px-6 pt-[134px] pb-8">
        <h2 className="text-center text-[32px] leading-tight sm:text-[44px] font-medium tracking-[-0.01em] lg:text-[48px]">Perguntas frequentes</h2>
        <p className="mt-2 text-center text-[18px] text-[#333]">As dúvidas que mais recebemos.</p>
        <div className="mx-auto mt-[52px] flex max-w-[768px] flex-col gap-3">
          {faqs.map((faq) => (
            <details key={faq.q} className="group rounded-[20px] bg-white px-6 py-[25px]">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[18px] leading-7 font-medium [&::-webkit-details-marker]:hidden">
                {faq.q}
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] transition-transform group-open:rotate-180">
                  <ChevronDownIcon className="size-3.5" />
                </span>
              </summary>
              <p className="mt-3 pr-12 text-[16px] leading-6 text-[#5b5b66]">{faq.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Link
            href="#faq"
            className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-6 py-[13px] text-[16px] font-medium hover:bg-[#f3f4f6]"
          >
            Ver todas as dúvidas <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </section>

      {/* Ratings / CTA */}
      <section className="relative overflow-hidden bg-[#f6efe8] px-6 pt-[170px] pb-[157px]">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_0%_40%,#e3e6e6_0%,transparent_45%),radial-gradient(ellipse_at_55%_100%,#f3e3e4_0%,transparent_55%),radial-gradient(ellipse_at_100%_30%,#fbfbf0_0%,transparent_50%),radial-gradient(ellipse_at_40%_0%,#f7f0e5_0%,transparent_55%)]"
        />
        <div className="relative mx-auto flex max-w-[780px] items-center justify-between">
          <LaurelIcon className="relative -top-[60px] hidden h-[122px] w-[44px] md:block" />
          <div className="flex flex-col items-center text-center">
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }, (_, i) => (
                <StarIcon key={i} className="size-11" />
              ))}
            </div>
            <h2 className="mt-1 max-w-[400px] text-[36px] leading-[40px] font-bold sm:text-[48px] sm:leading-[48px] tracking-[-0.01em] text-[#1e1a24]">
              Seu próximo PR começa aqui
            </h2>
            <div className="mt-6 flex items-center gap-4 text-[18px] text-[#3f3f46]">
              <span className="flex items-center gap-2">
                <TelegramIcon className="size-6 text-[#3b3842]" /> Telegram
              </span>
              <span className="size-1 rounded-full bg-[#a1a1aa]" />
              <span className="flex items-center gap-2">
                <MonitorIcon className="size-6 text-[#3b3842]" /> Painel web
              </span>
            </div>
            <CtaBadges size="sm" className="mt-11 justify-center" />
          </div>
          <LaurelIcon className="relative -top-[60px] hidden h-[122px] w-[44px] -scale-x-100 md:block" />
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#fefff0]">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-6 pt-7 pb-4 md:grid-cols-3 lg:px-4">
          <div>
            <Logo className="[&_img:first-child]:h-[37px] [&_img:last-child]:h-[29px]" />
            <p className="mt-6 text-[14px] text-[#3f3f46]">Comece a usar o Iron AI</p>
            <CtaBadges size="sm" className="mt-4" />
          </div>
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h3 className="text-[16px] font-semibold">{column.title}</h3>
              <ul className="mt-5 flex flex-col gap-[11px]">
                {column.links.map((link) => (
                  <li key={link.label} className="flex items-center gap-2">
                    <Link href={link.href} className="text-[14px] text-[#3f3f46] hover:text-black">
                      {link.label}
                    </Link>
                    {"badge" in link && (
                      <span className="rounded-full bg-[#1e1a24] px-2 py-0.5 text-[11px] font-semibold text-white">{link.badge}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 border-t border-[#e6e6dc] px-4 py-3">
          <p className="text-[14px] text-[#3f3f46]">© Copyright 2026, Iron AI. Todos os direitos reservados</p>
          <div className="flex items-center gap-4">
            <Link href="#" aria-label="Telegram">
              <TelegramIcon className="size-6" />
            </Link>
            <Link href="#" aria-label="Instagram">
              <InstagramIcon className="size-6" />
            </Link>
            <Link href="#" aria-label="GitHub">
              <GithubIcon className="size-6" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
