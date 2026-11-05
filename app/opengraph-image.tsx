import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Iron AI — o contato inteligente que organiza seus treinos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The stacked logo is 472x541; scaled to a fixed height, keeping its aspect ratio.
const LOGO_HEIGHT = 380;
const LOGO_WIDTH = Math.round((472 / 541) * LOGO_HEIGHT);

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public", "assets", "logo-white.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          background: "linear-gradient(135deg, #0a0a0a 0%, #0b1626 45%, #1e3a8a 100%)",
        }}
      >
        <img src={logoSrc} width={LOGO_WIDTH} height={LOGO_HEIGHT} alt="" />
        <div style={{ marginTop: 36, fontSize: 32, color: "#d4d4d8" }}>
          O contato inteligente que organiza os seus treinos
        </div>
      </div>
    ),
    size,
  );
}
