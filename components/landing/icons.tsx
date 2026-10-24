import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function TelegramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M21.94 4.3a1.2 1.2 0 0 0-1.62-1.3L2.9 9.7c-1.2.47-1.18 1.15-.21 1.45l4.47 1.4 1.72 5.3c.21.58.1.81.71.81.47 0 .68-.21.94-.47l2.25-2.19 4.68 3.46c.86.47 1.48.23 1.7-.8l2.78-14.36ZM8.2 12.3l9.65-6.1c.48-.29.92-.13.56.19l-8.06 7.27-.31 3.33L8.2 12.3Z" />
    </svg>
  );
}

export function TelegramColorIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="12" fill="#2AABEE" />
      <path
        fill="#fff"
        d="M5.43 11.87c3.5-1.52 5.83-2.53 7-3.02 3.33-1.39 4.02-1.63 4.47-1.64.1 0 .32.02.47.14.12.1.15.23.17.33.02.09.04.3.02.47-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.23-.46-1.9-.9-1.06-.7-1.66-1.13-2.69-1.81-1.19-.78-.42-1.21.26-1.92.18-.18 3.25-2.98 3.31-3.23 0-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.1.02-1.79 1.14-5.06 3.35-.48.33-.92.49-1.3.48-.43-.01-1.26-.24-1.87-.44-.75-.25-1.35-.38-1.3-.8.03-.22.33-.44.9-.67Z"
      />
    </svg>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.45 6.2 20.5l1.1-6.47L2.6 9.45l6.5-.95L12 2.6Z"
        fill="#FBC531"
        stroke="#1E1A24"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function TimerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M12 3a9 9 0 1 1-8.5 6" stroke="#1E1A24" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx="12" cy="12" r="4.5" stroke="#1E1A24" strokeWidth={2.2} />
      <circle cx="12" cy="12" r="1.6" fill="#1E1A24" />
    </svg>
  );
}

export function ChartUpIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

export function DumbbellIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#1E1A24" strokeWidth={2.4} strokeLinecap="round" aria-hidden {...props}>
      <path d="M7 7v10M4 9.5v5M17 7v10M20 9.5v5M7 12h10" />
    </svg>
  );
}

export function LaurelIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 128" fill="#3B3842" aria-hidden {...props}>
      <path d="M30 126C14 104 10 76 20 44 26 26 34 12 44 2" fill="none" stroke="#3B3842" strokeWidth={3} strokeLinecap="round" />
      <path d="M42 4c-8 2-12 8-12 15 7-2 11-8 12-15Z" />
      <path d="M34 22c-8 0-13 5-15 12 8 0 13-5 15-12Z" />
      <path d="M36 22c1 8 6 12 12 13-1-8-6-12-12-13Z" />
      <path d="M26 44c-8-2-14 2-17 9 8 2 14-2 17-9Z" />
      <path d="M28 44c-1 8 3 13 10 16 1-8-3-13-10-16Z" />
      <path d="M20 66c-7-4-14-1-18 5 7 4 14 1 18-5Z" />
      <path d="M22 66c-2 8 1 14 8 17 2-8-1-14-8-17Z" />
      <path d="M18 88c-7-4-14-2-18 4 7 4 14 2 18-4Z" />
      <path d="M20 88c-1 8 2 14 9 17 1-8-2-14-9-17Z" />
      <path d="M22 108c-6-5-14-4-18 2 6 5 14 4 18-2Z" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden {...props}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GithubIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 1.8a10.2 10.2 0 0 0-3.22 19.88c.51.09.7-.22.7-.49v-1.72c-2.84.62-3.44-1.37-3.44-1.37-.46-1.18-1.13-1.5-1.13-1.5-.93-.63.07-.62.07-.62 1.02.07 1.56 1.05 1.56 1.05.91 1.56 2.39 1.11 2.97.85.09-.66.36-1.11.65-1.37-2.27-.26-4.65-1.13-4.65-5.04 0-1.11.4-2.02 1.05-2.74-.1-.26-.46-1.3.1-2.7 0 0 .86-.28 2.8 1.04a9.7 9.7 0 0 1 5.1 0c1.95-1.32 2.8-1.04 2.8-1.04.56 1.4.2 2.44.1 2.7.66.72 1.05 1.63 1.05 2.74 0 3.92-2.39 4.78-4.66 5.03.37.32.7.94.7 1.9v2.82c0 .27.18.59.7.49A10.2 10.2 0 0 0 12 1.8Z" />
    </svg>
  );
}
