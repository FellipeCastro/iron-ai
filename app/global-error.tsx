"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import "./globals.css";

// Root error boundary: replaces the root layout, so it renders its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-[linear-gradient(180deg,#ffffff_0px,#fffff6_600px,#f7fbf7_1400px)] font-sans text-[#111]">
        <main className="mx-auto flex w-full max-w-[560px] flex-1 items-center px-4 py-24">
          <div className="w-full rounded-[28px] bg-white p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-10">
            <p className="text-xs font-semibold tracking-[0.14em] text-[#f43f5e] uppercase">Erro inesperado</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Algo deu errado por aqui</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#5b5b66]">
              Já fomos avisados e vamos investigar. Tente novamente em instantes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-11 items-center justify-center rounded-full bg-black px-6 text-[15px] font-semibold text-white transition-opacity hover:opacity-85"
              >
                Tentar novamente
              </button>
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center rounded-full border border-[#e5e7eb] bg-white px-6 text-[15px] font-medium transition-colors hover:bg-[#f3f4f6]"
              >
                Voltar ao início
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
