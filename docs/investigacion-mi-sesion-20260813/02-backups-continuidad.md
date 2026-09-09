# Continuidad de datos y disaster recovery

> Investigación pura — no se tocó código. Pregunta que responde: *si algo
> corrompe la base de datos, o alguien borra algo por error (o con mala
> intención), ¿hay forma de recuperarlo?* Para este proyecto la respuesta no
> es teórica: los registros de personas desaparecidas **no se pueden
> reconstruir** si se pierden — no hay una fuente secundaria de la que volver
> a sacarlos.

## Resumen ejecutivo

**Hoy no está confirmado que existan backups automáticos** — `docs/CHECKLIST-INFRAESTRUCTURA.md`
lo deja como casilla pendiente de verificar en el dashboard, no como hecho
comprobado, y ninguna otra parte del repo documenta el plan de Supabase
activo. Si el proyecto sigue en el plan **Free**, hoy mismo hay **cero
backups automáticos y cero Point-in-Time Recovery**: un `DELETE` sin `WHERE`,
un bug en una Server Action, o un atacante con la `service_role key` filtrada
borra datos de forma **irreversible**. **Recomendación #1, urgente, antes que
cualquier otra cosa de este documento**: entra HOY al dashboard de Supabase
→ *Database → Backups* y confirma qué plan corre; si es Free, la acción de
menor esfuerzo y mayor impacto es activar **hoy mismo** el workflow de
GitHub Actions con `pg_dump` diario hacia este mismo repo en **modo
privado** (gratis, 15 minutos de trabajo, ver §3) mientras se decide si
vale la pena pagar los $25/mes del plan Pro. Las fotos (Storage) nunca están
cubiertas por los backups de Postgres, plan que sea — necesitan su propio
respaldo aparte (§2). Ninguno de estos backups sirve de nada sin haber
practicado alguna vez el restore (§4): un backup que nunca se probó a
restaurar es una hipótesis, no una garantía.

---

## 1. Planes de Supabase y backups (2026)

Precios y cobertura verificados contra `supabase.com/pricing` y
`supabase.com/docs/guides/platform/backups` (agosto 2026):

| Plan | Precio | Backups diarios automáticos | Retención | PITR |
|---|---|---|---|---|
| **Free** | $0 | ❌ No incluidos | — | ❌ No disponible |
| **Pro** | $25/mes | ✅ Sí | 7 días | Add-on: **$100/mes** por ventana de 7 días (necesita compute add-on mínimo "Small", que ya suma costo aparte) |
| **Team** | $599/mes | ✅ Sí | 14 días | Add-on: mismo esquema — $100/mes (7 días), ~$200/mes (14 días), ~$400/mes (28 días) |
| **Enterprise** | A medida | ✅ Sí | 30 días | Ventanas >28 días solo aquí |

Puntos que importan para este proyecto:

- **En Free no hay red de seguridad de ningún tipo.** El único respaldo es el
  que tú mismo generes (§3). Esto es importante porque `docs/COSTOS-Y-DESPLIEGUE.md`
  describe el arranque en "$0–1/mes" como la ruta normal — es decir, es
  plausible que el proyecto, ya publicado y con datos reales de personas
  desaparecidas, esté corriendo sin ningún backup automático ahora mismo.
