import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

Sentry.init({
  ...sentryOptions,
  integrations: [
    // No floating widget: the form opens from our own button (components/app/feedback-button.tsx).
    // Name and email are not asked; the user may still attach a screenshot on purpose.
    Sentry.feedbackIntegration({
      autoInject: false,
      colorScheme: "light",
      showName: false,
      showEmail: false,
      showBranding: false,
      formTitle: "Enviar feedback",
      messageLabel: "Mensagem",
      messagePlaceholder: "Conte o que achou, o que deu errado ou o que poderia melhorar.",
      submitButtonLabel: "Enviar",
      cancelButtonLabel: "Cancelar",
      confirmButtonLabel: "Confirmar",
      addScreenshotButtonLabel: "Adicionar captura de tela",
      removeScreenshotButtonLabel: "Remover captura de tela",
      isRequiredLabel: "(obrigatório)",
      successMessageText: "Obrigado pelo feedback!",
      highlightToolText: "Destacar",
      hideToolText: "Ocultar",
      removeHighlightText: "Remover",
      themeLight: {
        foreground: "#111111",
        background: "#ffffff",
        accentForeground: "#ffffff",
        accentBackground: "#000000",
        successColor: "#16a34a",
        errorColor: "#e11d48",
        boxShadow: "0px 8px 30px rgba(0, 0, 0, 0.08)",
        outline: "1px auto #111111",
      },
    }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
