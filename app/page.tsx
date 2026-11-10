import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Chip } from "@/components/brand/chip";
import { HeaderAuth } from "@/components/brand/header-auth";
import { Logo } from "@/components/brand/logo";
import { CtaBadges, SIGN_IN_URL } from "@/components/landing/cta-badges";
import { FeatureShowcase } from "@/components/landing/feature-showcase";
import { ANNUAL_PRICE, MONTHLY_PRICE, Pricing } from "@/components/landing/pricing";
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
import { siteUrl } from "@/lib/env";
import { PRIVACY_URL, TERMS_URL } from "@/lib/routes";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const navLinks = [
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Recursos", href: "#recursos" },
  { label: "Preços", href: "#precos" },
  { label: "FAQ", href: "#faq" },
];

// Background photos live in public/assets/gym/ (gym, weights, training; no people's portraits).
const chatCards = [
  {
    title: "Registro por texto livre",
    text: "Mande “supino reto 10 reps com 10kg” e pronto: a série fica salva no seu histórico.",
    height: "h-[460px] md:h-[549px]",
    photo: "/assets/gym/01.jpg",
  },
  {
    title: "Plano do dia no seu horário",
    text: "No dia de treino, o Iron AI te avisa com o plano completo: exercícios, séries, reps e carga de hoje.",
    height: "h-[460px] md:h-[577px]",
    photo: "/assets/gym/02.jpg",
  },
  {
    title: "Evolução em segundos",
    text: "Pergunte “evolução no supino reto” e receba o gráfico com carga atual, 1RM estimado e calorias gastas no período.",
    height: "h-[460px] md:h-[577px]",
    photo: "/assets/gym/03.jpg",
  },
  {
    title: "Errou? Ele corrige",
    text: "É só mandar “errei, foi 25kg” que a série é corrigida 🔥",
    height: "h-[460px] md:h-[579px]",
    photo: "/assets/gym/04.jpg",
  },
  {
    title: "Metas automáticas",
    text: "Bateu a meta? A próxima série pede +1 rep. Chegou a 12, a carga sobe sozinha 😮",
    height: "h-[460px] md:h-[579px]",
    photo: "/assets/gym/05.jpg",
  },
  {
    title: "Resumo de progressão",
    text: "Carga, repetições e calorias lado a lado no período, sem você montar planilha.",
    height: "h-[460px] md:h-[579px]",
    photo: "/assets/gym/06.jpg",
  },
];

const reasons = [
  {
    icon: <TimerIcon className="size-7" />,
    title: "Sem planilha, sem menu",
    text: "Escreva como falaria com um colega de treino: “supino 3x10 com 20kg”. O Iron AI entende exercício, carga e repetições e salva a série.",
  },
  {
    icon: <ChartUpIcon className="size-7" />,
    title: "Progressão sem achismo",
    text: "Bateu a meta, a próxima série ganha +1 rep. Chegou a 12 reps, a carga sobe e as reps voltam para 8. Você sempre sabe o que fazer na série seguinte.",
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
    q: "Quanto custa o Iron AI?",
    a: "Todos os recursos ficam liberados nos dois planos. O mensal custa R$ 14,90 por mês e o anual R$ 139,90 por ano, à vista (equivale a R$ 11,66 por mês).",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Não há fidelidade: você cancela quando quiser. E, se preferir, pode excluir sua conta e todos os seus dados em Configurações, no painel web.",
  },
  {
    q: "Existe limite de mensagens?",
    a: "Sim, para manter o serviço estável: até 60 mensagens de texto por dia e 1.000 por mês no bot. Um treino completo costuma usar bem menos que isso, e toques em botões não contam.",
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
    q: "Posso mudar o horário do treino?",
    a: "Sim. No painel web você define seus dias de treino, horário do treino, fuso e incremento de carga.",
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
      { label: "Política de privacidade", href: PRIVACY_URL },
      { label: "Termos de serviço", href: TERMS_URL },
      { label: "Exclusão de dados", href: `${PRIVACY_URL}#exclusao` },
      { label: "Como usamos IA nos seus dados", href: `${PRIVACY_URL}#ia` },
    ],
  },
  {
    title: "Produto",
    links: [
      { label: "Preços", href: "#precos" },
      { label: "FAQ", href: "#faq" },
      { label: "Contato", href: `${PRIVACY_URL}#contato` },
      { label: "Painel web", href: SIGN_IN_URL },
      { label: "Relatórios", href: "#recursos", badge: "Novo" },
    ],
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl()}/#organization`,
      name: "Iron AI",
      url: siteUrl(),
      logo: `${siteUrl()}/assets/logo-icon-black.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl()}/#website`,
      name: "Iron AI",
      url: siteUrl(),
      inLanguage: "pt-BR",
      publisher: { "@id": `${siteUrl()}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl()}/#app`,
      name: "Iron AI",
      description:
        "Contato inteligente que organiza os seus treinos: registro de séries por mensagem, metas automáticas, lembretes e gráficos de evolução.",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, Telegram",
      inLanguage: "pt-BR",
      url: siteUrl(),
      offers: [
        { "@type": "Offer", name: "Mensal", price: MONTHLY_PRICE.toFixed(2), priceCurrency: "BRL" },
        { "@type": "Offer", name: "Anual", price: ANNUAL_PRICE.toFixed(2), priceCurrency: "BRL" },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
  ],
};

