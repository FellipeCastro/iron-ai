"use client";

import Image from "next/image";
import { useRef, useState } from "react";

const features = [
  {
    title: "Registre séries só mandando mensagem",
    description:
      "Escreva “supino reto 10 reps com 10kg” e o Iron AI entende exercício, carga e repetições. Errou? Mande a correção e tudo é recalculado.",
    image: "/assets/image-01.png",
  },
  {
    title: "Seu treino do dia, no horário certo",
    description:
      "Lembretes no seu fuso e nos seus dias de treino, com o plano do dia já montado: exercícios, séries, faixa de reps e a carga de hoje.",
    image: "/assets/image-02.png",
  },
  {
    title: "Resumo ao fim do treino e relatórios sob demanda",
    description:
      "Ao terminar, você recebe o resumo da sessão. Quando quiser, peça um relatório por exercício ou grupo muscular.",
    image: "/assets/image-03.png",
  },
  {
    title: "Gráficos de evolução e recordes",
    description:
      "Acompanhe carga, 1RM estimado e calorias gastas em cada exercício. Seus PRs ficam registrados no chat e no painel web.",
    image: "/assets/image-04.png",
  },
];

export function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  function goTo(i: number) {
    setActive(i);
    const el = scrollerRef.current;
    if (el && el.offsetParent !== null) {
      el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    }
  }

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  }

  return (
    <div className="mx-auto grid max-w-[1200px] items-start gap-12 px-6 lg:grid-cols-[1fr_572px] lg:gap-[100px]">
      <div className="flex flex-col items-center lg:pl-[60px]">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
        >
          {features.map((feature, i) => (
            <div key={feature.image} className="flex w-full shrink-0 snap-center justify-center">
              <div className="relative aspect-[703/1440] w-full max-w-[360px]">
              <Image
                src={feature.image}
                alt=""
                fill
                sizes="360px"
                className="object-contain"
                priority={i === 0}
              />
              </div>
            </div>
          ))}
        </div>
        <div className="relative hidden h-[738px] w-[360px] lg:block">
          {features.map((feature, i) => (
            <Image
              key={feature.image}
              src={feature.image}
              alt=""
              fill
              sizes="360px"
              className={`object-contain transition-opacity duration-500 ${i === active ? "opacity-100" : "opacity-0"}`}
              priority={i === 0}
            />
          ))}
        </div>
        <div className="mt-5 flex gap-2.5">
          {features.map((feature, i) => (
            <button
              key={feature.title}
              type="button"
              aria-label={feature.title}
              onClick={() => goTo(i)}
              className={`size-3 rounded-full transition-colors ${i === active ? "bg-[#1e2033]" : "bg-[#d4d6dd]"}`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6 pt-0 lg:pt-0">
        {features.map((feature, i) => {
          const isActive = i === active;
          return (
            <button
              key={feature.title}
              type="button"
              onClick={() => goTo(i)}
              className={`rounded-2xl border text-left transition-all ${
                isActive
                  ? "mx-[14px] border-[#e5e7eb] bg-white px-6 py-[30px] lg:mx-0 lg:border-[#1e1a24] lg:bg-[#f3f4f6] lg:px-[26px]"
                  : "mx-[14px] border-[#e5e7eb] bg-white px-6 py-[30px] hover:border-[#c8cad0]"
              }`}
            >
              <h3 className="text-[20px] font-semibold text-[#111]">{feature.title}</h3>
              <p className="mt-3 text-[16px] leading-[25px] text-[#5b5b66]">{feature.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
