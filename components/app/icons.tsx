import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Stroke({ d, ...props }: IconProps & { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d={d} />
    </svg>
  );
}

export const GripIcon = (props: IconProps) => <Stroke d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" strokeWidth={3.2} {...props} />;
export const HomeIcon = (props: IconProps) => <Stroke d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-6h4v6" {...props} />;
export const ListIcon = (props: IconProps) => <Stroke d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" {...props} />;
export const CalendarIcon = (props: IconProps) => <Stroke d="M5 6h14v14H5zM5 10h14M9 3v4M15 3v4" {...props} />;
export const TrendIcon = (props: IconProps) => <Stroke d="m4 17 5-5 4 4 7-8M15 8h5v5" {...props} />;
export const SlidersIcon = (props: IconProps) => <Stroke d="M5 6h8M17 6h2M5 12h2M11 12h8M5 18h10M19 18h0M13 4v4M9 10v4M17 16v4" {...props} />;
export const PlusIcon = (props: IconProps) => <Stroke d="M12 5v14M5 12h14" {...props} />;
export const MinusIcon = (props: IconProps) => <Stroke d="M5 12h14" {...props} />;
export const ChevronUpIcon = (props: IconProps) => <Stroke d="m6 15 6-6 6 6" {...props} />;
export const ChevronLeftIcon = (props: IconProps) => <Stroke d="m15 6-6 6 6 6" {...props} />;
export const CheckIcon = (props: IconProps) => <Stroke d="m5 12 5 5L20 7" {...props} />;
export const SearchIcon = (props: IconProps) => <Stroke d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4" {...props} />;
export const TrashIcon = (props: IconProps) => <Stroke d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" {...props} />;
export const CopyIcon = (props: IconProps) => <Stroke d="M9 9h11v11H9zM5 15H4V4h11v1" {...props} />;
