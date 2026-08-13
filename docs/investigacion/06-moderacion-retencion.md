# Moderación de contenido y retención de datos

Investigación de código real + fuentes externas. Fecha: 2026-08-12.
Prioridad de cada hallazgo: **Alta** (riesgo directo a personas o exposición legal),
**Media** (mejora significativa, no urgente), **Baja** (mejora incremental).

> Antecedente ya resuelto (no es hallazgo de esta investigación): en este mismo chat
> se corrigió `src/components/ComplaintCard.tsx`, que mostraba públicamente
> "Reportado por {nombre real}" en `/denuncias`. Ya no expone el nombre en la vista
> pública; el admin lo sigue viendo en `src/components/admin/AdminDashboard.tsx`
> para moderación. Se menciona aquí solo como contexto porque es el mismo dominio
> (denuncias) que trata el resto de este documento.

---

## 1. Filtro de contenido de imágenes (NSFW / violencia gráfica)

**Prioridad: Alta**

### Qué hay hoy (confirmado en código)

No existe ningún filtro de contenido de imágenes. Confirmado por `Grep` en todo
`src/` de términos como `nsfw`, `moderation`, `rekognition`, `sightengine`,
`clarifai`, `content-safety`, `explicit`: los únicos resultados son
`PostModerationStatus` (`src/lib/types.ts:314`) y el campo `moderationStatus`
(`pending|approved|rejected`) en `src/lib/data.ts`, que es la **cola de
aprobación de posts importados de redes sociales** (ingesta social por
hashtag → `/admin` → `/comunidad`), no un análisis de contenido de imágenes.
No inspecciona píxeles.

`src/lib/upload.ts` (`uploadPhoto`, cliente) solo valida:
- Tipo MIME permitido: `image/jpeg`, `image/png`, `image/webp` (líneas 12, 19-21).
- Tamaño máximo: 8 MB (línea 13, 22-24).
- Extensión derivada del MIME, no del nombre de archivo (línea 27), para evitar
  trucos con la extensión.
- Comentario explícito en el propio archivo (líneas 8-11): el control duro real
  está en el bucket de Supabase (`allowedMimeTypes` + `fileSizeLimit`) porque la
  clave `anon` permite subir directo desde el navegador.

Ninguno de esos controles examina **qué hay dibujado en la imagen**. Cualquier
persona sin cuenta puede adjuntar una foto a: ficha de persona desaparecida,
comentario, denuncia (`/denuncias`), punto de ayuda, caravana. No hay cola de
revisión previa ni bloqueo automático de contenido sexual explícito o violencia
gráfica antes de publicarse.

### Por qué importa en este proyecto concreto

El contexto agrava el riesgo normal de UGC: fotos de personas desaparecidas
(muchas veces menores), de heridos, de cadáveres tras un sismo, subidas por
desconocidos sin cuenta ni verificación. Una imagen NSFW o gráficamente
violenta adjunta a la ficha de un niño desaparecido, o a una denuncia, es un
daño directo e inmediato — no solo un problema de "políticas de la
plataforma".

### Opciones investigadas (WebSearch, agosto 2026) — costo real, no solo nombres

