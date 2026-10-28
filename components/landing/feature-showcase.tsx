"use client";

import Image from "next/image";
import { useState } from "react";

const features = [
  {
    title: "Registre séries só mandando mensagem",
    description:
      "Escreva “supino reto 1 série 10kg” no Telegram e o Iron AI entende exercício, carga e repetições. Errou? Mande a correção e tudo é recalculado.",
    image: "/assets/image-01.png",
  },
  {
    title: "Seu treino do dia, no horário certo",
    description:
      "Lembretes no seu fuso e nos seus dias de treino, com o plano do dia já montado: exercícios, séries, faixa de reps e a carga de hoje.",
    image: "/assets/image-02.png",
  },
  {
    title: "Gráficos de evolução e recordes",
    description:
      "Acompanhe carga, 1RM estimado e calorias gastas em cada exercício. Seus PRs ficam registrados no chat e no painel web.",
    image: "/assets/image-03.png",
  },
  {
    title: "Resumos e relatórios inteligentes",
    description:
      "Ao terminar o treino você recebe um resumo da sessão. Peça relatórios por exercício ou grupo muscular quando quiser.",
    image: "/assets/image-04.png",
  },
];

export function FeatureShowcase() {
  const [active, setActive] = useState(0);

  return (
    <div className="mx-auto grid max-w-[1200px] items-start gap-12 px-6 lg:grid-cols-[1fr_572px] lg:gap-[100px]">
      <div className="flex flex-col items-center lg:pl-[60px]">
        <div className="relative h-[738px] w-[360px]">
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
              onClick={() => setActive(i)}
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
              onClick={() => setActive(i)}
              className={`rounded-2xl border text-left transition-all ${
                isActive
                  ? "border-[#1e1a24] bg-[#f3f4f6] px-[26px] py-[30px]"
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
