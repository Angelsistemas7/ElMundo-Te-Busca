# Backups y continuidad de datos

> Investigación nueva (ago. 2026). Tema más urgente del proyecto: si la base de
> Supabase se corrompe, alguien borra algo por error, o la cuenta de Supabase
> se ve comprometida/suspendida, hoy **no hay ninguna garantía verificada** de
> poder recuperar los datos reales de personas desaparecidas. Este documento
> responde: qué cubre Supabase realmente, qué no cubre nunca (spoiler: las
> fotos), qué hace falta construir, y dos runbooks de recuperación paso a paso.

## Resumen ejecutivo (léelo aunque no leas el resto)

1. **No hay confirmación en el repo de qué plan de Supabase corre en
   producción.** `docs/CHECKLIST-INFRAESTRUCTURA.md` §2 lo deja como una casilla
   pendiente ("confirma... que los backups automáticos están activos"), no
   como un hecho verificado. Si el proyecto sigue en el plan **Free**, la base
   de datos **no tiene ningún backup automático, nunca** — ni diario ni PITR.
   Esto es lo primero que hay que confirmar, hoy, en el dashboard.
2. **Las fotos (Supabase Storage) NO están incluidas en NINGÚN backup de
   Supabase, en ningún plan**, ni siquiera Enterprise. Los backups de Supabase
   son de Postgres; Storage vive en un almacén S3 aparte y solo su *metadata*
   (nombre de archivo, bucket, dueño) está en la base — los bytes de la foto
   no. Si se pierde el bucket `photos`, un backup de base de datos no lo trae
   de vuelta. Fuente: [Supabase Docs — Backups](https://supabase.com/docs/guides/platform/backups) y [GitHub Discussion #6755](https://github.com/orgs/supabase/discussions/6755).
3. **No existe ningún script de respaldo en el repo.** `scripts/` solo tiene
   *importadores* (`import-data.mjs`, `import-aid-points.mjs`) y utilidades
   (`backfill-estado.mjs`, `fetch-social-posts.mjs`) — ninguno exporta ni
   respalda nada.
4. **Acción inmediata recomendada:** (a) confirmar el plan de Supabase hoy
   mismo (5 minutos, ver §7), y mientras tanto (b) hacer un export manual de
   la base y del bucket `photos` esta semana como red de seguridad temporal,
   en paralelo a (c) implementar el workflow automático de este documento
   (§6), que es gratis y no depende de que alguien se acuerde de hacerlo.

---

## 1. Qué dice hoy el repo (y qué queda pendiente)

- `docs/CHECKLIST-INFRAESTRUCTURA.md` §4 ("Hardening del VPS"), ítem
  **Backups**: *"la base de datos vive en Supabase, no en el VPS — confirma
  en el dashboard de Supabase (Database → Backups) que los backups
  automáticos están activos."* — Es una instrucción para ir a verificar, no
  una confirmación de que ya se verificó. No hay ningún otro documento del
  repo que registre el resultado de esa verificación.
- `docs/COSTOS-Y-DESPLIEGUE.md` describe el plan **Free** de Supabase (500 MB
  DB, 1 GB fotos, 5 GB tráfico) como punto de partida recomendado ("empiezas
  en ~$0–1/mes") y el plan **Pro** ($25/mes) como el siguiente escalón cuando
  "haya volumen" — pero es una guía de *cuándo escalar por capacidad*, no
  menciona backups como criterio para subir de plan. Es decir: el documento
  que sí existe podría llevar a alguien a quedarse en Free por más tiempo del
  seguro, sin saber que Free implica cero backups.
- `docs/GUIA-DESPLIEGUE.md` (paso 2, "Crear la base de datos en Supabase") no
  menciona backups en ningún punto del flujo de creación del proyecto.
- Confirmado por memoria de proyecto: **quien tiene acceso al dashboard de
  Supabase es un compañero, no el desarrollador** ("Supabase lo corre el
  compañero — el usuario nunca toca el SQL Editor"). Esto es clave: cualquier
  paso de configuración de backups tiene que ser instrucciones de clic exacto
  en el dashboard, no comandos de terminal, porque quien tiene el acceso no
  es necesariamente quien lee este repo.

**Conclusión de esta sección:** el estado real de los backups de producción
es **desconocido** hasta que alguien con acceso al dashboard lo confirme
siguiendo los pasos exactos de la §7 de este documento.

---

## 2. Qué cubre cada plan de Supabase en 2026 (verificado en fuentes oficiales)

| Plan | Backups diarios automáticos | Retención | PITR (Point-in-Time Recovery) |
|------|------------------------------|-----------|-------------------------------|
| **Free** ($0) | **No** — hay que exportar manualmente con `supabase db dump` | — | No disponible |
| **Pro** ($25/mes) | **Sí**, incluido por defecto | Últimos 7 días | Add-on aparte, ver abajo |
| **Team** ($599/mes) | Sí, incluido | Últimos 14 días | Add-on aparte |
| **Enterprise** (a medida) | Sí, arreglos personalizados | Hasta 30+ días | Add-on, ventanas >28 días |

**PITR (recuperación a un segundo exacto, no solo al snapshot de anoche)** es
un *add-on* de pago sobre Pro/Team/Enterprise, **no** viene incluido ni
siquiera en Pro:
- 7 días de ventana ≈ **$100/mes** (o $0.137/hora)
- 14 días ≈ **$200/mes**
- 28 días ≈ **$400/mes**
- Requiere además un add-on de cómputo mínimo "Small" (no corre sobre el
  compute compartido del plan base).

Fuentes: [Supabase Docs — Database Backups](https://supabase.com/docs/guides/platform/backups) (oficial, plan por plan y precios de PITR), [Supabase Pricing](https://supabase.com/pricing) (oficial). Contrastado además con coberturas de terceros de 2026 que confirman los mismos números: [scored.tools — Supabase Pricing 2026](https://scored.tools/blog/supabase-pricing-free-tier-vs-pro-plan-2026/), [selfhost.dev — Supabase Pricing 2026](https://selfhost.dev/blog/supabase-pricing-explained/).

**Lectura para este proyecto:** con Pro ($25/mes, que ya está contemplado como
el "siguiente escalón" en `COSTOS-Y-DESPLIEGUE.md`) se obtienen backups
diarios automáticos de los últimos 7 días **sin configurar nada** — el update
de plan solo. PITR ($100+/mes adicionales) es desproporcionado para el
presupuesto de esta causa (el propio doc de costos habla de $25–45/mes
*totales* como el rango "con tracción real"); no se recomienda como prioridad
ahora. El respaldo propio de la §6 (diario, gratis, con más control) cubre
buena parte de lo que PITR daría, a costo $0.

---

## 3. El punto ciego que casi nadie revisa: Storage (fotos)

Confirmado con documentación oficial y con un hilo de discusión abierto en el
propio repositorio de Supabase:

- Los backups de base de datos de Supabase (en cualquier plan) **son
  específicamente del volumen de Postgres**. Las fotos subidas al bucket
  `photos` no viven en ese volumen: viven en un almacén compatible con S3,
  operado por un servicio aparte ("Storage server"). Lo único que hay en
  Postgres sobre una foto es una fila en `storage.objects` (nombre, bucket,
  dueño, políticas RLS) — no los bytes de la imagen.
- Consecuencia práctica: si restauras un backup de base de datos después de
  un desastre, la tabla `storage.objects` va a decir "esta foto existe en tal
  ruta", pero el archivo real puede ya no estar ahí (o puede estar
  desincronizado — apunta a la versión vieja mientras el bucket real tiene la
  nueva, o viceversa). Es un problema de integridad conocido, no hipotético.
- Es un olvido documentado como "issue" abierto en el propio Supabase:
  [supabase/storage#789 — "Add Storage Backups in Sync with Database
  Backups"](https://github.com/supabase/storage/issues/789) (a la fecha de
  esta investigación, sin resolver — Supabase no ofrece backup de Storage
  integrado en ningún plan).
- Confirmación adicional: [Supabase Docs — Backups, sección "Restoring to a
  new project"](https://supabase.com/docs/guides/platform/backups) dice
  textualmente que los backups de base de datos *no incluyen* los objetos
  guardados vía la API de Storage.

**Para este proyecto es crítico**, porque las fotos son evidencia real: fotos
de personas para identificarlas (`/sin-identificar`), fotos de comentarios,
fotos de mascotas. Perder el bucket `photos` sin backup aparte es perder la
mitad de la utilidad de la plataforma aunque la base de datos esté intacta.

**La solución** es respaldar el bucket por separado usando el **endpoint
S3-compatible de Supabase Storage** (`https://<project-ref>.storage.supabase.co/storage/v1/s3`),
con la CLI de AWS o cualquier cliente S3, hacia otro proveedor de object
storage. Fuente: [Supabase Docs — S3 Compatibility](https://supabase.com/docs/guides/storage/s3/compatibility), [SimpleBackups — How to Back Up Supabase Storage Buckets](https://simplebackups.com/blog/backup-supabase-storage). Esto es exactamente lo que hace el workflow de la §6.

> Nota sobre `rclone`: reportes de 2026 indican que versiones de `rclone`
> posteriores a la 1.67.0 tienen problemas contra el endpoint S3 de Supabase;
> la CLI de AWS (`aws s3 sync`/`aws s3 cp`) funciona sin problemas y ya viene
> preinstalada en los runners de GitHub Actions, así que el workflow propuesto
> la usa a ella en vez de `rclone`.

---

## 4. Qué existe hoy en `scripts/` (nada de esto es un backup)

| Script | Qué hace | ¿Es un backup? |
|--------|----------|-----------------|
| `scripts/import-data.mjs` | Importa un export **autorizado** (JSON/CSV) de personas a la base | No — es un importador, va en el sentido contrario |
| `scripts/import-aid-points.mjs` | Importa puntos de ayuda desde un archivo | No |
| `scripts/backfill-estado.mjs` | Corrección puntual de datos existentes (rellenar un campo `estado`) | No |
| `scripts/fetch-social-posts.mjs` | Ingesta de redes sociales (Bluesky/Mastodon/Reddit) hacia la cola de moderación | No |

Ninguno hace `pg_dump`, ninguno exporta a un archivo fuera de Supabase, y
ninguno toca el bucket `photos`. **No hay que "limpiar" ni tocar ninguno de
estos** — la conclusión es simplemente que hay que construir el respaldo
desde cero, no adaptar algo existente.

---

## 5. Runbook de recuperación ante desastre

Dos rutas según qué se dañó. Empieza siempre confirmando el alcance del
problema antes de restaurar nada (una restauración mal dirigida puede
sobrescribir datos buenos con datos viejos).

### Ruta A — "Until X horas atrás", usando el backup nativo de Supabase (plan Pro o superior)

Uso: alguien borró registros por error, un bug corrompió datos, se necesita
"volver a como estaba ayer". Requiere que el proyecto esté en Pro (o
superior) **y** que el incidente esté dentro de la ventana de retención (7
días en Pro).

1. Dashboard de Supabase → el proyecto → **Database → Backups**.
2. Pestaña **Scheduled backups** (o **Point in Time**, si el add-on PITR está
   activo). Verás una lista de snapshots diarios con fecha y hora.
3. **Antes de restaurar**: Supabase restaura *todo el proyecto* al estado de
   ese momento — no es selectivo por tabla. Si hubo escrituras buenas después
   del incidente (gente publicando personas nuevas, comentarios, etc.), esas
   se pierden también al restaurar. Si el incidente fue acotado (ej. una
   tabla borrada por error), es preferible restaurar el backup a un
   **proyecto nuevo** ("Restore to a new project", si el plan lo permite) y
   de ahí copiar manualmente solo las filas afectadas de vuelta al proyecto
   real con `INSERT`, en vez de sobrescribir todo.
4. Clic en el snapshot deseado → **Restore**. Confirma. Supabase tarda varios
   minutos; el proyecto queda en modo solo lectura durante la restauración.
5. Storage (fotos) **no se restaura con este paso** (ver §3) — si el
   incidente también afectó fotos, combina esto con la Ruta B para el bucket.
6. Después de restaurar: correr `supabase/schema.sql` de nuevo por si el
   snapshot es de una versión de esquema anterior a la actual del repo (es
   idempotente, no rompe nada si ya está aplicado).

### Ruta B — "El proyecto de Supabase entero desapareció / cuenta comprometida", usando el respaldo propio (§6)

Uso: la cuenta de Supabase fue suspendida, hackeada, se borró el proyecto por
error, o simplemente no había backups nativos activos (plan Free) y hay que
reconstruir desde cero con los dumps cifrados guardados en Cloudflare R2.

1. **Crear un proyecto de Supabase nuevo** (dashboard → New project). Anota
   la nueva **Project URL**, **anon key** y **service_role key**
   (Project Settings → API).
2. **Aplicar el esquema desde el repo** (fuente de verdad, no el backup):
   SQL Editor → New query → pega **todo** el contenido de
   `supabase/schema.sql` → Run. Esto crea todas las tablas, índices y
   políticas RLS ya actualizadas (más confiable que reconstruir el esquema
   desde un dump viejo).
3. **Descargar el backup cifrado más reciente** desde el bucket de Cloudflare
   R2 (`aws s3 ls` / `aws s3 cp`, credenciales en el mismo lugar donde se
   guardó la clave privada de `age`, ver §6).
4. **Descifrar** con la clave privada de `age` (la que generó quien configuró
   el workflow, guardada fuera de GitHub — ver §8):
   ```bash
   age --decrypt -i age-key-privada.txt -o data.sql.gz data.sql.gz.age
   gunzip data.sql.gz
   ```
5. **Restaurar solo los datos** (el esquema ya está aplicado en el paso 2) a
   la nueva base, usando la cadena de conexión del **pooler de sesión** del
   proyecto nuevo (Project Settings → Database → Connection string →
   *Session pooler*):
   ```bash
   psql "postgresql://postgres.<PROJECT-REF>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
     --single-transaction --variable ON_ERROR_STOP=1 \
     -c "SET session_replication_role = replica;" \
     -f data.sql
   ```
   (`session_replication_role = replica` desactiva triggers/FKs mientras
   carga, para que el orden de las tablas no importe.)
6. **Restaurar el bucket `photos`**: en el proyecto nuevo, Storage → crear
   bucket `photos` (público, mismas restricciones de MIME/tamaño que en
   `docs/GUIA-DESPLIEGUE.md` paso 2.4). Luego subir el contenido del backup
   de Storage descifrado:
   ```bash
   age --decrypt -i age-key-privada.txt -o photos-backup.tar.gz photos-backup.tar.gz.age
   tar xzf photos-backup.tar.gz
   aws s3 sync ./photos s3://photos \
     --endpoint-url "https://<NUEVO-PROJECT-REF>.storage.supabase.co/storage/v1/s3" \
     --region <region>
   ```
   (credenciales S3 del **proyecto nuevo**: Storage → Settings → S3 Access
   Keys → crear unas nuevas, ya que las viejas murieron con el proyecto
   viejo).
7. **Actualizar secretos**: en el `.env` del VPS
   (`/var/www/elmundotebusca/.env`, ver `docs/DESPLIEGUE-VPS.md`) y en los
   *GitHub Secrets* del repo (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) con los
   valores del proyecto nuevo.
8. **Redesplegar**: push a `main` (dispara `deploy.yml`) o
   `workflow_dispatch` manual, para que el VPS tome el `.env` nuevo.
9. **Cuentas de Supabase Auth** (login de voluntarios/staff de hospital, ver
   `src/lib/auth.ts`, tabla `profiles`): el dump de §6 es **solo del esquema
   `public`** (los datos de la app), no del esquema `auth` que administra
   Supabase internamente. Esto es una limitación conocida y aceptada del
   respaldo propio (ver §6 y advertencia de Supabase sobre esquemas `auth`
   modificados). En un desastre total sin backup nativo de Supabase
   disponible, las cuentas de inicio de sesión existentes se pierden y los
   usuarios deben registrarse de nuevo; los **datos de personas, puntos de
   ayuda, hospitales, publicaciones y comentarios sí se recuperan
   completos**, que es lo crítico para la misión del proyecto.

---

## 6. Propuesta: workflow de GitHub Actions (`pg_dump` + Storage, cifrado, diario)

### Diseño

- Corre por **cron diario** (ejemplo: 08:10 UTC / ~04:10 hora Venezuela) y
  también admite disparo manual (`workflow_dispatch`).
- Vuelca **solo el esquema `public`** (los datos de la app —
  `persons`, `posts`, `aid_points`, `hospitals`, `comments`, etc. — ver la
  lista completa de tablas en `supabase/schema.sql`), en formato SQL plano
  comprimido con `gzip`. Se excluye `auth`/`storage` (esquemas gestionados
  por Supabase, ver limitación anotada en §5 paso 9).
- Sincroniza el bucket `photos` completo a un `.tar.gz`.
- **Cifra ambos archivos** con [`age`](https://github.com/FiloSottile/age)
  usando una **clave pública** (asimétrico): GitHub Actions solo necesita la
  clave pública para cifrar — la clave privada para descifrar nunca toca
  GitHub, la guarda quien administra Supabase en un lugar seguro (gestor de
  contraseñas). Así, aunque los *secrets* del repo se filtraran, nadie podría
  leer los backups viejos con eso solo.
- Sube los `.age` a un bucket de **Cloudflare R2** (10 GB gratis para
  siempre, sin costo de salida — ver §7). Como el proyecto ya usa Cloudflare
  para Turnstile/DNS, es la misma cuenta, un panel menos que aprender.
- **Poda** backups con más de 30 días de antigüedad en el bucket destino
  (evita crecer sin límite; 30 días de dumps de esta base — cientos de KB a
  pocos MB comprimidos — están muy por debajo del free tier igual).

### Secrets nuevos a crear en GitHub (`Settings → Secrets and variables → Actions`)

| Secret | De dónde sale |
|--------|----------------|
| `SUPABASE_DB_URL` | Supabase → Project Settings → Database → Connection string → **Session pooler** (con la contraseña de la base ya puesta). **Importante**: usar el *pooler*, no la conexión directa — los runners de GitHub son IPv4 y la conexión directa de Supabase requiere IPv6 (o el add-on de pago de IPv4). |
| `SUPABASE_S3_ENDPOINT` | `https://<project-ref>.storage.supabase.co/storage/v1/s3` |
| `SUPABASE_S3_REGION` | Región del proyecto (ej. `us-east-1`), visible junto a las claves S3 |
| `SUPABASE_S3_ACCESS_KEY_ID` / `SUPABASE_S3_SECRET_ACCESS_KEY` | Supabase → Storage → Settings → **S3 Access Keys** → New access key (permiso solo lectura si el panel lo permite) |
| `BACKUP_AGE_PUBLIC_KEY` | Clave pública generada una vez por quien administrará el restore (§8) — no es secreta, pero se guarda como secret por comodidad |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare dashboard → R2 → Manage API tokens |
| `R2_BUCKET` | Nombre del bucket R2 creado para backups, ej. `elmundotebusca-backups` |

### `.github/workflows/backup-database.yml`

```yaml
name: Respaldo diario (base de datos + fotos)

# Corre todos los dias a las 08:10 UTC (~04:10 hora Venezuela) y admite
# disparo manual desde la pestana Actions para probarlo sin esperar al cron.
on:
  schedule:
    - cron: "10 8 * * *"
  workflow_dispatch:

# Un respaldo a la vez; si el anterior sigue corriendo (no deberia pasar en
# un dump diario chico), no lo cancela, solo espera su turno.
concurrency:
  group: backup-database
  cancel-in-progress: false

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Herramientas (cliente de Postgres + age)
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client age

      - name: Fecha del respaldo (para nombrar los archivos)
        id: fecha
        run: echo "valor=$(date -u +%Y-%m-%d_%H%M%SZ)" >> "$GITHUB_OUTPUT"

      - name: Volcar solo el esquema "public" (datos de la app)
        env:
          PGCONNECT_TIMEOUT: "20"
        run: |
          # --schema=public: excluye a proposito los esquemas que administra
          # Supabase (auth, storage, extensions, graphql...). Ver docs/investigacion/
          # 02-backups-continuidad.md #5 sobre la limitacion de no incluir auth.users.
          pg_dump "${{ secrets.SUPABASE_DB_URL }}" \
            --schema=public \
            --no-owner --no-privileges \
            --format=plain \
            --file="db-${{ steps.fecha.outputs.valor }}.sql"
          gzip "db-${{ steps.fecha.outputs.valor }}.sql"

      - name: Cifrar el dump de la base con age (clave publica)
        run: |
          age -r "${{ secrets.BACKUP_AGE_PUBLIC_KEY }}" \
            -o "db-${{ steps.fecha.outputs.valor }}.sql.gz.age" \
            "db-${{ steps.fecha.outputs.valor }}.sql.gz"
          rm "db-${{ steps.fecha.outputs.valor }}.sql.gz"

      - name: Descargar el bucket "photos" completo
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.SUPABASE_S3_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.SUPABASE_S3_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: ${{ secrets.SUPABASE_S3_REGION }}
        run: |
          mkdir -p photos-backup
          aws s3 sync "s3://photos" ./photos-backup \
            --endpoint-url "${{ secrets.SUPABASE_S3_ENDPOINT }}" \
            --only-show-errors

      - name: Empaquetar y cifrar las fotos
        run: |
          tar czf "photos-${{ steps.fecha.outputs.valor }}.tar.gz" -C photos-backup .
          age -r "${{ secrets.BACKUP_AGE_PUBLIC_KEY }}" \
            -o "photos-${{ steps.fecha.outputs.valor }}.tar.gz.age" \
            "photos-${{ steps.fecha.outputs.valor }}.tar.gz"
          rm "photos-${{ steps.fecha.outputs.valor }}.tar.gz"
          rm -rf photos-backup

      - name: Subir a Cloudflare R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
        run: |
          aws s3 cp "db-${{ steps.fecha.outputs.valor }}.sql.gz.age" \
            "s3://${{ secrets.R2_BUCKET }}/db/db-${{ steps.fecha.outputs.valor }}.sql.gz.age" \
            --endpoint-url "$R2_ENDPOINT"
          aws s3 cp "photos-${{ steps.fecha.outputs.valor }}.tar.gz.age" \
            "s3://${{ secrets.R2_BUCKET }}/photos/photos-${{ steps.fecha.outputs.valor }}.tar.gz.age" \
            --endpoint-url "$R2_ENDPOINT"

      - name: Podar respaldos con mas de 30 dias
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
          R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
        run: |
          limite=$(date -u -d "30 days ago" +%Y-%m-%d || date -u -v-30d +%Y-%m-%d)
          for prefijo in db photos; do
            aws s3 ls "s3://${{ secrets.R2_BUCKET }}/$prefijo/" --endpoint-url "$R2_ENDPOINT" \
              | awk '{print $4}' | grep -E '^[a-z]+-[0-9]{4}-[0-9]{2}-[0-9]{2}' \
              | while read -r archivo; do
                  fecha_archivo=$(echo "$archivo" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')
                  if [[ "$fecha_archivo" < "$limite" ]]; then
                    aws s3 rm "s3://${{ secrets.R2_BUCKET }}/$prefijo/$archivo" --endpoint-url "$R2_ENDPOINT"
                  fi
                done
          done

      - name: Avisar si el job fallo
        if: failure()
        run: |
          echo "::error::El respaldo diario fallo. Revisa este log y, si el problema" \
               "persiste, avisa a quien administra Supabase y a quien administra R2."
```

> Nota sobre el paso de poda: usa `date -d` (GNU, Linux/GitHub Actions) con
> fallback a `date -v` (BSD/macOS) solo por si alguna vez se prueba el script
> en otra plataforma — en el runner `ubuntu-latest` real siempre toma la
> primera rama. Si prefieres simplicidad sobre robustez, se puede quitar el
> paso de poda entero al principio (30 días de dumps de esta base pesan poco
> y caben de sobra en los 10 GB gratis) y añadirlo más adelante.

---

## 7. Costo real de esta propuesta

| Componente | Costo |
|------------|-------|
| GitHub Actions (repo probablemente privado) | 2000 min/mes gratis en el plan Free de GitHub; este job tarda ~1-3 min/día ≈ 30-90 min/mes. **$0** |
| Cloudflare R2 (destino de los backups) | 10 GB gratis para siempre + 1M operaciones tipo A / 10M tipo B gratis/mes, **sin costo de salida (egress)**. Un año de dumps diarios de esta base (datos de texto, no fotos completas cada vez que se recomprimen) se mide en decenas–cientos de MB; el respaldo de fotos es la parte que más pesa, pero el bucket real `photos` hoy está lejos del límite de Storage de Supabase (1 GB en Free / 100 GB en Pro), así que el espejo en R2 tampoco se acerca a los 10 GB gratis en el corto/mediano plazo. **$0** mientras el proyecto esté en esa escala. |
| `age` (cifrado) | Software libre, sin costo. **$0** |
| **Total del workflow propuesto** | **$0/mes**, hasta que el volumen de fotos supere ~10 GB (momento en el que de todas formas ya se habría subido a Supabase Pro por capacidad, ver `COSTOS-Y-DESPLIEGUE.md`). |

Fuentes de precios: [Cloudflare R2 Pricing (oficial)](https://developers.cloudflare.com/r2/pricing/), contrastado con cobertura de 2026: [EgressCost.com — Cloudflare R2 Pricing 2026](https://egresscost.com/cloudflare/), [BudgetForge — Cloudflare R2 Pricing 2026](https://www.budgetforge.dev/tools/cloudflare-r2-pricing-2026); [GitHub Actions — Minutos incluidos por plan (oficial)](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions).

Comparado con **Backblaze B2** (alternativa evaluada, también S3-compatible,
10 GB gratis igual): la diferencia práctica para este caso es mínima, pero R2
gana porque ya hay cuenta de Cloudflare para el dominio/Turnstile — un panel
menos, una cuenta menos que darle acceso a quien administra esto.

---

## 8. Pasos exactos para quien administra Supabase (sin experiencia de DBA)

Esto asume que quien lee esto **no** es programador — son clics en paneles,
en orden, sin nada que "se pueda romper" si se sigue tal cual.

### Paso 1 — Confirmar el plan actual y activar backups nativos (5 minutos)

1. Entra a [supabase.com](https://supabase.com) → inicia sesión → abre el
   proyecto de "El Mundo Te Busca".
2. Menú izquierdo → **Database** → **Backups**.
   - Si arriba dice **"Upgrade to Pro to enable daily backups"** (o similar):
     el proyecto está en **Free**, sin backups. Ir al paso 2.
   - Si ya ves una lista de backups diarios con fechas: el proyecto ya está
     en Pro (o superior) y los backups **ya están activos** — no hace falta
     hacer nada más aquí. Solo confirma que la fecha del backup más reciente
     sea de ayer o de hoy (si es más vieja, algo se rompió y hay que
     avisarlo).
3. Si estaba en Free y quieres activar backups: menú izquierdo → **Project
   Settings** → **Billing** → **Change plan** → elige **Pro** ($25/mes,
   pide tarjeta). Al confirmar, los backups diarios (7 días) empiezan a
   generarse solos desde el día siguiente — no hay ningún botón extra que
   activar.

### Paso 2 — Crear las claves de acceso S3 para el respaldo de fotos (2 minutos)

1. Menú izquierdo → **Storage** → **Settings** (ícono de engranaje arriba, o
   pestaña "Settings" dentro de Storage).
2. Busca la sección **S3 Access Keys** → botón **New access key**.
3. Nómbrala algo como `backup-fotos-readonly`. Si el panel te deja elegir
   permisos, marca solo **lectura** (no necesita poder borrar ni subir).
4. Copia los tres valores que aparecen (**Access Key ID**, **Secret Access
   Key**, **Endpoint**/**Region**) y pégalos en un mensaje seguro (no por
   correo sin cifrar) a quien vaya a configurar el workflow de GitHub
   (§6) — son secretos que van a `GitHub → Settings → Secrets`, nunca al
   código.
   - **Importante**: la "Secret Access Key" solo se muestra una vez. Si se
     pierde, hay que crear otra.

### Paso 3 — Generar la clave de cifrado (una sola vez, la hace quien va a poder restaurar en el futuro)

Esto requiere una terminal, así que lo hace normalmente el desarrollador o
quien vaya a ser responsable de una eventual restauración — pero el paso en
sí es una sola vez y muy corto:

```bash
age-keygen -o clave-privada-backups.txt
```

Esto imprime una línea que empieza con `age1...` (es la **clave pública**,
va al secret `BACKUP_AGE_PUBLIC_KEY` de GitHub, no es sensible). El archivo
`clave-privada-backups.txt` es la **clave privada** — esa sí hay que
guardarla en un gestor de contraseñas (1Password, Bitwarden, etc.), **nunca**
en GitHub ni en el repo. Sin ese archivo, los backups cifrados en R2 no se
pueden abrir — es la única copia, no hay forma de recuperarla si se pierde.

### Paso 4 — Confirmar que el respaldo automático está corriendo

Una vez configurado el workflow (§6) por quien tiene acceso al repo de
GitHub: cada mañana debería aparecer un ✅ verde en
`github.com/<org>/<repo>/actions/workflows/backup-database.yml`. Si aparece
❌ rojo dos días seguidos, es una señal de que algo se rompió (contraseña de
base de datos rotada, clave S3 vencida, etc.) y hay que revisarlo antes de
que pase más tiempo sin respaldo real.

---

## 9. Hallazgos priorizados

| # | Hallazgo | Prioridad | Acción recomendada |
|---|----------|-----------|---------------------|
| 1 | No hay confirmación en el repo de qué plan de Supabase corre en producción ni de que los backups nativos estén activos (`CHECKLIST-INFRAESTRUCTURA.md` lo deja como pendiente) | **Alta** | Seguir §8 paso 1 hoy mismo |
| 2 | Si el proyecto sigue en plan Free, la base de datos no tiene ningún backup automático | **Alta** | Confirmar plan; si es Free, subir a Pro ($25/mes) o mínimo hacer exports manuales semanales mientras se implementa §6 |
| 3 | El bucket `photos` (fotos de personas, comentarios, mascotas) nunca está cubierto por ningún backup de Supabase, en ningún plan | **Alta** | Implementar el respaldo de Storage del workflow (§6), independiente del plan de Supabase que se use |
| 4 | No existe ningún script ni proceso de respaldo en el repo (`scripts/` solo tiene importadores) | **Alta** | Implementar `.github/workflows/backup-database.yml` (§6) |
| 5 | Quien administra Supabase no es quien desarrolla — cualquier paso de configuración debe ser instrucciones de clic, no de terminal | **Media** | Usar §8 tal cual para delegar los pasos de dashboard; los pasos de terminal (clave `age`, secrets de GitHub) los hace quien tenga el repo |
| 6 | PITR (recuperación al segundo) cuesta desde $100/mes adicionales, desproporcionado para el presupuesto actual del proyecto (~$25–45/mes total) | **Media** | No priorizar PITR ahora; el respaldo diario propio (RPO ~24h) es una relación costo/beneficio mucho mejor a esta escala |
| 7 | El respaldo propio (`public` schema) no cubre el esquema `auth` (cuentas de voluntarios/staff con login) | **Baja** | Documentado como limitación aceptada (§5 paso 9); en un desastre total sin backup nativo de Supabase, los usuarios re-registran su cuenta pero los datos de personas/ayuda/hospitales se recuperan completos |
| 8 | No hay runbook de recuperación escrito en ningún lado del repo | **Media** | Este documento cubre §5 (Ruta A: backup nativo, Ruta B: backup propio); vale la pena enlazarlo desde `CHECKLIST-INFRAESTRUCTURA.md` una vez implementado |

---

## Fuentes

- [Supabase Docs — Database Backups](https://supabase.com/docs/guides/platform/backups) (oficial)
- [Supabase Pricing](https://supabase.com/pricing) (oficial)
- [Supabase Docs — Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) (oficial)
- [Supabase Docs — S3 Compatibility (Storage)](https://supabase.com/docs/guides/storage/s3/compatibility) (oficial)
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) (oficial)
- [GitHub Actions — Billing / minutos incluidos](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions) (oficial)
- [supabase/storage#789 — Add Storage Backups in Sync with Database Backups](https://github.com/supabase/storage/issues/789) (issue abierto, confirma que no está resuelto)
- [GitHub Discussion supabase#6755 — Are back-ups created for storage?](https://github.com/orgs/supabase/discussions/6755)
- [SimpleBackups — How to Back Up Supabase Storage Buckets](https://simplebackups.com/blog/backup-supabase-storage)
- [scored.tools — Supabase Pricing: Free Tier vs Pro Plan 2026](https://scored.tools/blog/supabase-pricing-free-tier-vs-pro-plan-2026/)
- [selfhost.dev — Supabase Pricing Explained 2026](https://selfhost.dev/blog/supabase-pricing-explained/)
- [EgressCost.com — Cloudflare R2 Pricing 2026](https://egresscost.com/cloudflare/)
- [FiloSottile/age — herramienta de cifrado usada en el workflow](https://github.com/FiloSottile/age)

## Archivos del repo revisados para esta investigación

- `docs/CHECKLIST-INFRAESTRUCTURA.md` (§2 Supabase, §4 Backups)
- `docs/COSTOS-Y-DESPLIEGUE.md`
- `docs/GUIA-DESPLIEGUE.md`
- `docs/DESPLIEGUE-VPS.md`
- `docs/ESTADO-DEL-PROYECTO.md`
- `docs/HANDOFF-EQUIPO.md`
- `docs/INFORME-SEGURIDAD.md` (confirma uso real de Supabase Auth vía `auth.users`)
- `.github/workflows/deploy.yml` (convención de secrets/estructura reutilizada para el workflow propuesto)
- `.env.example`
- `scripts/` (confirmado: sin script de respaldo)
- `supabase/schema.sql` (lista de tablas del esquema `public` a respaldar)
