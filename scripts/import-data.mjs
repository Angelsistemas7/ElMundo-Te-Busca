#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Importador de registros para "Venezuela te busca".
//
// Carga masiva de personas desde un archivo JSON o CSV a Supabase. Pensado
// para EXPORTS AUTORIZADOS: datos que te entregue quien opera otra plataforma,
// Protección Civil, Cruz Roja, o tu propia recopilación de casos.
//
// NO es un scraper: no descarga datos de ningún sitio. Solo lee el archivo que
// tú le pasas y, opcionalmente, sube las fotos referenciadas a Supabase Storage.
//
// Uso:
//   node scripts/import-data.mjs ./datos.json
//   node scripts/import-data.mjs ./datos.json --with-photos
//
// Formato JSON esperado: un array de objetos. Campos reconocidos (todos
// opcionales salvo firstName):
//   firstName, lastName, cedula, age, gender ("masculino"|"femenino"|"otro"),
//   estado, locationText, description, status, photoUrl, isUnidentified,
//   contactName, contactPhone, contactEmail, createdAt
// (También se aceptan variantes: first_name, nombre, apellido, edad,
//  ubicacion, foto, telefono...)
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── Carga manual de .env.local ──────────────────────────────────────────────
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
  console.error("Uso: node scripts/import-data.mjs <archivo.json> [--with-photos]");
  process.exit(1);
}

const sb = createClient(URL_SB, SERVICE_KEY, { auth: { persistSession: false } });

// ── Normalización flexible de un registro ───────────────────────────────────
const GENDERS = new Set(["masculino", "femenino", "otro"]);
const STATUSES = new Set(["por_localizar", "localizado", "hospitalizado", "fallecido"]);

function pickField(o, keys) {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== "") return o[k];
  }
  return null;
}

function normalize(o) {
  const firstName = pickField(o, ["firstName", "first_name", "nombre", "nombres", "name"]);
  if (!firstName) return null; // sin nombre no se importa

  const ageRaw = pickField(o, ["age", "edad"]);
  const age = ageRaw != null && Number.isFinite(Number(ageRaw)) ? Number(ageRaw) : null;

  let gender = pickField(o, ["gender", "genero", "sexo"]);
  gender = gender ? String(gender).toLowerCase() : null;
  if (gender === "m" || gender === "masculino") gender = "masculino";
  else if (gender === "f" || gender === "femenino") gender = "femenino";
  else if (gender && !GENDERS.has(gender)) gender = "otro";

  let status = pickField(o, ["status", "estado_localizacion"]);
  status = status && STATUSES.has(String(status)) ? String(status) : "por_localizar";

  return {
    first_name: String(firstName).slice(0, 80),
    last_name: String(pickField(o, ["lastName", "last_name", "apellido", "apellidos"]) ?? "").slice(0, 80),
    cedula: pickField(o, ["cedula", "ci", "documento"]),
    age,
    gender,
    estado: pickField(o, ["estado", "region", "state"]),
    location_text: String(pickField(o, ["locationText", "location_text", "ubicacion", "location", "lugar"]) ?? ""),
    description: String(pickField(o, ["description", "descripcion", "notas"]) ?? ""),
    photo_url: pickField(o, ["photoUrl", "photo_url", "foto", "photo", "image"]),
    status,
    is_unidentified: Boolean(o.isUnidentified ?? o.is_unidentified ?? false),
    contact_name: pickField(o, ["contactName", "contact_name", "contacto"]),
    contact_phone: pickField(o, ["contactPhone", "contact_phone", "telefono", "phone"]),
    contact_email: pickField(o, ["contactEmail", "contact_email", "correo", "email"]),
    created_at: pickField(o, ["createdAt", "created_at", "fecha"]) ?? new Date().toISOString(),
  };
}

// ── Ejecución ────────────────────────────────────────────────────────────────
async function main() {
  const text = readFileSync(file, "utf8");
  let records;
  try {
    const parsed = JSON.parse(text);
    records = Array.isArray(parsed) ? parsed : parsed.items ?? parsed.data ?? [];
  } catch {
    console.error("❌ El archivo no es un JSON válido (un array de personas).");
    process.exit(1);
  }

  const rows = records.map(normalize).filter(Boolean);
  console.log(`📋 ${records.length} registros leídos, ${rows.length} válidos para importar.`);

  let inserted = 0;
  let failed = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error, count } = await sb.from("persons").insert(chunk, { count: "exact" });
    if (error) {
      failed += chunk.length;
      console.error(`❌ Error en lote ${i / BATCH + 1}:`, error.message);
    } else {
      inserted += count ?? chunk.length;
      console.log(`   ✓ Lote ${i / BATCH + 1}: ${chunk.length} insertados (total ${inserted}).`);
    }
  }

  console.log(`\nImportación terminada: ${inserted} personas insertadas, ${failed} con error.`);
  console.log("   (Las fotos se referencian por URL. Para alojarlas en tu Storage,");
  console.log("    descárgalas desde una fuente autorizada y súbelas al bucket 'photos'.)");
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