| Opción | Costo real | Notas |
|---|---|---|
| **OpenAI Moderation API** (`omni-moderation-latest`) | **Gratis**, sin cargo por request, para cualquier cuenta de API de OpenAI; acepta imagen + texto en la misma llamada. Aplican los límites de tasa estándar de la cuenta. | Es la opción más barata posible (gratis) y ya cubre texto + imagen en un solo endpoint — útil porque el proyecto también tiene texto libre en denuncias/comentarios/posts sin filtrar. Requiere cuenta de OpenAI (no Anthropic) solo para este endpoint. |
| **Google Cloud Vision — SafeSearch** | 1.000 unidades/mes gratis (no caduca mientras exista la oferta); sobre eso, si se combina con `label detection` en la misma llamada, SafeSearch es gratis; si se pide sola, tarifa estándar ≈ US$1,50/1.000 imágenes (baja a US$0,60-1,00/1.000 en volúmenes grandes). Google también da US$300 de crédito por 90 días a cuentas nuevas. | Buena opción intermedia si se prefiere no depender de OpenAI. |
| **AWS Rekognition — Content Moderation** | Free tier: 1.000 imágenes/mes gratis (primer año). Luego ≈ US$1,00/1.000 imágenes en el tramo base (baja a US$0,80/1.000 en volumen alto). Los "adaptadores" de moderación personalizados cuestan más (~US$1,20/1.000) — no se necesitarían aquí. | Similar en precio a Google; ecosistema AWS si en el futuro se usa S3/Lambda. |
| **Sightengine** | Plan gratuito ("free-forever") con cuota reducida; plan pagado desde US$29/mes con 10.000 operaciones incluidas, overage a US$0,002/operación. Detección de nudez es la operación "base" (1x); IA-generada cuesta 5x, liveness 10x. | Especializado en moderación (120+ clases: nudez, violencia, odio, etc.), pero para solo nudez/violencia el free tier o el plan de US$29/mes ya alcanza. Más caro que las nubes grandes en volumen bajo si se necesita el plan pagado. |
| **PixelAPI** | US$0,0005/imagen (según su propia página de marketing) — la mitad que AWS. | Proveedor más pequeño/menos establecido; no se pudo verificar independientemente su exactitud ni su continuidad a largo plazo — tratar con cautela para un proyecto crítico. |
| **Azure AI Content Safety** | 5.000 transacciones/mes gratis. | Otra alternativa gratuita competitiva si ya se usa Azure. |

**Recomendación concreta:** para el volumen de un proyecto sin fines de lucro
(no son millones de imágenes/mes), la opción más razonable es **OpenAI
Moderation API (`omni-moderation-latest`)** por ser gratuita sin límite de
gasto y cubrir imagen + texto en una sola llamada — encaja con Server Actions
existentes en `src/app/actions.ts` (llamar a la API justo después de
`hashFile`/antes de `revalidatePath`, y si el resultado marca la imagen como
insegura, guardarla igual pero con `moderationStatus: "pending"` — reusando el
patrón que ya existe para posts sociales — en vez de bloquear la publicación
por completo, para no frenar avisos legítimos urgentes por un falso positivo).
Como respaldo o si se prefiere no depender de OpenAI para esto, **Google
Cloud Vision SafeSearch** es la alternativa más barata con marca establecida.

No se encontró evidencia de descuentos "nonprofit" explícitos en ninguno de
estos proveedores en las búsquedas realizadas — se recomienda consultar
directamente si el volumen crece.

---

## 2. Duplicados por foto: hash exacto (SHA-256), no perceptual

**Prioridad: Media**

### Confirmado en código

- `src/lib/upload.ts` líneas 41-50 (`hashFile`, cliente): SHA-256 vía Web
  Crypto sobre los bytes crudos del archivo. Comentario explícito: "sirve para
  detectar el MISMO archivo repetido... no es reconocimiento facial ni un
  modelo de IA".
- `src/lib/data.ts` `findPersonDuplicates` (línea 740) compara por 3 vías:
  cédula normalizada, `photoHash` exacto (línea 755: `p.photoHash ===
  photoHash`), o 2+ palabras compartidas del nombre.
- `scripts/sync-legacy-sites/lib.mjs` líneas 44-68: mismo patrón en el
  importador — SHA-256 con `crypto.createHash("sha256")`, comentario en línea
  47 dice explícitamente "no un hash perceptual ni IA".

Es decir: **la misma foto exacta** (mismos bytes) se detecta como duplicado.
La misma foto **recortada, recomprimida, con marca de agua superpuesta,
redimensionada o reexportada a otro formato** produce un SHA-256 totalmente
distinto y **no se detecta** — el caso típico cuando una foto de una persona
desaparecida circula por WhatsApp/redes y se resube desde varias fuentes
(que es exactamente el escenario de esta plataforma, alimentada en parte por
ingesta social).

### Qué es un perceptual hash (pHash) — investigado con WebSearch

