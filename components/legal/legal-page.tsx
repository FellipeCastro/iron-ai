import Link from "next/link";

// Building blocks for the legal pages (/termos, /privacidade), following the landing's visual language.

export type LegalSection = { id: string; title: string; content: React.ReactNode };

export function LegalPage({
  eyebrow,
  title,
  updatedAt,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  updatedAt: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-4 pt-10 pb-24 sm:px-6 sm:pt-14 lg:grid-cols-[240px_1fr]">
      <div className="lg:col-span-2">
        <p className="text-[14px] font-medium tracking-[0.08em] text-[#f43f5e] uppercase">{eyebrow}</p>
        <h1 className="mt-3 text-[34px] leading-[44px] font-semibold tracking-[-0.01em] sm:text-[48px] sm:leading-[60px]">{title}</h1>
        <p className="mt-3 text-[15px] text-[#5b5b66]">Última atualização: {updatedAt}</p>
      </div>

      {/* Table of contents */}
      <nav aria-label="Nesta página" className="hidden lg:block">
        <div className="sticky top-8 rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] font-semibold tracking-[0.06em] text-[#8a8a94] uppercase">Nesta página</p>
          <ol className="mt-4 flex flex-col gap-2.5">
            {sections.map((s, i) => (
              <li key={s.id}>
                <Link href={`#${s.id}`} className="flex gap-2 text-[14px] leading-5 text-[#3f3f46] hover:text-black">
                  <span className="text-[#a1a1aa] tabular-nums">{i + 1}.</span>
                  {s.title}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <article className="min-w-0 rounded-[28px] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-10">
        <div className="text-[16px] leading-7 text-[#3f3f46]">{intro}</div>
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="mt-10 scroll-mt-8 border-t border-[#f1f1f4] pt-8">
            <h2 className="text-[22px] leading-8 font-bold text-[#111]">
              {i + 1}. {s.title}
            </h2>
            <div className="mt-4 flex flex-col gap-4 text-[16px] leading-7 text-[#3f3f46]">{s.content}</div>
          </section>
        ))}
      </article>
    </div>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-[#a1a1aa]">{children}</ul>;
}

export function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[#111]">{children}</strong>;
}

/** Highlights text still to be confirmed before publication. */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-[#fff7e0] px-1.5 py-0.5 font-medium text-[#92400e]">[{children}]</span>;
}

export function Callout({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[20px] bg-[#f9f9fb] px-5 py-4 text-[15px] leading-6 text-[#3f3f46]">{children}</div>;
}

export function DataTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-[#f1f1f4]">
      <table className="w-full min-w-[560px] text-left text-[14px] leading-6">
        <thead className="bg-[#f9f9fb] text-[#111]">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[#f1f1f4] align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
