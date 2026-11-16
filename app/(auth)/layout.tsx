import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Chip } from "@/components/brand/chip";
import { Logo } from "@/components/brand/logo";
import { ArrowRightIcon, StarIcon } from "@/components/landing/icons";

const highlights = ["Registro por texto livre", "Metas automáticas de 6 a 12 reps", "Gráficos de evolução e PRs"];

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh flex-1 text-[#111] lg:grid-cols-[1fr_minmax(0,620px)]">
      {/* Form */}
      <div className="flex flex-col bg-[linear-gradient(180deg,#ffffff_0%,#fffff6_60%,#f7fbf7_100%)]">
        <header className="flex h-20 items-center justify-between px-6 lg:px-12">
          <Logo />
          <Link href="/" className="inline-flex items-center gap-2 text-[15px] font-medium hover:opacity-70">
            Voltar ao site <ArrowRightIcon className="size-4" />
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-16">{children}</main>
      </div>

      {/* Showcase */}
      <aside className="relative hidden overflow-hidden bg-[#1e1a24] px-14 pt-20 text-white lg:flex lg:flex-col">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[14px] font-medium">
          <StarIcon className="size-4" /> Direto no Telegram
        </div>
        <h2 className="mt-6 text-[40px] leading-[50px] font-semibold tracking-[-0.01em]">
          Seu próximo PR
          <br />
          começa aqui 💪
        </h2>
        <ul className="mt-6 flex flex-col gap-3 text-[16px] text-[#d4d4d8]">
          {highlights.map((item) => (
            <li key={item} className="flex items-center gap-3">
              <span className="size-1.5 rounded-full bg-[#2AABEE]" />
              {item}
            </li>
          ))}
        </ul>

        <div className="relative mt-auto h-[440px]">
          <Image
            src="/assets/image-01.png"
            alt="Conversa com o Iron AI registrando uma série"
            width={703}
            height={1440}
            className="absolute top-10 left-0 w-[240px] -rotate-[4deg] drop-shadow-[0_20px_30px_rgba(0,0,0,0.4)]"
          />
          <Image
            src="/assets/image-03.png"
            alt="Gráfico de evolução enviado pelo Iron AI"
            width={703}
            height={1440}
            className="absolute top-0 left-[230px] w-[250px] rotate-[4deg] drop-shadow-[0_20px_30px_rgba(0,0,0,0.4)]"
          />
          <Chip title="Supino reto" value="25kg" className="top-[20px] left-[190px]" />
          <Chip title="Meta" value="11 reps" className="top-[150px] left-[400px]" />
        </div>
      </aside>
    </div>
  );
}
