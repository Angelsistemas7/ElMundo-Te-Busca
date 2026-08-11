import type { CountryCode } from "@/lib/countries";

// SVG propio en vez del emoji de bandera (🇻🇪/🇨🇴): Windows no tiene esos
// glifos en Segoe UI Emoji y cae al texto plano "VE"/"CO" en vez de dibujar
// la bandera — problema conocido de esa fuente, no de nuestro código. Un SVG
// se ve igual en cualquier sistema operativo/navegador.
export function FlagIcon({ code, className }: { code: CountryCode; className?: string }) {
  if (code === "co") {
    return (
      <svg viewBox="0 0 900 600" className={className} aria-hidden="true">
        <rect width="900" height="300" fill="#FCD116" />
        <rect y="300" width="900" height="150" fill="#003893" />
        <rect y="450" width="900" height="150" fill="#CE1126" />
      </svg>
    );
  }
  // Venezuela: 8 estrellas blancas en arco sobre la franja azul, simplificadas
  // a círculos (legible en tamaños chicos de UI, no busca ser heráldicamente exacta).
  const stars = Array.from({ length: 8 }, (_, i) => {
    const t = i / 7; // 0..1
    const angle = -0.55 + t * 1.1; // arco de ~63° centrado
    const cx = 450 + Math.sin(angle) * 240;
    const cy = 300 - Math.cos(angle) * 95;
    return <circle key={i} cx={cx} cy={cy} r="13" fill="#fff" />;
  });
  return (
    <svg viewBox="0 0 900 600" className={className} aria-hidden="true">
      <rect width="900" height="200" fill="#FCD116" />
      <rect y="200" width="900" height="200" fill="#003893" />
      <rect y="400" width="900" height="200" fill="#CF142B" />
      {stars}
    </svg>
  );
}
