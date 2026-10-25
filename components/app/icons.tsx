import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Stroke({ d, ...props }: IconProps & { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d={d} />
    </svg>
  );
}

export const PlusIcon = (props: IconProps) => <Stroke d="M12 5v14M5 12h14" {...props} />;
export const MinusIcon = (props: IconProps) => <Stroke d="M5 12h14" {...props} />;
export const ChevronUpIcon = (props: IconProps) => <Stroke d="m6 15 6-6 6 6" {...props} />;
export const ChevronLeftIcon = (props: IconProps) => <Stroke d="m15 6-6 6 6 6" {...props} />;
export const CheckIcon = (props: IconProps) => <Stroke d="m5 12 5 5L20 7" {...props} />;
export const SearchIcon = (props: IconProps) => <Stroke d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4" {...props} />;
export const TrashIcon = (props: IconProps) => <Stroke d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" {...props} />;
export const CopyIcon = (props: IconProps) => <Stroke d="M9 9h11v11H9zM5 15H4V4h11v1" {...props} />;