Un hash perceptual no compara los bytes del archivo sino una huella derivada
del contenido visual (típicamente reduciendo la imagen a escala de grises,
aplicando una DCT — transformada de coseno discreta — y codificando el patrón
de frecuencias resultante). Dos imágenes visualmente similares producen hashes
con poca distancia de Hamming (bits distintos) aunque sus bytes originales
sean completamente diferentes: 0-5 bits de diferencia ≈ prácticamente la misma
imagen; 6-15 ≈ comparten similitudes; 16+ ≈ probablemente distintas.

### Factibilidad de agregarlo — librerías npm reales

- **`sharp-phash`** (`npm i sharp sharp-phash`): implementación de pHash
  construida sobre `sharp` (que el proyecto probablemente ya usa o podría usar
  para `compressImage`, ver `CLAUDE.md` — confirmar si `sharp` ya es
  dependencia). Devuelve un hash de 64 bits comparable por distancia de
  Hamming.
- Alternativas encontradas: paquete `phash` (binding nativo, más pesado de
  instalar) y `phash-image`. `sharp-phash` es la opción más simple porque
  reutiliza `sharp`, ya pensado para procesamiento de imágenes en Node.

### Cómo encajaría en el patrón existente

Es un cambio de complejidad media, no trivial:
1. Añadir columna `photo_phash text` en `persons` (schema.sql) junto a la
   existente `photo_hash`.
2. Calcular el pHash **en servidor** (no en cliente como hoy `hashFile`,
   porque `sharp` es una dependencia de Node, no de navegador) — esto implica
   mover el cálculo del hash a la Server Action de `createPerson`/
   `updatePersonFields` en `src/app/actions.ts`, descargando la imagen ya
   subida a Storage y procesándola ahí, en vez de calcularlo en el cliente
   como hoy.
3. En `findPersonDuplicates` (`src/lib/data.ts:740`), añadir una comparación
   por distancia de Hamming contra los `photo_phash` existentes del mismo país
   (con un umbral, p. ej. ≤10 bits) además de la igualdad exacta de
   `photo_hash` que ya existe — no reemplaza el hash exacto (que es gratis y
   sin falsos positivos), lo complementa.
4. Comparar contra todas las personas de un país en memoria/SQL sin índice
   especializado es aceptable al volumen actual (cientos/miles de registros),
   pero no escala indefinidamente; no es necesario resolver eso ahora.

**Recomendación:** vale la pena para el caso de uso real de esta plataforma
(fotos resubidas desde WhatsApp/redes sociales), pero es una mejora de
prioridad media, no bloqueante — el hash exacto ya cubre el caso más común
(resubida accidental del mismo archivo) y el pHash añade cobertura para el
caso de reencuadre/recompresión sin ser crítico para salvar vidas hoy mismo.

---

## 3. Borrado de contenido: hard-delete inmediato, sin registro ni plazo

**Prioridad: Alta**

### Confirmado en código

Revisadas todas las funciones `delete*` en `src/lib/data.ts` invocadas desde
`src/app/actions.ts` (autor con token) y `src/app/admin/actions.ts`
(moderador/admin):

- `deletePerson` (`src/lib/data.ts:1116-1127`): `sb.from("persons").delete()`
  — DELETE SQL directo, sin softdelete ni columna `deleted_at`. También borra
  la foto en Storage (`deleteStoragePhoto`). Sin registro de auditoría de
  quién borró ni cuándo.
- `deleteComplaint` (línea 3250-3258): idéntico patrón — `DELETE` directo.
  Invocado por `deleteComplaintAction` en `src/app/admin/actions.ts:207-213`,
  con el comentario en el propio código: "solo el admin elimina las
  comprobadamente falsas" — pero el borrado es total e irreversible, no hay
  paso intermedio de "marcada como falsa" con retención temporal antes de la
  eliminación física.
- Mismo patrón exacto (`DELETE` sin rastro) en `deleteAidPoint`,
  `deleteMarch`, `deletePost`, `deletePet`, `deleteHero`, `deleteNewsItem`
  (líneas 1753, 2076, 3093, 3479, 3816, 3935 de `src/lib/data.ts`).

