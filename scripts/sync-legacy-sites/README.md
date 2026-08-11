# Sincronización desde colombiatebusca.com y venezuelatebusca.com

Esos dos sitios los construimos nosotros para el terremoto de 2026, pero
quedaron sin quien los administre. La gente todavía publica ahí sin saber que
ya no tiene mantenimiento (ni verificación contra troles marcando personas
como "encontradas" sin razón). Estos scripts traen lo nuevo hacia acá
automáticamente, cada hora, vía GitHub Actions
(`.github/workflows/sync-legacy-sites.yml`).

## Cómo activarlo

1. **Aplicar la migración de esquema** (una sola vez): en el SQL Editor de tu
   proyecto de Supabase, corré el fragmento que está en
   `supabase/schema.sql` bajo el comentario "Sincronización desde
   colombiatebusca.com / venezuelatebusca.com" (agrega las columnas
   `external_source` / `external_id` a `persons`).

2. **Agregar los secrets del repositorio** (Settings → Secrets and variables
   → Actions → New repository secret), usando los mismos valores que ya
   tenés en `.env.local` de producción:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (la `service_role`, no la `anon`/`publishable`)

3. El workflow ya está en `.github/workflows/sync-legacy-sites.yml`, corre
   solo cada hora en punto. También podés dispararlo a mano desde la pestaña
   **Actions** del repo → "Sincronizar sitios sin mantenimiento" → **Run
   workflow**, para probarlo sin esperar a la próxima hora.

## Cómo funciona

- **Colombia** (`sync-colombia.mjs`): recorre el listado (ordenado por más
  reciente) página por página y para en cuanto encuentra una página donde
  todo ya estaba importado — normal que una corrida horaria solo toque 1-2
  páginas.
- **Venezuela** (`sync-venezuela.mjs`): ese sitio tiene un límite (bug propio,
  no nuestro) que nunca deja paginar más allá de las 24 personas más
  recientes del listado general. Para una sincronización horaria eso suele
  alcanzar; de respaldo también se revisa la primera página de ~20 sílabas
  comunes por si algo se escapó del top-24. Necesita un navegador con
  interfaz (no headless puro) para pasar la protección de Cloudflare del
  sitio — por eso el workflow usa `xvfb-run`.
- Ambos scripts son **idempotentes**: identifican cada persona por
  `(external_source, external_id)` y solo insertan las que no existen
  todavía. No hace falta guardar estado entre corridas (cada corrida de
  GitHub Actions es una máquina nueva).

## Correrlo en tu máquina (para probar)

```bash
cd scripts/sync-legacy-sites
npm install
npx playwright install chromium   # solo para sync-venezuela.mjs

# Necesitás las mismas variables que en .env.local del proyecto:
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...

node sync-colombia.mjs
node sync-venezuela.mjs
```

## Reconciliación completa (no horaria)

Este pipeline horario prioriza velocidad (solo lo nuevo). La migración
inicial completa de ambos sitios (los ~3.700 de Colombia y ~44.000 de
Venezuela que ya estaban publicados antes de activar esto) se hizo aparte,
a mano, una sola vez. Si en algún momento sospechan que se perdió algo del
volumen histórico, esa migración completa habría que rehacerla por separado
— avisen y la retomamos.
