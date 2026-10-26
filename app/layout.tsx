import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import { DASHBOARD_URL, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/routes";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { siteUrl } from "@/lib/env";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const description =
  "Um contato inteligente que organiza os seus treinos: registre séries por mensagem, receba metas automáticas de 8 a 12 reps, lembretes, resumos e gráficos de evolução. 100% grátis.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Iron AI — o contato inteligente que organiza seus treinos",
    template: "%s | Iron AI",
  },
  description,
  applicationName: "Iron AI",
  keywords: [
    "app de treino",
    "registrar treino",
    "diário de treino",
    "progressão de carga",
    "treino de musculação",
    "assistente de treino com IA",
    "bot de treino Telegram",
    "gráfico de evolução na academia",
  ],
  authors: [{ name: "Iron AI" }],
  creator: "Iron AI",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Iron AI",
    url: "/",
    title: "Iron AI — o contato inteligente que organiza seus treinos",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Iron AI — o contato inteligente que organiza seus treinos",
    description,
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
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
