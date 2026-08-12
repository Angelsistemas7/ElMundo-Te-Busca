#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Importador de puntos de ayuda para "El Mundo Te Busca".
//
// Carga masiva de puntos de ayuda/acopio desde un archivo JSON a Supabase.
// Igual que scripts/import-data.mjs pero para la tabla `aid_points`: pensado
// para listas curadas a mano por el dueño (capturas de cuentas oficiales en
// redes, comunicados de alcaldías/gobernaciones, etc.), NO para scraping
// automático — cada corrida es una decisión humana de qué incluir.
//
// Uso:
//   node scripts/import-aid-points.mjs ./puntos.json
//   node scripts/import-aid-points.mjs ./puntos.json --verified=false
//
// Formato JSON esperado: un array de objetos. Campos reconocidos:
//   name (obligatorio), types (array; default ["otro"]), estado,
//   locationText, scheduleText, description, contactName, contactPhone,
//   country ("ve"|"co", default "co"), verified (default true — ver flag)
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* sin .env.local: se usan variables de entorno del sistema */
  }
}
loadEnv();

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_SB || !SERVICE_KEY) {
  console.error(
    "❌ Falta configuración. Define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/import-aid-points.mjs <archivo.json> [--verified=false]");
  process.exit(1);
}
const verifiedFlag = process.argv.find((a) => a.startsWith("--verified="));
const defaultVerified = verifiedFlag ? verifiedFlag.split("=")[1] !== "false" : true;

const sb = createClient(URL_SB, SERVICE_KEY, { auth: { persistSession: false } });

const VALID_TYPES = new Set(["comida", "agua", "medicina", "refugio", "alojamiento", "ropa", "otro"]);

function normalize(o) {
  const name = o.name ?? o.nombre;
  if (!name) return null;
  const types = Array.isArray(o.types) && o.types.length > 0 ? o.types.filter((t) => VALID_TYPES.has(t)) : ["otro"];
  return {
    country: o.country === "ve" ? "ve" : "co",
    name: String(name).slice(0, 120),
    types: types.length > 0 ? types : ["otro"],
    estado: o.estado ?? null,
    location_text: String(o.locationText ?? o.location_text ?? ""),
    schedule_text: String(o.scheduleText ?? o.schedule_text ?? ""),
    description: String(o.description ?? ""),
    contact_name: o.contactName ?? o.contact_name ?? null,
    contact_phone: o.contactPhone ?? o.contact_phone ?? null,
    verified: typeof o.verified === "boolean" ? o.verified : defaultVerified,
    available: true,
  };
}

async function main() {
  const text = readFileSync(file, "utf8");
  const parsed = JSON.parse(text);
  const records = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.data ?? []);
  const rows = records.map(normalize).filter(Boolean);
  console.log(`📋 ${records.length} registros leídos, ${rows.length} válidos para importar.`);

  let inserted = 0;
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error, count } = await sb.from("aid_points").insert(chunk, { count: "exact" });
    if (error) {
      console.error(`❌ Error en lote ${i / BATCH + 1}:`, error.message);
    } else {
      inserted += count ?? chunk.length;
      console.log(`   ✓ Lote ${i / BATCH + 1}: ${chunk.length} insertados (total ${inserted}).`);
    }
  }

  console.log(`\n✅ Importación terminada: ${inserted} puntos de ayuda en la base de datos.`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