Revisado también el esquema (`supabase/schema.sql:406-424`, tabla
`complaints`): no tiene columna de estado tipo `status` (`activa/descartada`),
ni `deleted_at`, ni ninguna forma de marcar "descartada por falsa" antes de
borrarla; solo `category`, `body`, `author_name` (texto plano, sin
anonimizar), `supports`, `user_id`, `created_at`. No hay tabla de auditoría de
moderación en todo el esquema (`Grep` de `audit`, `log_` en `schema.sql` no
arroja resultados de una tabla de bitácora).

**Conclusión confirmada:** cero retención, cero registro histórico, cero
plazo de gracia. El moderador borra y el dato desaparece por completo en el
mismo instante, sin que quede rastro de que existió, quién lo reportó, ni por
qué se descartó. Esto es a la vez un riesgo de moderación (no hay forma de
auditar decisiones de moderador o revertir un borrado erróneo/malicioso) y,
como se ve abajo, deja a la plataforma sin ninguna política de retención de
datos personales que uno pueda mostrar si alguien pregunta "qué pasó con mi
denuncia" o ejerce un derecho de supresión.

---

## 4. Marco legal venezolano: habeas data y protección de datos personales

**Prioridad: Alta (fundamento de la recomendación de política, no una alerta de código)**

Investigado con WebSearch. Se reporta con honestidad el estado real: **no
existe en Venezuela una ley especial de protección de datos personales
vigente y comprensiva** (a diferencia de, por ejemplo, la Ley 1581 de 2012 de
Colombia, que sí es una ley orgánica completa con registro de bases de
datos, tratamiento de datos de menores, etc.). El marco venezolano descansa
sobre:

- **Artículo 28 de la Constitución de 1999**: toda persona tiene derecho de
  acceso a la información y a los datos que sobre sí misma o sus bienes
  consten en registros oficiales o privados, con las excepciones que
  establezca la ley, así como de conocer el uso que se haga de ellos y su
  finalidad, y de solicitar ante el tribunal competente la actualización, la
  rectificación o la destrucción de aquellos, si fuesen erróneos o afectasen
  ilegítimamente sus derechos. Puede además acceder a documentos de cualquier
  naturaleza que contengan información cuyo conocimiento sea de interés para
  comunidades o grupos de personas — este mecanismo se conoce como **habeas
  data**.
- **Artículo 60**: derecho a la protección del honor, vida privada, intimidad,
  propia imagen, confidencialidad y reputación; la ley limitará el uso de la
  informática para garantizarlos.
- **Sentencia TSJ/Sala Constitucional n.º 759 (21 de mayo de 2025)**: según
  la reseña de fuentes secundarias consultadas (no se pudo acceder
  directamente al texto en `historico.tsj.gob.ve` por un error de certificado
  TLS en la herramienta de búsqueda usada; la cita se basa en un resumen de
  tercero, `tugacetaoficial.com`, no en el texto primario verificado
  directamente — señalarlo así si esto se usa como fundamento formal) fijó
  que la **competencia** para conocer acciones de habeas data del artículo 28
  —incluyendo supresión, rectificación, confidencialidad, inclusión,
  actualización o uso correcto de datos en registros públicos o privados—
  corresponde a los tribunales municipales con competencia
  contencioso-administrativa del domicilio de quien reclama.
- **Sentencia TSJ/Sala Constitucional n.º 794/11 (2011, ya no reciente pero
  sigue siendo la referencia doctrinal más citada)**: según fuente secundaria
  consultada (`tugacetaoficial.com`, tampoco verificada contra el texto
  primario), reconoce un "derecho al olvido" para datos negativos (p. ej.
  crediticios) una vez subsanada la causa que los originó, con el criterio de
  que esos datos "no tienen vocación de perennidad"; y establece deber de
  confidencialidad sobre datos personales en manos de instituciones,
  prohibiendo su divulgación sin autorización escrita del titular.

