import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

// Visual identity of the landing page applied to every Clerk component.
// Tailwind classes win over Clerk's styles because of the `clerk` layer declared in globals.css.
export const clerkAppearance: Appearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#111111",
    colorPrimaryForeground: "#ffffff",
    colorForeground: "#111111",
    colorMutedForeground: "#5b5b66",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#111111",
    colorBorder: "#e5e7eb",
    colorNeutral: "#1e1a24",
    colorDanger: "#f43f5e",
    fontFamily: "var(--font-bricolage), system-ui, sans-serif",
    borderRadius: "14px",
  },
  options: {
    socialButtonsVariant: "blockButton",
  },
  // Shared by every component (sign-in/up, user button popover, account modal).
  elements: {
    socialButtonsBlockButton: "h-11 rounded-full border-[#e5e7eb] text-[15px] font-medium hover:bg-[#f3f4f6]",
    dividerLine: "bg-[#ececec]",
    formFieldLabel: "text-[14px] font-medium text-[#111]",
    formFieldInput: "h-11 rounded-[12px] border-[#e5e7eb] px-4 text-[16px] sm:text-[15px] focus:border-[#111]",
    formButtonPrimary:
      "h-11 rounded-full bg-black text-[15px] font-semibold normal-case shadow-none transition-opacity hover:bg-black hover:opacity-85",
    footerActionLink: "font-semibold text-[#111] underline-offset-4 hover:text-[#111] hover:underline",
    userButtonAvatarBox: "size-9",
  },
  // The narrow centered card only suits the auth flows. The account modal (<UserProfile />) is a two-column
  // layout and must keep Clerk's own width, otherwise its content is squeezed and clipped.
  signIn: { elements: authCard() },
  signUp: { elements: authCard() },
};

function authCard() {
  return {
    rootBox: "w-full max-w-[560px]",
    cardBox: "w-full max-w-[560px] rounded-[28px] border border-[#ececec] shadow-[0_8px_30px_rgba(0,0,0,0.06)]",
    card: "px-10 py-11 shadow-none",
    headerTitle: "text-[26px] font-semibold tracking-[-0.01em] text-[#111]",
    headerSubtitle: "text-[15px] text-[#5b5b66]",
    footer: "bg-[#fafaf7]",
  };
}