export default function Home() {
  return (
    <div className="bg-[linear-gradient(180deg,#ffffff_0px,#fffffc_400px,#fffff6_1500px,#fffff1_2500px,#fdfef2_3000px,#f7fbf7_4000px,#f1f8fd_5000px)] text-[#111]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white/60 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-6 lg:px-12">
          <Logo />
          <nav className="hidden items-center gap-6 text-[15px] font-medium lg:flex">
            {navLinks.map((link) => (
              <Link key={link.label} href={link.href} className="hover:opacity-70">
                {link.label}
              </Link>
            ))}
          </nav>
          <HeaderAuth />
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 pt-10 pb-24 lg:min-h-[820px] lg:grid-cols-[1fr_700px] lg:px-0 lg:pt-0 lg:pb-0 lg:pl-[105px]">
        <div className="lg:-mt-[150px]">
          <div className="hidden items-center gap-2.5 rounded-full sm:inline-flex border border-[#e3e3e3] bg-white py-1 pr-3 pl-2">
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
              Seu contato inteligente de treino <StarIcon className="-mt-1 inline size-4" />
            </span>
          </div>
          <h1 className="text-[44px] leading-[52px] font-medium sm:mt-6 sm:text-[48px] sm:leading-[64px] tracking-[-0.01em]">
            <span className="font-bold">O contato inteligente</span>
            <br />
            que organiza
            <br />
            os seus treinos
          </h1>
          <p className="mt-6 max-w-[520px] text-[16px] leading-6 text-[#5b5b66]">
            Mande suas séries em texto livre. O Iron AI registra, calcula a meta da próxima série e
            mostra sua evolução em gráficos.
          </p>
          <CtaBadges className="mt-6" />
        </div>

        <div className="relative -mx-4 -mb-12 aspect-[1/1.12] overflow-x-clip lg:hidden">
          <Image
            src="/assets/image-01.png"
            alt="Conversa com o Iron AI registrando uma série de supino"
            width={703}
            height={1440}
            priority
            sizes="46vw"
            className="absolute top-8 left-[5%] w-[46%] -rotate-[3deg] drop-shadow-[0_20px_30px_rgba(0,0,0,0.18)]"
          />
          <svg
            viewBox="0 0 120 80"
            className="absolute top-[150px] left-[40%] w-[52px]"
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
            width={703}
            height={1440}
            priority
            sizes="48vw"
            className="absolute top-2 right-[5%] w-[48%] rotate-[4deg] drop-shadow-[0_20px_30px_rgba(0,0,0,0.18)]"
          />
          <Chip title="Supino reto" value="25kg" className="top-0 right-[26%]" />
          <Chip title="Meta" value="11 reps" className="top-[70px] left-[38%]" />
          <Chip title="Séries" value="3" className="top-[40px] right-[3%]" />
        </div>

        <div className="relative hidden h-[640px] lg:block">
          <Image
            src="/assets/image-01.png"
            alt="Conversa com o Iron AI registrando uma série de supino"
            width={703}
            height={1440}
            priority
            sizes="285px"
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
            width={703}
            height={1440}
            priority
            sizes="290px"
            className="absolute -top-[50px] left-[385px] w-[290px] rotate-[4deg] drop-shadow-[0_20px_30px_rgba(0,0,0,0.18)]"
          />
          <Chip title="Supino reto" value="25kg" className="-top-[20px] left-[425px]" />
          <Chip title="Meta" value="11 reps" className="top-[100px] left-[365px]" />
          <Chip title="Séries" value="3" className="top-[60px] left-[600px]" />
        </div>
      </section>

      {/* Chat cards */}
      <section id="como-funciona" className="mx-auto max-w-[1440px] scroll-mt-20 px-6 pt-10 lg:px-[96px]">
        <h2 className="text-center text-[32px] leading-tight sm:text-[44px] font-medium tracking-[-0.01em] lg:text-[48px]">
          Um contato inteligente, do jeito que você já fala 👀
        </h2>
        <div className="mt-[90px] grid gap-x-[22px] gap-y-[15px] md:grid-cols-3">
          {[0, 1, 2].map((col) => (
            <div key={col} className={`flex flex-col gap-[15px] ${col === 1 ? "" : "md:mt-[80px]"}`}>
              {/* Heights and stagger follow design/landing-page-example.png (1440px wide). */}
              {[chatCards[col], chatCards[col + 3]].map((card) => (
                <article
                  key={card.title}
                  style={{ backgroundImage: `linear-gradient(180deg, rgba(30,26,36,0.05) 30%, rgba(30,26,36,0.55) 100%), url(${card.photo})` }}
                  className={`flex flex-col justify-end overflow-hidden rounded-[24px] bg-[#2d2935] bg-cover bg-bottom p-4 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] ${card.height}`}
                >
                  <div className="rounded-[16px] border border-white/20 bg-white/10 px-6 pt-4 pb-5 backdrop-blur-xl backdrop-saturate-150">
                    <span className="block text-[30px] leading-6 font-black text-[#60a5fa]">&ldquo;</span>
                    <h3 className="mt-1 text-[20px] leading-6 font-bold">{card.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-5 font-medium text-white/85">{card.text}</p>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* What it includes */}
      <section id="recursos" className="scroll-mt-20 pt-[240px]">
        <h2 className="mb-[58px] text-center text-[32px] leading-tight sm:text-[44px] font-medium tracking-[-0.01em] lg:text-[48px]">
          O que o Iron AI inclui?
        </h2>
        <FeatureShowcase />
      </section>

      {/* Why choose */}
      <section id="vantagens" className="mx-auto max-w-[1440px] scroll-mt-20 px-6 pt-[240px]">
        <h2 className="text-center text-[32px] leading-tight sm:text-[44px] font-semibold tracking-[-0.01em] lg:text-[48px]">
          Por que ter um contato inteligente no treino?
        </h2>
        <p className="mt-2 text-center text-[18px] text-[#333]">Registre pelo chat e saiba exatamente quando subir a carga.</p>
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
      <section id="progressao" className="mx-auto grid max-w-[1440px] scroll-mt-20 items-center gap-10 px-6 pt-[235px] pb-[260px] lg:grid-cols-[1fr_480px] lg:pl-[145px] lg:pr-[110px]">
        <div>
          <p className="text-[14px] font-medium tracking-[0.08em] text-[#f43f5e] uppercase">Novo recurso</p>
          <h2 className="mt-6 text-[34px] leading-[44px] font-semibold sm:text-[48px] sm:leading-[60px] tracking-[-0.01em] text-[#1f2433]">
            Progressão automática,
            <br /> 
            sem planilha! 📈💪
          </h2>
          <p className="mt-8 text-[18px] text-[#475569]">Você só treina, a conta é com a gente :)</p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <Image
            src="/assets/image-04.png"
            alt="Resumo de progressão no supino reto enviado pelo Iron AI"
            width={703}
            height={1440}
            className="w-[355px] -rotate-[4deg] drop-shadow-[0_25px_35px_rgba(0,0,0,0.2)]"
          />
        </div>
      </section>

      {/* Conversations (dark) */}
      <section id="conversas" className="scroll-mt-20 bg-[#1e1a24] px-6 pt-[157px] pb-[169px]">
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

      {/* Pricing */}
      <Pricing />

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-[linear-gradient(180deg,#f4f9f9,#f9fcf5)] px-6 pt-[134px] pb-8">
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
              Registre seu próximo treino com uma mensagem
            </h2>
            <div className="mt-6 flex items-center gap-4 text-[18px] text-[#3f3f46]">
              <span className="flex items-center gap-2">
                <TelegramIcon className="size-6 text-[#3b3842]" /> Conversa no chat
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
            <p className="mt-6 text-[14px] text-[#3f3f46]">Treine com o Iron AI a partir de R$ 14,90 por mês</p>
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