**Honestidad sobre el estado de la legislación:** las búsquedas no
encontraron una ley especial de protección de datos personales vigente ni un
anteproyecto con estado legislativo activo y verificable para 2025-2026 (se
mencionan de forma dispersa un anteproyecto de ley de IA y un anteproyecto de
Ley Orgánica de Transparencia con disposiciones tangenciales sobre datos
personales, pero ninguno es una ley de protección de datos dedicada ni consta
que esté aprobada). En consecuencia, el fundamento legal disponible hoy es
**constitucional y jurisprudencial, no una ley especial con plazos y
sanciones detalladas** — cualquier política de retención que se redacte debe
apoyarse en el principio general de los artículos 28/60 ("los datos no tienen
vocación de perennidad" cuando ya no cumplen su finalidad, derecho a
solicitar destrucción de datos erróneos o que afecten ilegítimamente
derechos), no en una norma específica con un número de días fijado por ley —
ese número lo define la propia plataforma como buena práctica razonable, no
porque la ley lo exija literalmente.

Nota de alcance: la plataforma también opera en Colombia (`COUNTRIES` en
`src/lib/countries.ts`), donde sí existe una ley dedicada, la **Ley 1581 de
2012**, que desarrolla el derecho constitucional a conocer, actualizar y
rectificar información recogida en bases de datos, con protección reforzada
para datos de menores (tratamiento condicionado a no vulnerar sus derechos
fundamentales y a la autorización de representantes legales). Si el proyecto
formaliza una política de retención, conviene que sea unificada para ambos
países y que el límite lo fije el estándar más protector de los dos (que en
este caso es el colombiano), en vez de mantener dos políticas distintas por
país.

---

## 5. Propuesta concreta de política de retención

**Prioridad: Alta** (es barata de implementar y cierra la brecha más grave:
hoy no hay ninguna política, ni siquiera informal).

Dado que la ley venezolana no fija plazos específicos, se propone un
estándar razonable inspirado en el principio "los datos no tienen vocación de
perennidad" (sentencia 794/11) y en el hecho de que el propio README del
proyecto es explícito en que el propósito es salvar vidas, no acumular datos
personales indefinidamente:

1. **Denuncias (`complaints`) descartadas por falsas**: en vez del `DELETE`
   inmediato actual, introducir un estado intermedio (`status: 'descartada'`
   + `discarded_at timestamptz`) cuando el admin decide que es falsa. La
   denuncia deja de ser pública de inmediato (ya lo permite el patrón de
   `moderationStatus` que existe para posts), pero **se anonimiza a los 30
   días** (se recomienda 30, no un número mayor, porque no hay razón legítima
   para conservar una denuncia ya descartada como falsa más tiempo que el
   necesario para que el propio denunciado o un tercero pueda objetar la
   decisión): se sobrescribe `author_name`, `body` y `photo_url` con
   marcadores vacíos/genéricos, conservando solo metadatos no identificables
   (categoría, fecha, estado) para estadísticas agregadas, y **se borra
   físicamente a los 90 días** de la fecha de descarte. Esto requiere un job
   periódico (cron, igual que la ingesta social que ya corre cada 15 min en
   el VPS) que revise `discarded_at` y aplique la anonimización/borrado.
2. **Personas localizadas con vida o fallecidas confirmadas**: NO aplica
   borrado automático — al contrario del punto anterior, aquí el valor
   histórico/legal de que quede registro de que la persona fue encontrada
   (para la familia, para journalism, para archivo del desastre) pesa más que
   el derecho al olvido; se mantiene indefinidamente salvo solicitud expresa
   del propio afectado o de su familia vía habeas data (artículo 28), que se
   atiende manualmente por ahora (no hay volumen que justifique
   automatizarlo).
3. **Reportes de estado no verificados (`status_reports`) que quedan
   rechazados/no confirmados por semanas**: se recomienda anonimizar (quitar
   `reporterName`/`reporterPhone`) a los 60 días si nadie los verificó,
   porque son datos de contacto de terceros (el que reporta, no
   necesariamente la persona buscada) que pierden utilidad si el reporte
   nunca se validó.
