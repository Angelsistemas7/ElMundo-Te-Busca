// Sincronización horaria (incremental) desde colombiatebusca.com.
// La página quedó sin mantenimiento pero la gente sigue publicando ahí sin
// saberlo: este script trae lo nuevo y lo agrega a "El mundo te busca".
// Se detiene apenas encuentra una página del listado donde TODO ya estaba
// importado (el listado ordena por más reciente primero), así que en una
// corrida horaria normal solo toca 1-2 páginas.
import * as cheerio from "cheerio";
import { makeSupabase, guessRegion, CO_REGIONS, uploadPhotoFromUrl, upsertPerson } from "./lib.mjs";

const BASE = "https://colombiatebusca.com";
const SOURCE = "colombiatebusca.com";
const UA = "Mozilla/5.0 (compatible; ElMundoTeBuscaSync/1.0)";
const MAX_PAGES_SAFETY = 200; // tope duro por si el early-exit no dispara

async function fetchHtml(url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

function extractPersonIds(html) {
  const $ = cheerio.load(html);
  const ids = new Set();
  // El sitio empezó a anteponer "tab=persons&page=N&" antes de "person=" en
  // sus enlaces (antes el parámetro iba justo después de "?") — el selector
  // exigía el "?" pegado y dejó de encontrar nada desde entonces. La regex
  // ya valida el formato exacto "person=<uuid>", así que basta con que el
  // href contenga esa cadena en cualquier posición.
  $('a[href*="person="]').each((_, el) => {
    const m = ($(el).attr("href") || "").match(/person=([0-9a-f-]{36})/i);
    if (m) ids.add(m[1]);
  });
  return [...ids];
}

function parseDetail(html) {
  const $ = cheerio.load(html);
  const drawer = $("#detailDrawer");
  if (drawer.length === 0) return null;

  const name = drawer.find("h1").first().text().trim();
  const photoRelative = drawer.find(".detail-photo img").attr("src") || "";
  const photoUrl = photoRelative ? new URL(photoRelative, BASE).toString() : null;

  const fields = {};
  drawer.find(".detail-box dl dt").each((_, dt) => {
    const key = $(dt).text().trim();
    fields[key] = $(dt).next("dd").text().replace(/\s+/g, " ").trim();
  });

  return { name, photoUrl, fields };
}

function mapStatus(estadoTexto) {
  const t = (estadoTexto || "").toLowerCase();
  return t.includes("localizada") || t.includes("localizado") ? "localizado" : "por_localizar";
}
function mapGender(g) {
  const t = (g || "").toLowerCase();
  return t === "masculino" ? "masculino" : t === "femenino" ? "femenino" : null;
}
function mapAge(edadTexto) {
  const m = (edadTexto || "").match(/\d+/);
  return m ? Number(m[0]) : null;
}
function parseFecha(txt) {
  const m = (txt || "").match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let [, dd, mm, yyyy, hh, min, ampm] = m;
  hh = parseInt(hh, 10);
  if (/pm/i.test(ampm) && hh !== 12) hh += 12;
  if (/am/i.test(ampm) && hh === 12) hh = 0;
  const iso = new Date(Date.UTC(+yyyy, +mm - 1, +dd, hh, +min));
  return isNaN(iso) ? null : iso.toISOString();
}

async function main() {
  const sb = makeSupabase();
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (let page = 1; page <= MAX_PAGES_SAFETY; page++) {
    const listHtml = await fetchHtml(`${BASE}/?tab=persons&page=${page}`);
    const ids = extractPersonIds(listHtml);
    if (ids.length === 0) {
      console.log(`Página ${page}: sin resultados, fin del listado.`);
      break;
    }

    let allKnownOnThisPage = true;
    for (const id of ids) {
      const detailHtml = await fetchHtml(`${BASE}/?person=${id}`);
      const parsed = parseDetail(detailHtml);
      if (!parsed) continue; // borrada/inexistente

      const photo = parsed.photoUrl ? await uploadPhotoFromUrl(sb, parsed.photoUrl) : { url: null, hash: null };
      const row = {
        first_name: (parsed.name || "Sin identificar").slice(0, 80),
        last_name: "",
        cedula: parsed.fields["Documento"] && parsed.fields["Documento"] !== "No visible" ? parsed.fields["Documento"] : null,
        age: mapAge(parsed.fields["Edad"]),
        gender: mapGender(parsed.fields["Género"]),
        country: "co",
        estado: guessRegion(parsed.fields["Último lugar visto"], CO_REGIONS),
        location_text: parsed.fields["Último lugar visto"] || "",
        description: parsed.fields["Descripción adicional"] || "",
        photo_url: photo.url,
        photo_hash: photo.hash,
        status: mapStatus(parsed.fields["Estado"]),
        is_unidentified: false,
        created_at: parseFecha(parsed.fields["Registrado"]) || new Date().toISOString(),
        external_source: SOURCE,
        external_id: id,
      };

      const result = await upsertPerson(sb, row);
      if (result.status === "inserted") {
        inserted++;
        allKnownOnThisPage = false;
        console.log(`  + ${row.first_name} (${id})${result.possibleDuplicate ? "  ⚠ posible duplicado" : ""}`);
      } else if (result.status === "error") {
        errors++;
        console.error(`  ❌ ${id}: ${result.error}`);
      } else {
        skipped++;
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    if (allKnownOnThisPage) {
      console.log(`Página ${page}: todo ya estaba importado. Fin de lo nuevo.`);
      break;
    }
  }

  console.log(`\nColombia: ${inserted} nuevas, ${skipped} ya existían, ${errors} errores.`);
  if (errors > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("Error fatal (Colombia):", e);
  process.exit(1);
});
