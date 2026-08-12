#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Backfill de `persons.estado` a partir de `location_text`, para las filas
// que quedaron sin región asignada (la migración multi-país solo agregó la
// columna `country`, `estado` ya podía venir vacío de antes en los datos
// originales). Busca nombres de ciudad/municipio conocidos dentro del texto
// libre de ubicación y asigna el estado/departamento correspondiente.
//
// Es heurístico, no exhaustivo: cubre las zonas más afectadas por cada sismo
// (La Guaira/Vargas, Carabobo, etc. en Venezuela; Chocó, Valle del Cauca,
// Caldas, Quindío, etc. en Colombia) más las ciudades grandes de cada país.
// Lo que no calza con ningún patrón queda sin tocar (sigue en null), no se
// inventa nada. Solo RELLENA filas con estado=null; nunca sobrescribe un
// estado ya asignado.
//
// Uso: node scripts/backfill-estado.mjs [--dry-run]
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const env = {};
  try {
    const text = readFileSync(".env.local", "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return { ...env, ...process.env };
}

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

// Orden: patrones más específicos primero (evita que un municipio genérico
// se coma un patrón de estado más preciso que aparezca en el mismo texto).
const VE_PATTERNS = [
  // La Guaira / Vargas (zona más afectada, epicentro cercano)
  [/catia\s*la\s*mar/i, "La Guaira"],
  [/caraballeda/i, "La Guaira"],
  [/tanaguarena/i, "La Guaira"],
  [/naiguat[aá]/i, "La Guaira"],
  [/macuto/i, "La Guaira"],
  [/maiquet[ií]a/i, "La Guaira"],
  [/\bla\s*guaira\b/i, "La Guaira"],
  [/\bvargas\b/i, "La Guaira"],
  [/playa\s*grande/i, "La Guaira"],
  [/\bguaira\b/i, "La Guaira"],
  // Distrito Capital
  [/caracas/i, "Distrito Capital"],
  [/\bpetare\b/i, "Miranda"],
  [/chacao/i, "Distrito Capital"],
  [/catia\b(?!\s*la\s*mar)/i, "Distrito Capital"],
  [/el\s*junquito/i, "Distrito Capital"],
  // Miranda
  [/\bmiranda\b/i, "Miranda"],
  [/los\s*teques/i, "Miranda"],
  [/guarenas/i, "Miranda"],
  [/guatire/i, "Miranda"],
  [/charallave/i, "Miranda"],
  // Carabobo
  [/valencia/i, "Carabobo"],
  [/puerto\s*cabello/i, "Carabobo"],
  [/\bcarabobo\b/i, "Carabobo"],
  // Aragua
  [/maracay/i, "Aragua"],
  [/\baragua\b/i, "Aragua"],
  [/la\s*victoria/i, "Aragua"],
  // Falcón
  [/coro\b/i, "Falcón"],
  [/\bfalc[oó]n\b/i, "Falcón"],
  [/punto\s*fijo/i, "Falcón"],
  // Yaracuy (epicentro)
  [/yumare/i, "Yaracuy"],
  [/san\s*felipe/i, "Yaracuy"],
  [/\byaracuy\b/i, "Yaracuy"],
  // Zulia
  [/maracaibo/i, "Zulia"],
  [/\bzulia\b/i, "Zulia"],
  // Lara
  [/barquisimeto/i, "Lara"],
  [/\blara\b/i, "Lara"],
  // Otros estados por nombre directo
  [/\bt[aá]chira\b/i, "Táchira"],
  [/\bm[eé]rida\b/i, "Mérida"],
  [/\btrujillo\b/i, "Trujillo"],
  [/\bportuguesa\b/i, "Portuguesa"],
  [/\bbarinas\b/i, "Barinas"],
  [/\bap[uú]re\b/i, "Apure"],
  [/\bgu[aá]rico\b/i, "Guárico"],
  [/\bcojedes\b/i, "Cojedes"],
  [/\bbol[ií]var\b/i, "Bolívar"],
  [/ciudad\s*guayana/i, "Bolívar"],
  [/\bmonagas\b/i, "Monagas"],
  [/maturin/i, "Monagas"],
  [/\bsucre\b/i, "Sucre"],
  [/cuman[aá]/i, "Sucre"],
  [/\banzo[aá]tegui\b/i, "Anzoátegui"],
  [/barcelona.*anzo/i, "Anzoátegui"],
  [/puerto\s*la\s*cruz/i, "Anzoátegui"],
  [/nueva\s*esparta/i, "Nueva Esparta"],
  [/margarita/i, "Nueva Esparta"],
  [/\bamazonas\b/i, "Amazonas"],
  [/delta\s*amacuro/i, "Delta Amacuro"],
];

const CO_PATTERNS = [
  // Chocó (epicentro San José del Palmar)
  [/san\s*jos[eé]\s*del\s*palmar/i, "Chocó"],
  [/istmina|itsmina|itmina/i, "Chocó"],
  [/quibd[oó]/i, "Chocó"],
  [/\bchoc[oó]\b/i, "Chocó"],
  // Valle del Cauca
  [/buenaventura/i, "Valle del Cauca"],
  [/\bcali\b/i, "Valle del Cauca"],
  [/\byumbo\b/i, "Valle del Cauca"],
  [/\bdagua\b/i, "Valle del Cauca"],
  [/el\s*cairo/i, "Valle del Cauca"],
  [/\bsevilla\b/i, "Valle del Cauca"],
  [/jamund[ií]/i, "Valle del Cauca"],
  [/guachinte/i, "Valle del Cauca"],
  [/palmira/i, "Valle del Cauca"],
  [/tuluá/i, "Valle del Cauca"],
  [/cartago/i, "Valle del Cauca"],
  [/valle\s*del?\s*ca[uú]ca/i, "Valle del Cauca"],
  [/\bqueremal\b/i, "Valle del Cauca"],
  [/\balvarez\b/i, "Valle del Cauca"],
  // Caldas
  [/manizales/i, "Caldas"],
  [/\bcaldas\b/i, "Caldas"],
  // Quindío
  [/armenia/i, "Quindío"],
  [/salento/i, "Quindío"],
  [/\bquind[ií]o\b/i, "Quindío"],
  // Risaralda
  [/pereira/i, "Risaralda"],
  [/dosquebradas/i, "Risaralda"],
  [/\brisaralda\b/i, "Risaralda"],
  // Antioquia
  [/medell[ií]n/i, "Antioquia"],
  [/\bantioquia\b/i, "Antioquia"],
  // Bogotá
  [/bogot[aá]/i, "Bogotá D.C."],
  // Otras capitales/departamentos por nombre directo
  [/barranquilla/i, "Atlántico"],
  [/\batl[aá]ntico\b/i, "Atlántico"],
  [/cartagena/i, "Bolívar"],
  [/c[uú]cuta/i, "Norte de Santander"],
  [/norte\s*de\s*santander/i, "Norte de Santander"],
  [/bucaramanga/i, "Santander"],
  [/\bsantander\b/i, "Santander"],
  [/ibagu[eé]/i, "Tolima"],
  [/\btolima\b/i, "Tolima"],
  [/neiva/i, "Huila"],
  [/\bhuila\b/i, "Huila"],
  [/villavicencio/i, "Meta"],
  [/\bmeta\b/i, "Meta"],
  [/monter[ií]a/i, "Córdoba"],
  [/\bc[oó]rdoba\b/i, "Córdoba"],
  [/santa\s*marta/i, "Magdalena"],
  [/\bmagdalena\b/i, "Magdalena"],
  [/riohacha/i, "La Guajira"],
  [/guajira/i, "La Guajira"],
  [/popay[aá]n/i, "Cauca"],
  [/\bcauca\b(?!.*valle)/i, "Cauca"],
  [/pasto\b/i, "Nariño"],
  [/\bnari[ñn]o\b/i, "Nariño"],
  [/tunja/i, "Boyacá"],
  [/\bboyac[aá]\b/i, "Boyacá"],
  [/florencia/i, "Caquetá"],
  [/\bcaquet[aá]\b/i, "Caquetá"],
  [/arauca/i, "Arauca"],
  [/yopal/i, "Casanare"],
  [/\bcasanare\b/i, "Casanare"],
  [/mocoa/i, "Putumayo"],
  [/\bputumayo\b/i, "Putumayo"],
  [/sincelejo/i, "Sucre"],
  [/valledupar/i, "Cesar"],
  [/\bcesar\b/i, "Cesar"],
];

async function backfillCountry(country, patterns) {
  console.log(`\n── ${country.toUpperCase()} ──`);
  const buckets = new Map(); // estado -> [ids]
  let scanned = 0;
  let page = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await sb
      .from("persons")
      .select("id, location_text")
      .eq("country", country)
      .is("estado", null)
      .not("location_text", "eq", "")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    scanned += data.length;
    for (const row of data) {
      const text = row.location_text || "";
      for (const [regex, estado] of patterns) {
        if (regex.test(text)) {
          if (!buckets.has(estado)) buckets.set(estado, []);
          buckets.get(estado).push(row.id);
          break;
        }
      }
    }
    if (data.length < pageSize) break;
    page += 1;
  }

  let matched = 0;
  for (const [estado, ids] of buckets) matched += ids.length;
  console.log(`Escaneadas ${scanned} filas sin estado (con texto de ubicación). Coinciden: ${matched}.`);

  if (DRY_RUN) {
    for (const [estado, ids] of [...buckets].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${estado}: ${ids.length}`);
    }
    return { scanned, matched };
  }

  for (const [estado, ids] of buckets) {
    // Actualiza en lotes de 500 ids para no exceder límites de la URL/petición.
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { error } = await sb.from("persons").update({ estado }).in("id", chunk);
      if (error) throw error;
    }
    console.log(`  ✓ ${estado}: ${ids.length} actualizadas`);
  }
  return { scanned, matched };
}

const veResult = await backfillCountry("ve", VE_PATTERNS);
const coResult = await backfillCountry("co", CO_PATTERNS);

console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Listo. VE: ${veResult.matched}/${veResult.scanned} asignadas. CO: ${coResult.matched}/${coResult.scanned} asignadas.`);
