// Sincronización horaria (incremental) desde venezuelatebusca.com.
// Ese sitio tiene un bug: el listado sin búsqueda nunca pagina más allá de
// las 24 personas más recientes (ver notas del proyecto). Para una corrida
// HORARIA eso en realidad alcanza casi siempre (24 recién llegadas por hora
// es mucho volumen). De respaldo, también barremos la primera página de un
// grupo reducido de sílabas comunes por si algo se escapó del top-24.
//
// venezuelatebusca.com está detrás de un challenge de Cloudflare que bloquea
// automatización "headless" estándar; hace falta un navegador real (no
// headless) con las banderas de automatización ocultas para pasarlo. En
// GitHub Actions eso requiere una pantalla virtual (xvfb-run), ya
// configurado en el workflow.
import { chromium } from "playwright";
import { makeSupabase, guessRegion, VE_REGIONS, uploadPhotoFromUrl, upsertPerson } from "./lib.mjs";

const BASE = "https://venezuelatebusca.com";
const SOURCE = "venezuelatebusca.com";

// Sílabas de respaldo: las más frecuentes en nombres en español (subset
// pequeño a propósito para que la corrida horaria sea rápida). El barrido
// completo (2000+ sílabas) es para una reconciliación manual, no cada hora.
const BACKUP_TERMS = [
  "mar", "jos", "ana", "car", "luis", "and", "ros", "gar", "per", "gon",
  "rod", "mor", "fer", "gom", "diaz", "ram", "sil", "rey", "cas", "gue",
];

function mapStatus(s) {
  return s === "found" ? "localizado" : "por_localizar";
}
function mapGender(g) {
  return g === "male" ? "masculino" : g === "female" ? "femenino" : null;
}

function personToRow(p) {
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "Sin identificar";
  return {
    __photoUrl: p.photoUrl ? new URL(p.photoUrl, BASE).toString() : null,
    row: {
      first_name: fullName.slice(0, 80),
      last_name: "",
      cedula: p.idNumber || null,
      age: typeof p.age === "number" ? p.age : null,
      gender: mapGender(p.gender),
      country: "ve",
      estado: guessRegion(p.lastSeen, VE_REGIONS),
      location_text: p.lastSeen || "",
      description: p.description || "",
      status: mapStatus(p.status),
      is_unidentified: false,
      created_at: p.createdAt || new Date().toISOString(),
      external_source: SOURCE,
      external_id: p.id,
    },
  };
}

async function fetchPersons(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(
    () => window.__reactRouterContext?.state?.loaderData?.["routes/_index"]?.persons,
    { timeout: 20000 },
  );
  return page.evaluate(() => {
    const ld = window.__reactRouterContext.state.loaderData["routes/_index"];
    return ld.persons;
  });
}

async function main() {
  const sb = makeSupabase();
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();

  const seen = new Set();
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  async function processBatch(persons) {
    for (const p of persons) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      try {
        const { __photoUrl, row } = personToRow(p);
        row.photo_url = __photoUrl ? await uploadPhotoFromUrl(sb, __photoUrl) : null;
        const result = await upsertPerson(sb, row);
        if (result.status === "inserted") {
          inserted++;
          console.log(`  + ${row.first_name} (${p.id})`);
        } else if (result.status === "error") {
          errors++;
          console.error(`  ❌ ${p.id}: ${result.error}`);
        } else {
          skipped++;
        }
      } catch (e) {
        errors++;
        console.error(`  ❌ ${p.id}: ${e.message}`);
      }
    }
  }

  console.log("=== Top-24 más recientes (sin filtro) ===");
  try {
    const recent = await fetchPersons(page, `${BASE}/?`);
    await processBatch(recent);
  } catch (e) {
    console.error("  [error trayendo el top-24]", e.message);
  }

  console.log("=== Barrido de respaldo (primera página por sílaba) ===");
  for (const term of BACKUP_TERMS) {
    try {
      const persons = await fetchPersons(page, `${BASE}/?query=${encodeURIComponent(term)}`);
      await processBatch(persons);
    } catch (e) {
      console.error(`  [error en "${term}"]`, e.message);
    }
  }

  await browser.close();
  console.log(`\nVenezuela: ${inserted} nuevas, ${skipped} ya existían, ${errors} errores.`);
}

main().catch((e) => {
  console.error("Error fatal (Venezuela):", e);
  process.exit(1);
});
