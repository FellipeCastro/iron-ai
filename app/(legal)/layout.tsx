import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ArrowRightIcon } from "@/components/landing/icons";
import { PRIVACY_URL, TERMS_URL } from "@/lib/routes";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[linear-gradient(180deg,#ffffff_0px,#fffff6_600px,#f7fbf7_1600px,#f1f8fd_3000px)] text-[#111]">
      <header className="mx-auto flex h-20 w-full max-w-[1180px] items-center justify-between px-4 sm:px-6">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-2 text-[15px] font-medium hover:opacity-70">
          Voltar ao site <ArrowRightIcon className="size-4" />
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-[#fefff0]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 border-t border-[#e6e6dc] px-4 py-4 sm:px-6">
          <p className="text-[14px] text-[#3f3f46]">© Copyright 2026, Iron AI. Todos os direitos reservados</p>
          <nav className="flex items-center gap-5 text-[14px] text-[#3f3f46]">
            <Link href={TERMS_URL} className="hover:text-black">
              Termos de serviço
            </Link>
            <Link href={PRIVACY_URL} className="hover:text-black">
              Política de privacidade
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
