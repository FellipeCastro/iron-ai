import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import { DASHBOARD_URL, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/routes";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { siteUrl } from "@/lib/env";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const description =
  "Registre séries por mensagem, receba metas automáticas de 6 a 12 reps, lembretes, resumos e gráficos de evolução. O contato inteligente que organiza seus treinos.";

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
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Iron AI",
    title: "Iron AI — o contato inteligente que organiza seus treinos",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Iron AI — o contato inteligente que organiza seus treinos",
    description,
  },
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

/**
 * Root layout shared by every route: sets the pt-BR document shell, loads the brand font,
 * injects Google Analytics (when `GOOGLE_ANALYTICS_ID` is set) and wraps the app in Clerk.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  const gaId = process.env.GOOGLE_ANALYTICS_ID;
  return (
    <html lang="pt-BR" className={`${bricolage.variable} ${bricolage.className} h-full antialiased`}>
      {/* Browser extensions (ColorZilla's cz-shortcut-listen, Grammarly, ...) add attributes to <body> before React
          hydrates. This only silences attribute mismatches on this one element, not in its children. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {gaId && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
            </Script>
          </>
        )}
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
        <Analytics />
      </body>
    </html>
  );
}
