export function Chip({ title, value, className }: { title: string; value: string; className: string }) {
  return (
    <div
      className={`absolute z-10 rounded-[14px] bg-white px-3 py-2 text-center text-[12px] leading-[15px] font-semibold text-[#111] shadow-[0_6px_20px_rgba(0,0,0,0.12)] ${className}`}
    >
      {title}
      <br />
      {value}
    </div>
  );
}
