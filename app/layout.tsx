import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import { DASHBOARD_URL, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/routes";
import { clerkAppearance } from "@/lib/clerk-appearance";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Iron AI — seu treino registrado pelo Telegram",
  description:
    "Registre suas séries por mensagem no Telegram, receba metas automáticas de 8 a 12 reps, lembretes, resumos e gráficos de evolução.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${bricolage.variable} ${bricolage.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          localization={ptBR}
          appearance={clerkAppearance}
          signInUrl={SIGN_IN_URL}
          signUpUrl={SIGN_UP_URL}
          signInFallbackRedirectUrl={DASHBOARD_URL}
          signUpFallbackRedirectUrl={DASHBOARD_URL}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
