# Backup automático diario — cómo activarlo

El workflow `.github/workflows/db-backup.yml` ya está en el repo, pero
necesita 3 secrets que **solo tú puedes crear** (dashboard de Supabase +
GitHub). Sin esto, el workflow corre y falla con un mensaje claro (no falla
en silencio).

Ve a **GitHub → repo `ElMundo-Te-Busca` → Settings → Secrets and variables →
Actions → New repository secret** y agrega estos 3:

## 1. `SUPABASE_DB_URL`

Dashboard de Supabase → tu proyecto → **Project Settings → Database →
Connection string** → pestaña **Session pooler** (puerto `6543`, no el
`5432` directo). Copia la URL completa (incluye la contraseña de la base,
no la `anon`/`service_role` key).

## 2. `BACKUP_GPG_PASSPHRASE`

Una passphrase fuerte que **inventas tú ahora** (ej. generada con un
gestor de contraseñas) y **guardas en un lugar seguro aparte** (no en este
repo, no en un chat). Sin ella no se puede descifrar ningún backup — si se
pierde, los backups pasados quedan inútiles, así que guárdala como
guardarías la contraseña de un banco.

## 3. `BACKUP_REPO_TOKEN`

Token de GitHub con permiso de **escritura solo sobre el repo
`elmundotebusca-backups`** (ya creado, privado). Crear uno *fine-grained*:

1. `github.com/settings/personal-access-tokens/new`
2. **Resource owner**: tu cuenta (`Angelsistemas7`).
3. **Repository access**: "Only select repositories" → `elmundotebusca-backups`.
4. **Permissions → Repository permissions → Contents**: `Read and write`.
5. Generar y copiar el token (empieza con `github_pat_...`) — solo se
   muestra una vez.

## Probarlo

Una vez los 3 secrets estén puestos: **Actions → Backup Supabase DB → Run
workflow** (el botón `workflow_dispatch`, no hace falta esperar al cron de
las 06:00 UTC). Si todo sale bien, aparece un archivo
`backup-YYYY-MM-DD.tar.gz.gpg` nuevo en
[`elmundotebusca-backups`](https://github.com/Angelsistemas7/elmundotebusca-backups).

## Qué NO cubre esto todavía

- **Las fotos del bucket de Storage** — este backup es solo de la base de
  datos (Postgres). Las fotos necesitan su propio respaldo aparte (sync a
  Backblaze B2 o Cloudflare R2, ver
  `docs/investigacion-mi-sesion-20260813/02-backups-continuidad.md` §2) —
  pendiente, no implementado en este workflow.
- **Probar el restore de verdad.** Un backup nunca probado a restaurar es
  una hipótesis, no una garantía — vale la pena hacerlo una vez contra un
  proyecto Supabase de prueba (no producción), ver
  `elmundotebusca-backups/README.md`.
- **Plan Pro de Supabase.** Este workflow es un puente de bajo costo
  (backup diario, gratis), no un sustituto completo: Supabase Pro
  ($25/mes) da 7 días de retención con un proceso de restore probado por
  ellos mismos. Vale la pena evaluarlo igual, sobre todo si el volumen de
  registros nuevos por día crece.
