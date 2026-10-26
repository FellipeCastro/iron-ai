import { ImageResponse } from "next/og";

export const alt = "Iron AI — o contato inteligente que organiza seus treinos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          color: "white",
          background: "linear-gradient(135deg, #0a0a0a 0%, #0b1626 45%, #1e3a8a 100%)",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: "#3b82f6" }}>Iron AI</div>
        <div style={{ marginTop: 24, fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
          O contato inteligente que organiza os seus treinos
        </div>
        <div style={{ marginTop: 32, fontSize: 32, color: "#d4d4d8" }}>
          Registre séries por mensagem · metas automáticas · gráficos de evolução
        </div>
      </div>
    ),
    size,
  );
}
