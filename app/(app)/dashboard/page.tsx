import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ChartUpIcon, DumbbellIcon, TelegramColorIcon } from "@/components/landing/icons";

export const metadata: Metadata = { title: "Painel — Iron AI" };

const nextSteps = [
  {
    icon: <TelegramColorIcon className="size-8" />,
    title: "Conecte o Telegram",
    text: "Vincule sua conta ao bot para registrar séries por mensagem.",
  },
  {
    icon: <DumbbellIcon className="size-8" />,
    title: "Monte sua rotina",
    text: "Defina os treinos A, B e C com exercícios e séries planejadas.",
  },
  {
    icon: <ChartUpIcon className="size-7" />,
    title: "Acompanhe a evolução",
    text: "Gráficos de carga, 1RM estimado e volume aparecem aqui conforme você treina.",
  },
];

export default async function DashboardPage() {
  await auth.protect();
  const user = await currentUser();

  return (
    <>
      <p className="text-[14px] font-medium tracking-[0.08em] text-[#f43f5e] uppercase">Painel</p>
      <h1 className="mt-3 text-[36px] leading-[46px] font-semibold tracking-[-0.01em] sm:text-[44px]">
        Olá{user?.firstName ? `, ${user.firstName}` : ""} 👋
      </h1>
      <p className="mt-3 max-w-[560px] text-[18px] text-[#5b5b66]">Sua conta está pronta. Veja os próximos passos para começar.</p>

      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {nextSteps.map((step) => (
          <article key={step.title} className="rounded-[28px] bg-white px-8 pt-8 pb-10 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <div className="flex size-16 items-center justify-center rounded-xl bg-[#f5f5f8]">{step.icon}</div>
            <h2 className="mt-6 text-[20px] font-bold">{step.title}</h2>
            <p className="mt-4 text-[14px] leading-5 text-[#3f3f46]">{step.text}</p>
          </article>
        ))}
      </div>
    </>
  );
}