4. **Fotos huérfanas en Storage** tras un `deletePerson`/`deletePost`/etc:
   confirmar que `deleteStoragePhoto` (usado ya en `deletePerson`, línea 1126)
   se llama consistentemente en **todas** las funciones de borrado — no se
   verificó una por una en esta pasada si `deletePost`, `deleteComplaint`,
   etc. también limpian su foto asociada en Storage; si no lo hacen, quedan
   imágenes huérfanas indefinidamente en el bucket público, lo cual es en sí
   mismo un problema de retención de datos (fotos de personas que ya nadie
   referencia pero siguen siendo accesibles por URL directa). Vale la pena
   una pasada de verificación rápida como tarea aparte.
5. **Registro mínimo de auditoría de moderación**: antes incluso de la
   anonimización con plazos, el hallazgo más barato de corregir es que hoy
   **no queda ningún rastro** de que un admin borró una denuncia o una
   persona — ni quién, ni cuándo, ni por qué. Se recomienda una tabla
   `moderation_log(id, entity_type, entity_id, action, actor, reason,
   created_at)` poblada por las Server Actions de borrado en
   `src/app/admin/actions.ts` antes de invocar el `delete*` correspondiente
   de `src/lib/data.ts`. Esto no es exigido explícitamente por ninguna norma
   citada arriba, pero es la base indispensable para poder decir, si alguien
   pregunta, "esto se borró el día X porque Y" — y es prácticamente gratis de
   añadir dado que el patrón `getSupabaseAdmin()` ya existe en cada función de
   borrado.

---

## Resumen de prioridades

| # | Hallazgo | Prioridad |
|---|---|---|
| 1 | Sin filtro de contenido de imágenes (NSFW/violencia) en ningún flujo de subida | **Alta** |
| 3 | Borrado hard-delete inmediato sin registro de auditoría ni plazo, en todas las entidades | **Alta** |
| 5 | No existe ninguna política de retención de datos, ni siquiera informal | **Alta** |
| 4 | Fundamento legal disponible pero solo constitucional/jurisprudencial, sin ley especial | Alta (contexto) |
| 2 | Duplicados por foto solo con hash exacto (SHA-256), sin pHash para recortes/recompresión | Media |
| 5.4 | Verificar que todas las funciones de borrado limpian también la foto en Storage | Media |

## Fuentes consultadas

- [Best Image Moderation APIs in 2026 — Eden AI](https://www.edenai.co/post/best-image-moderation-apis)
- [PixelAPI — Moderation API](https://pixelapi.dev/moderation-api)
- [Amazon Rekognition — pricing oficial AWS](https://aws.amazon.com/rekognition/pricing/)
- [Sightengine — pricing oficial](https://sightengine.com/pricing)
- [Google Cloud Vision — pricing oficial](https://cloud.google.com/vision/pricing)
- [OpenAI Moderation API — guía](https://www.eesel.ai/blog/openai-moderation-api)
- [OpenAI API pricing 2026 — resumen](https://www.finout.io/blog/openai-pricing-in-2026)
- [Perceptual Hashing en Node.js con Sharp](https://www.context.dev/blog/perceptual-hashing-in-node-js-with-sharp-phash-for-developers)
- [sharp-phash — npm](https://www.npmjs.com/package/sharp-phash)
- [pHash en NodeJS — comparación por distancia de Hamming](https://ssojet.com/hashing/phash-in-nodejs)
- [Jurisprudencia vinculante sobre protección de datos personales en Venezuela — resumen de sentencias TSJ (fuente secundaria, texto primario no verificado por error de certificado TLS)](https://tugacetaoficial.com/jurisprudencia/jurisprudencia-vinculante-sobre-derecho-a-la-proteccion-de-datos-personales-en-venezuela/2/)
- [Sentencia TSJ Sala Constitucional n.º 759, 21 mayo 2025 — texto primario (no accesible por error de certificado durante la investigación)](https://historico.tsj.gob.ve/decisiones/scon/mayo/343949-0759-21525-2025-25-0195.HTML)
- [Introducción a la Protección de Datos en Venezuela: El Habeas Data](https://datalawrd.com/introduccion-a-la-proteccion-de-datos-en-venezuela-el-habeas-data/)
- [Ley 1581 de 2012 (Colombia) — Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=49981)