- **Pro ($25/mes) ya cubre lo esencial**: un backup diario completo con 7
  días de retención cubre el escenario más común ("alguien borró algo ayer
  o anteayer y no nos dimos cuenta hasta hoy"). Para este proyecto, dado el
  valor irremplazable de los datos, los $25/mes son baratos comparado con el
  riesgo — es la recomendación de fondo, no solo el parche de emergencia.
- **PITR (Point-in-Time Recovery)** permite restaurar a un minuto exacto
  (RPO de ~2 minutos) en vez de al snapshot de la noche anterior. Es la
  diferencia entre "perder hasta 24h de datos" (backup diario) y "perder
  minutos" (PITR). A $100/mes adicionales sobre Pro, es una mejora real pero
  no la prioridad inmediata — el backup diario de Pro ya resuelve el 90% del
  riesgo (corrupción/borrado accidental) a una fracción del costo. Vale la
  pena revisarlo más adelante si el volumen de registros nuevos por día
  crece mucho (perder un día entero de reportes de personas sería grave en
  medio de la emergencia activa).
- El restore desde el dashboard **deja el proyecto inaccesible durante el
  proceso** (tiempo de caída proporcional al tamaño de la base) — para una
  base de esta escala (miles de filas, no millones) debería ser cuestión de
  minutos, pero es downtime real, no instantáneo.

**Prioridad: Alta.** Confirmar el plan activo hoy; si es Free, decidir en
esta misma sesión si se sube a Pro ($25/mes) o se cubre con el script
manual del §3 como puente.

---

## 2. Backup del bucket de Storage (fotos)

**Hecho clave, poco intuitivo:** los backups de Supabase (en cualquier
plan, incluido Enterprise) **cubren solo Postgres**. Los archivos reales
del bucket `photos` (las fotos de personas desaparecidas, subidas vía
`compressImage` → `uploadPhoto` según `CLAUDE.md`) **no están incluidos** —
el backup de la base de datos solo guarda los metadatos de la tabla interna
`storage.objects` (qué archivo existe, su ruta), no los bytes de la imagen
en sí. Si el bucket se borra o corrompe, un restore de base de datos deja
las filas de `persons.photo_url` apuntando a URLs que ya no existen.

### Opción recomendada: sync periódico a un proveedor S3-compatible externo

Supabase Storage expone una **API compatible con S3** (Dashboard → *Storage
→ S3 Access*, genera Access Key ID + Secret + endpoint
`https://<project-ref>.supabase.co/storage/v1/s3`). Eso permite usar
herramientas estándar (`rclone`, `aws s3 sync`) para copiar el bucket
completo a otro proveedor, **en otra nube o región** (importante: Supabase
corre sobre AWS; si el backup queda en la misma nube/región y hay un
incidente regional, el respaldo también podría quedar inalcanzable).

Ejemplo con AWS CLI (funciona igual con `rclone` configurando un remote):

```bash
aws configure --profile supabase
# Access Key / Secret que generaste en Storage > S3 Access
# Region: la de tu proyecto (ej. us-east-1)

aws s3 sync s3://photos ./backup/storage/photos \
  --endpoint-url https://TU-PROYECTO.supabase.co/storage/v1/s3 \
  --profile supabase
```

Para automatizarlo con destino a almacenamiento externo barato:

- **Backblaze B2**: ~$6/TB/mes de almacenamiento (~$0,006/GB/mes), primeros
  10 GB gratis, egress gratis hacia Cloudflare (Bandwidth Alliance).
- **Cloudflare R2**: ~$0,015/GB/mes de almacenamiento, **sin costo de
  egress** (importante si algún día hay que restaurar todo el bucket — no
  paga de más por sacarlo).

Con el volumen actual del proyecto (fotos comprimidas a WebP ~100–200 KB
cada una, cientos o pocos miles de personas registradas), el bucket entero
pesa unos pocos GB — el costo de respaldarlo en B2 o R2 es de **centavos al
mes**, prácticamente gratis. El costo real a vigilar es el **egress de
Supabase** al hacer el `sync` (cuenta como tráfico saliente): Free incluye
5 GB/mes, Pro incluye 250 GB/mes — de sobra para un sync incremental diario
de un bucket de pocos GB (solo se transfieren los archivos nuevos/cambiados,
no el bucket entero cada vez, porque `sync` compara y solo copia diffs).

**Cómo automatizarlo**: un cron job diario (o el mismo workflow de GitHub
Actions del §3, en un job separado) que corra el `aws s3 sync` de arriba.
Si se automatiza en el VPS (que ya tiene `crontab` en uso según
`docs/DESPLIEGUE-VPS.md` §6-7), sumar una entrada más siguiendo el mismo
patrón de "agregar sin reemplazar" que ya usan ahí.

**Prioridad: Alta.** Las fotos de personas desaparecidas son, junto con el
nombre y la ubicación, el dato más crítico para identificar a alguien — y
es justo el dato que el backup estándar de Supabase **no** cubre. Costo
estimado: **menos de $1/mes** en almacenamiento externo al volumen actual.

---

## 3. Backup manual/scriptable de bajo costo (plan Free o como capa extra en Pro)

### Qué hacer: `pg_dump` vía GitHub Actions + repo privado

Supabase documenta oficialmente este patrón
(`supabase.com/docs/guides/deployment/ci/backups`). El workflow oficial:

- Se dispara por `schedule` (cron) — el ejemplo de Supabase usa
  `0 0 * * *` (diario a medianoche UTC) — más `workflow_dispatch` para
  correrlo a mano.
- Usa la CLI de Supabase (no `pg_dump` directo) porque filtra los schemas
  internos de Supabase y evita errores de permisos al restaurar:
  ```bash
  supabase db dump --db-url "$SUPABASE_DB_URL" -f roles.sql --role-only
  supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
  supabase db dump --db-url "$SUPABASE_DB_URL" -f data.sql --data-only --use-copy
  ```
- Commitea los 3 archivos con `stefanzweifel/git-auto-commit-action@v4`.
- **Advertencia explícita de Supabase, repetida dos veces en su propia
  documentación: nunca hagas esto contra un repositorio público** — los
  dumps contendrían cédulas, teléfonos, correos y ubicaciones de personas
  reales. Para este proyecto es no-negociable: el repo de backups (sea el
  mismo `Elmundotebusca` privado o uno aparte) debe ser **privado**, y
  además conviene cifrar el dump antes de commitear (ej. `gpg -c` con una
  passphrase guardada aparte) porque cualquier colaborador con acceso al
  repo vería datos sensibles de personas en texto plano en el historial de git.

### Ejemplo concreto adaptado a este proyecto

`.github/workflows/db-backup.yml` (nuevo archivo, no existe hoy — el repo
ya tiene `.github/workflows/deploy.yml` para el despliegue):

```yaml
name: Backup Supabase DB

on:
  schedule:
    - cron: '0 6 * * *'   # diario, 06:00 UTC (~02:00 hora VE)
  workflow_dispatch: {}

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Dump roles, schema y datos
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          mkdir -p backups
          supabase db dump --db-url "$SUPABASE_DB_URL" -f backups/roles.sql --role-only
          supabase db dump --db-url "$SUPABASE_DB_URL" -f backups/schema.sql
          supabase db dump --db-url "$SUPABASE_DB_URL" -f backups/data.sql --data-only --use-copy
      - name: Cifrar antes de subir (contiene PII de personas desaparecidas)
        run: |
          tar czf backups.tar.gz backups/
          gpg --batch --yes --passphrase "${{ secrets.BACKUP_GPG_PASSPHRASE }}" -c backups.tar.gz
          rm -rf backups backups.tar.gz
      - name: Commit al repo (privado)
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "backup: dump automático de Supabase ${{ github.run_id }}"
          file_pattern: backups.tar.gz.gpg
```

Notas sobre este ejemplo:
- `SUPABASE_DB_URL` es la connection string de **Session pooler** (puerto
  6543) del dashboard (*Project Settings → Database*), guardada como
  secret del repo — nunca en el código.
- Como cada corrida sobrescribe/agrega un `.gpg` distinto, conviene un paso
  extra que borre backups de más de N días (o dejar que el historial de git
  crezca, que también sirve como "múltiples puntos de restauración" —
  ventaja sobre el backup diario de Supabase Pro, que solo guarda 7 días).
- Frecuencia recomendada: **diaria** es suficiente para este proyecto —el
  volumen de altas nuevas por día no es tan alto como para justificar más
  frecuencia todavía, y así se mantiene simple.

Alternativas ya empaquetadas si no se quiere mantener el workflow propio:
`mjnexgen/supabase-database-backup` y `mxschmitt/pg-backup-scheduler` en
GitHub hacen lo mismo con Docker, mencionados explícitamente como
"para usuarios de Supabase que quieren evitar el costo de los backups
premium".

**Prioridad: Alta si el proyecto está en Free** (es la única red de
seguridad posible). **Prioridad: Media si ya se pagó Pro** (sigue
valiendo la pena como segunda copia independiente, fuera de la
infraestructura de Supabase — protege también contra el escenario "la
cuenta de Supabase se suspende/compromete", no solo "error humano en los
datos").

---

## 4. Runbook de recuperación

Procedimiento concreto para este proyecto (Next.js + Supabase, capa de
datos en `src/lib/data.ts`), no genérico:

### Escenario A: se borró/corrompió un subconjunto de filas (ej. un bug en una Server Action, un DELETE mal filtrado)

1. **No tocar nada más** en `/admin` ni en la base — cada escritura nueva
   hace más difícil separar "lo bueno" de "lo dañado" en un restore parcial.
2. Si hay PITR activo: Dashboard → *Database → Backups → Point in Time* →
   elegir el timestamp justo antes del incidente (revisar logs de
   `postgres_logs` en el dashboard para acotar la hora exacta si se puede).
3. Si no hay PITR pero sí backup diario (Pro): Dashboard → *Database →
   Backups* → restaurar el snapshot más reciente **anterior** al incidente
   — implica perder todo lo escrito legítimamente entre ese snapshot y
   ahora (personas nuevas registradas, comentarios, votos). Antes de
   confirmar, considerar restaurar a un **proyecto nuevo aparte** (si el
   plan lo permite) para poder comparar y extraer manualmente solo las filas
   perdidas, en vez de perder todo lo escrito después.
4. Si solo hay el dump manual del §3: descargar el `.gpg` más reciente del
   repo de backups, descifrar (`gpg -d`), y restaurar con:
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "<connection string del proyecto Supabase>"
   ```
   `session_replication_role = replica` desactiva triggers durante la carga
   (evita, por ejemplo, doble-procesamiento de columnas generadas como
   `search_doc`). Esto restaura a un estado de un día atrás como máximo
   (según cuándo corrió el cron) — igual que el punto 3, mejor hacerlo
   primero contra un proyecto Supabase temporal para extraer solo lo
   necesario si es posible.
5. Después de restaurar: correr `supabase/schema.sql` de nuevo si el
   restore no incluyó las últimas migraciones del esquema (el archivo tiene
   `alter table ... add column if not exists` idempotentes para esto).
6. Avisar en `/admin` o donde corresponda si hubo pérdida real de reportes
   entre el snapshot y el incidente — en un registro de personas
   desaparecidas, un reporte perdido puede ser la única pista que tenía una
   familia; vale la pena un aviso público pidiendo que se vuelva a publicar
   si el usuario reconoce su propio caso desaparecido.

### Escenario B: se borró/corrompió el bucket de Storage (fotos)

1. Restaurar desde el respaldo externo (§2, Backblaze B2/R2) con
   `aws s3 sync` en sentido inverso:
   ```bash
   aws s3 sync ./backup/storage/photos s3://photos \
     --endpoint-url https://TU-PROYECTO.supabase.co/storage/v1/s3 \
     --profile supabase
   ```
2. Si el restore de Postgres del Escenario A ya pasó, las URLs en
   `persons.photo_url` deberían volver a resolver solas en cuanto el bucket
   tenga los archivos de vuelta (las rutas no cambian).
3. Si no había respaldo externo del bucket (plan Free sin §2 implementado):
   **las fotos son irrecuperables.** Este es exactamente el motivo por el
   que el §2 es prioridad Alta, no opcional.

### Escenario C: token de `ADMIN_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` comprometido y usado para borrar en masa

1. Rotar inmediatamente la `service_role key` desde *Project Settings →
   API* (invalida la key filtrada al instante) y el `ADMIN_TOKEN` en el
   `.env` del VPS.
2. Aplicar el Escenario A para el restore de datos.
3. Revisar `postgres_logs`/`Auth Logs` en el dashboard para confirmar el
   alcance real del daño antes de decidir cuánto restaurar.

**Prioridad: Alta.** Un runbook no probado no es un runbook — vale la pena,
una vez exista al menos el backup del §3, hacer un simulacro real: crear un
proyecto Supabase de prueba, restaurar ahí un dump, y confirmar que el
proceso completo funciona antes de necesitarlo de verdad.

---

## 5. Precedentes: qué hacen otros registros de personas desaparecidas

- **Google Person Finder** (creado tras Haití 2010, reactivado en más de
  20 desastres desde entonces, con más de 660.000 registros acumulados
  históricamente): su aporte de diseño no fue backup técnico sino
  **evitar la fragmentación** — antes de Person Finder, cada organización
  (gobierno, ONG, medios) montaba su propio sitio de "personas buscadas"
  tras un desastre, y las familias tenían que buscar en decenas de sitios
  distintos sin forma de cruzar datos. Person Finder resolvió eso con un
  **formato común de intercambio (PFIF - Person Finder Interchange
  Format)** para importar/exportar entre registros. **Lección aplicable
  aquí**: el propio proyecto ya tiene la pieza equivalente
  (`scripts/import-data.mjs`, pensado para "exports autorizados" de otra
  plataforma/Cruz Roja/Protección Civil) — es la misma filosofía de no
  depender de una sola fuente de verdad. Vale la pena, simétricamente, tener
  también un **export** en el mismo formato para que otra organización
  pueda absorber estos datos si este proyecto deja de operar — hoy el repo
  solo tiene el import, no el export inverso (ver §6).
- **ICRC Family Links / Restoring Family Links Network**: no es un sistema
  único centralizado sino una **red de 192 Sociedades Nacionales** más el
  ICRC, cada una con sus propios registros, coordinados mediante el
  proyecto "Missing Persons Digital Matching" que cruza coincidencias
  *sin* centralizar todos los datos en una sola base. La redundancia viene
  de la **descentralización institucional**, no de un backup técnico
  documentado públicamente (no se encontró documentación técnica pública
  sobre sus backups internos — es información operativa que el ICRC no
  publica, razonablemente, dado lo sensible del dato).
- **Terremoto Turquía-Siria 2023**: el problema documentado ahí **no fue
  pérdida técnica de una base de datos**, sino **fragmentación y falta de
  actualización institucional** — un año después las autoridades seguían
  sin poder dar una cifra confiable de desaparecidos (bajaron la cifra
  oficial de 297 a 75 mientras familias y organismos de derechos humanos
  sostenían que era mucho mayor). La lección para este proyecto no es sobre
  backups de infraestructura sino sobre **gobernanza del dato**: sin un
  proceso claro de quién actualiza el estado de una persona y cuándo se
  considera "cerrado" un caso, los números se vuelven no confiables aunque
  la base de datos en sí nunca se haya corrompido. El proyecto ya mitiga
  esto con el patrón de "autoridad" documentado en `CLAUDE.md` (solo el
  autor con token o un moderador cambia el estado oficial) — es la decisión
  de diseño correcta frente a este precedente.

**Conclusión de esta sección**: no se encontró ningún caso público
documentado de un registro civil de desaparecidos que haya **perdido
técnicamente** su base de datos por falta de backup — los fallos
documentados en desastres reales son de **coordinación y actualización**,
no de "se borró el disco". Eso no significa que el riesgo técnico no
exista para este proyecto (que corre en infraestructura mucho más modesta
que Google o el ICRC); significa que además del backup técnico, vale la
pena vigilar lo mismo que falló en Turquía: que el estado de cada persona
se mantenga actualizado y que no queden casos "abandonados" sin resolución
visible.

**Prioridad: Baja** (no es una acción técnica inmediata, es una nota de
diseño/proceso a tener presente).

---

## 6. Exportación periódica como red de seguridad adicional

Se revisó `scripts/` completo. Existe:

- `scripts/import-data.mjs` — importa un JSON/CSV de personas **hacia**
  Supabase (exports autorizados de terceros). No exporta.
- `scripts/import-aid-points.mjs` — mismo patrón, para puntos de ayuda.
- `scripts/backfill-estado.mjs` — script de migración de datos existentes,
  no de backup.
- `scripts/fetch-social-posts.mjs` — ingesta de redes sociales, no
  relacionado.
- `scripts/sync-legacy-sites/` — sincroniza contenido de otros sitios
  hacia este proyecto (dirección inversa a un backup).

**No existe hoy ningún script de exportación/backup en el repo.** Toda la
"salida" de datos del proyecto depende de acceder directamente a Supabase.

### Recomendación: sí, vale la pena un export diario adicional a JSON

Independientemente del §3 (que ya cubre el `pg_dump` completo), un export
diario en **JSON legible** de la tabla `persons` (y opcionalmente
`aid_points`, `hospitals`) aporta algo que el dump SQL no da tan fácil:

- Es **legible por humanos** sin levantar Postgres — útil en una emergencia
  real si hay que entregarle rápido una lista a Protección Civil/Cruz Roja
  sin depender de tener acceso al dashboard de Supabase en ese momento.
- Es el **mismo formato que ya consume `scripts/import-data.mjs`** — si
  este proyecto necesitara migrar a otra plataforma (o cederle los datos a
  una organización con más recursos, escenario nada descabellado para un
  proyecto ciudadano sin fines de lucro), el export ya queda listo para
  importarse en otro lado sin trabajo extra de transformación.
- Es una **tercera copia independiente**, en un formato distinto (no SQL),
  lo que reduce la chance de que un mismo bug de tooling corrompa las tres
  copias a la vez.

Implementación mínima (script nuevo, ej. `scripts/export-persons.mjs`,
mismo patrón que `import-data.mjs` pero a la inversa): `select *` sobre
`persons` con el `service_role key`, `JSON.stringify` a un archivo con
fecha en el nombre, subido al mismo repo privado de backups del §3 (mismo
job de GitHub Actions, un paso más) o a la misma cuenta de B2/R2 del §2.

**Prioridad: Media.** No sustituye al `pg_dump` (que es la fuente de
verdad completa, con todas las tablas y relaciones), pero es barato de
agregar (reutiliza el mismo cron ya propuesto en el §3) y da una capa de
legibilidad/portabilidad que vale la pena para un proyecto de este tipo.

---

## Plan de acción priorizado (resumen)

| # | Acción | Prioridad | Costo | Esfuerzo |
|---|---|---|---|---|
| 1 | Confirmar plan de Supabase activo en el dashboard | Alta | $0 | 2 min |
| 2 | Si es Free: montar el workflow de GitHub Actions con `pg_dump` diario cifrado (§3) | Alta | $0 | ~1 hora |
| 3 | Evaluar subir a Supabase Pro ($25/mes) por backups diarios + posibilidad de PITR más adelante | Alta | $25/mes | 5 min |
| 4 | Sync diario del bucket `photos` a Backblaze B2 o Cloudflare R2 (§2) | Alta | <$1/mes | ~1–2 horas |
| 5 | Practicar un restore real una vez (proyecto Supabase de prueba) | Alta | $0 | ~1 hora |
| 6 | Agregar export diario a JSON de `persons`/`aid_points` (§6) | Media | $0 (reusa el cron) | ~30 min |
| 7 | Revisar PITR ($100/mes extra) si el volumen de altas diarias crece mucho | Baja/Media (a futuro) | $100/mes | 5 min |

---

## Fuentes

- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase Docs — Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Docs — Automated backups using GitHub Actions](https://supabase.com/docs/guides/deployment/ci/backups)
- [Supabase Docs — Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
- [Supabase Docs — Configure S3 Storage](https://supabase.com/docs/guides/self-hosting/self-hosted-s3)
- [SimpleBackups — How to Back Up Supabase Storage Buckets (With Script)](https://simplebackups.com/blog/backup-supabase-storage)
- [SimpleBackups — How to Back Up Your Supabase Postgres Database](https://simplebackups.com/blog/backup-supabase-postgres)
- [SimpleBackups — Cross-Region Supabase Backup for Compliance](https://simplebackups.com/blog/cross-region-supabase-backup-compliance)
- [Mansueli — Creating Supabase Backups with GitHub workflows](https://blog.mansueli.com/creating-supabase-backups-with-github-workflows)
- [Mansueli — Using GitHub Actions for Backing Up Supabase Storage Objects](https://blog.mansueli.com/how-to-use-github-actions-for-backing-up-supabase-storage-objects)
- [GitHub — mjnexgen/supabase-database-backup](https://github.com/mjnexgen/supabase-database-backup)
- [GitHub — mxschmitt/pg-backup-scheduler](https://github.com/mxschmitt/pg-backup-scheduler)
- [GitHub Discussion — Are back-ups created for storage?](https://github.com/orgs/supabase/discussions/6755)
- [nesin.io — How to backup and restore Supabase Postgres database](https://nesin.io/blog/backup-restore-supabase-postgres-database)
- [Google Person Finder — Grokipedia](https://grokipedia.com/page/Google_Person_Finder)
- [ICRC — Missing Persons Platform: Tracing and Registration Services](https://missingpersons.icrc.org/search-process/tracing-and-registration)
- [ICRC — Restoring Family Links (Wikipedia)](https://en.wikipedia.org/wiki/Restoring_Family_Links)
- [Turkish Minute — Turkey still unable to track people lost or disabled in 2023 earthquakes after a year](https://turkishminute.com/2024/01/26/turkey-still-unable-to-track-people-lost-or-disabled-in-2023-earthquakes-after-a-year/)
- [Turkish Minute — Two years on, families struggle with the unknown fate of missing earthquake victims](https://turkishminute.com/2025/02/06/two-years-on-families-struggle-with-the-unknown-fate-of-missing-earthquake-victims/)
