# Investigación: moderación de contenido y retención de datos

> Documento de investigación. **No se tocó código.** Cubre: moderación automática de
> imágenes (precios reales), dónde integrarla en el flujo actual, la cola de posibles
> duplicados ya existente y cómo abaratarla con pHash, retención/borrado de datos bajo
> el marco venezolano vigente, y protección de quien denuncia en `/denuncias`.

## Resumen ejecutivo

El sitio ya en vivo sube fotos e info de terceros sin cuenta obligatoria (excepto
denuncias) y **no tiene ningún filtro automático de imágenes**: solo tipo/tamaño de
archivo (`upload.ts`) y compresión que borra EXIF (`image.ts`), nada que detecte
NSFW/violencia gráfica. La opción más barata y realista con presupuesto cero es
**NSFWJS client-side** (gratis, MIT, corre en el navegador de quien publica) como
primer filtro, reforzado por revisión humana en `/admin` — nunca confiar solo en el
cliente porque es evadible. La cola de "posible duplicado" (`src/lib/data.ts`,
`findPersonDuplicates`) ya funciona por cédula, nombre parecido y **hash SHA-256
exacto de la foto** (detecta el mismo archivo, no fotos recortadas/comprimidas
distintas); añadir **pHash** (hash perceptual) es la mejora barata pendiente. Venezuela
no tiene ley de protección de datos dedicada, pero sí un mecanismo constitucional
(habeas data, art. 28) reforzado por una sentencia del TSJ de mayo 2025 que reconoce el
"derecho al olvido" — recomiendo purgar denuncias/reportes descartados por moderador a
los 30 días (soft-delete) con un job periódico. `/denuncias` hoy **no es anónimo**: el
nombre de cuenta de quien denuncia se muestra públicamente en cada tarjeta, lo cual es
un riesgo de represalias que merece atención Alta.

---

## 1. Moderación automática de imágenes: comparación de opciones (precios 2025-2026)

| Opción | Tipo | Precio | Notas |
|---|---|---|---|
| **NSFWJS** (TensorFlow.js) | Open-source, client-side | **Gratis** (MIT), sin límite, sin llamadas de red | 90-93% de exactitud según el modelo (`mobilenet_v2_mid`/`inception_v3`); corre en el navegador de quien publica, sin servidor propio. Repo: `infinitered/nsfwjs`. |
| **Google Cloud Vision — SafeSearch Detection** | API en la nube | Primeras 1.000 unidades/mes **gratis**; luego ≈ **US$1,50 por 1.000 imágenes** (gratis si se combina con Label Detection) | Precio exacto sujeto a cambio, verificar en `cloud.google.com/vision/pricing` al integrar. Detecta adult/violence/racy/medical/spoof con 5 niveles de confianza. |
| **AWS Rekognition — DetectModerationLabels** | API en la nube | Free Tier: 5.000 imágenes/mes el primer año; luego **US$0,001/imagen** (tier 1, hasta 1M/mes) | El más barato de las 3 nubes a partir del mes 13. Baja aún más por volumen ($0,0008 → $0,0006 → $0,00025). |
| **Azure AI Content Safety** | API en la nube | **5.000 análisis de imagen/mes gratis** (tier F0); luego **US$0,75 por 1.000 imágenes** (tier S0) | El tier gratis mensual recurrente (no solo 12 meses como AWS) lo hace competitivo para un sitio de tráfico bajo/medio. |

### Recomendación (prioridad Alta)

Para presupuesto cero, en este orden:

1. **NSFWJS client-side, ahora mismo, sin costo.** Es la única opción realmente gratis
   sin límite de imágenes. Se ejecuta en `compressImage()` o justo después, antes de
   `uploadPhoto()`. Bloquea o marca antes de gastar ancho de banda/almacenamiento en
   Supabase Storage — importante porque el bucket es público y cualquiera puede subir
   directo con la clave anon (nota ya en `upload.ts`).
2. **Azure Content Safety como red de seguridad server-side**, dentro del free tier
   (5.000 imágenes/mes gratis, recurrente todos los meses — no solo el primer año como
   AWS). Con el volumen actual del sitio (miles, no millones, de fotos/mes) es
   plausible quedarse siempre dentro del tier gratis. Si se supera, el costo es bajo
   ($0,75/1.000).
3. Si el volumen crece mucho, migrar la pieza server-side a **AWS Rekognition**
   (más barato en volumen alto: $0,001/imagen vs $0,00075/imagen de Azure en el tier
   pago — quedan parecidos, pero Rekognition baja más con escala).

**Por qué no confiar solo en el cliente:** NSFWJS corre en el navegador de quien
publica — es trivial de evadir (deshabilitar JS, interceptar la llamada, usar la API
directo). Sirve para frenar al 95% de casos accidentales/casuales y ahorrar
ancho de banda, pero la responsabilidad final de bloquear contenido dañino debe estar
del lado del servidor (o, mínimo, en la cola de revisión humana de `/admin`).

---

## 2. Dónde encajaría en el flujo actual

Flujo hoy (`src/lib/upload.ts`, `src/lib/image.ts`, ambos `"use client"`):

```
usuario elige foto
  → compressImage(file)   // canvas, WebP, borra EXIF/GPS
  → uploadPhoto(file)     // valida tipo/tamaño, sube a Supabase Storage bucket "photos"
  → URL pública guardada en la fila (persons.photo_url, complaints.photo_url, ...)
```

No hay ningún paso de moderación de contenido. El control "duro" hoy es solo:
`ALLOWED_TYPES` (jpeg/png/webp), `MAX_BYTES` (8 MB), y las políticas del bucket en
Supabase (`allowedMimeTypes`/`fileSizeLimit`, mencionadas en el comentario de
`upload.ts` pero fuera de este repo — viven en la config del proyecto Supabase).

### Punto de integración recomendado: client-side ANTES de subir (barato, evita el gasto), con marca server-side de respaldo

**Cliente (NSFWJS), entre `compressImage` y `uploadPhoto`:**

```ts
// src/lib/moderation.ts (nuevo, "use client")
import * as nsfwjs from "nsfwjs";

let modelPromise: ReturnType<typeof nsfwjs.load> | null = null;
function getModel() {
  // mobilenet_v2_mid: ~7-9 MB, buen balance tamaño/exactitud para móvil
  return (modelPromise ??= nsfwjs.load("/models/nsfwjs/mobilenet_v2_mid/model.json"));
}

export interface ModerationResult {
  blocked: boolean;      // Porn/Hentai con alta confianza: no se sube
  needsReview: boolean;  // Sexy/violencia límite: se sube pero se marca para /admin
}

export async function checkImage(file: File): Promise<ModerationResult> {
  try {
    const model = await getModel();
    const img = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = img.width; canvas.height = img.height;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const predictions = await model.classify(canvas as unknown as HTMLCanvasElement);
    const porn = predictions.find((p) => p.className === "Porn")?.probability ?? 0;
    const hentai = predictions.find((p) => p.className === "Hentai")?.probability ?? 0;
    const sexy = predictions.find((p) => p.className === "Sexy")?.probability ?? 0;
    return {
      blocked: porn > 0.85 || hentai > 0.85,
      needsReview: !( porn > 0.85 || hentai > 0.85 ) && (sexy > 0.6 || porn > 0.4),
    };
  } catch {
    // Si el modelo falla en cargar (red lenta, navegador viejo): no bloquear la
    // publicación, pero SIEMPRE marcar para revisión — mejor falso positivo en
    // /admin que dejar pasar contenido dañino sin ningún control.
    return { blocked: false, needsReview: true };
  }
}
```

Uso en `DenunciaButton.tsx`/`RegisterPersonButton`/etc. (donde ya se llama
`compressImage` → `uploadPhoto`):

```ts
const compressed = await compressImage(fileRef.current);
const { blocked, needsReview } = await checkImage(compressed);
if (blocked) {
  setResult({ ok: false, error: "La imagen no cumple las normas de contenido del sitio." });
  return;
}
const url = await uploadPhoto(compressed);
if (url) data.set("photoUrl", url);
if (needsReview) data.set("photoNeedsReview", "1"); // la Server Action lo guarda
```

**Servidor (respaldo, evita evasión):** añadir un campo `photo_flagged boolean` (o
reusar el patrón de `possible_duplicate`) que la Server Action puede setear si
`photoNeedsReview` llega en `1`, y una llamada opcional a Azure Content Safety desde
`src/app/actions.ts` (server-side, con la API key en variable de entorno — nunca en
cliente) para las entidades más sensibles: `persons` (identificación de personas
reales, muchas de menores) y `denuncias` (pueden llevar "evidencia" gráfica). Esa
llamada corre dentro del free tier si el volumen es bajo. El resultado no bloquea
(igual que `possible_duplicate`): solo marca para que `/admin` lo revise con
prioridad, consistente con el patrón "avisa, no bloquea" que ya usa el proyecto para
duplicados.

---

## 3. Cola de posibles duplicados: cómo funciona hoy y mejora barata con pHash

### Cómo funciona hoy (`src/lib/data.ts`)

`findPersonDuplicates()` (línea ~740) se llama SIEMPRE al crear una persona
(`createPerson`, tanto desde el formulario público como desde el sync de sitios
legados) y busca coincidencias por **tres señales independientes**, sin bloquear la
publicación — solo marca `possible_duplicate = true` y `duplicate_match_id`:

1. **Cédula exacta** (`normalizeCedula`, compara solo dígitos).
2. **Foto idéntica** — `photoHash` es un **SHA-256 de los bytes del archivo**,
   calculado en el cliente por `hashFile()` en `src/lib/upload.ts` con Web Crypto
   (`crypto.subtle.digest`). Esto detecta el **mismo archivo exacto** re-subido, no
   fotos "parecidas": si alguien recorta, comprime distinto, o convierte a otro
   formato la misma foto, el hash cambia por completo y no hay coincidencia.
2. **Nombre parecido** — `sharedNameTokens`: normaliza (sin tildes, minúsculas) y
   exige 2+ palabras de 3+ letras en común entre nombre completo y apellido, sin pedir
   coincidencia exacta.

Los resultados alimentan `getPossibleDuplicatePersons()` (cola visible en `/admin`,
máx. 50, orden por fecha) y el moderador los descarta con
`dismissPersonDuplicate()`/`dismissPersonDuplicateAction` — un `false` en el flag, sin
borrar ni fusionar nada.

**Limitación real:** como el hash es SHA-256 exacto, la señal "foto" solo dispara si
literalmente se sube el mismo archivo binario dos veces (típico: alguien re-publica la
misma foto que ya circuló, o el sync desde sitios legados vuelve a traer la misma
imagen). No detecta la MISMA persona fotografiada dos veces distinto, ni la misma foto
recomprimida por WhatsApp (que sí cambia bytes).

### Mejora barata: perceptual hashing (pHash)

Con presupuesto cero, no hay margen para embeddings de reconocimiento facial (caros,
y legalmente delicados con datos de menores). **pHash** es la mejora natural y barata:
genera una huella de 64 bits que representa el CONTENIDO visual de la imagen (no sus
bytes), y compara por distancia de Hamming — dos fotos casi idénticas (mismo archivo
recomprimido, redimensionado, con watermark leve) quedan a pocos bits de distancia.

- **Costo:** cero. Librerías: `sharp-phash` (Node/servidor, usa `sharp` que ya podría
  hacer falta para procesar imágenes) o `phash-js`/`blockhash` (navegador, sin canvas).
  Recomendado: calcularlo **en servidor** (Server Action, tras `uploadPhoto`) porque
  ahí ya se tiene acceso a la imagen final y es más difícil de evadir que el cliente.
- **Integración:** añadir columna `photo_phash text` a `persons` (junto a la ya
  existente `photo_hash`), calcular con `sharp` al crear/actualizar, y en
  `findPersonDuplicates` sumar una tercera consulta: traer candidatos con
  `photo_phash` no nulo del mismo país (acotar con LIMIT razonable, ej. últimos 500) y
  filtrar en JS por distancia de Hamming ≤ 10 (umbral típico "muy probablemente la
  misma imagen"; 0-5 = casi seguro, 10-15 = posible).
- **Costo de cómputo:** trivial comparado con las consultas ya existentes; no requiere
  servicio externo ni facturación.

Prioridad: **Media** — mejora real (agarra el caso "misma foto recomprimida" que hoy
se escapa), pero no es tan urgente como la moderación de imágenes ausente o la
retención de datos, porque hoy la señal de nombre+cédula ya cubre bastantes casos y
el moderador humano en `/admin` sigue siendo el filtro final.

---

## 4. Retención de datos y borrado

### Marco legal vigente (Venezuela, 2025-2026)

- **No existe una Ley Orgánica de Protección de Datos Personales vigente en
  Venezuela** (a diferencia de España, cuyo nombre de ley es similar pero es otro
  país). El proyecto de ley venezolano lleva años sin aprobarse.
- El derecho se sostiene sobre la **Constitución de 1999**:
  - **Art. 28**: derecho de habeas data — acceder a la información propia en
    registros públicos o privados, conocer su uso/finalidad, y **solicitar ante
    tribunal la actualización, rectificación o destrucción** de datos erróneos o que
    afecten ilegítimamente derechos.
  - **Art. 60**: derecho a la protección del honor, vida privada, intimidad, propia
    imagen, confidencialidad y reputación.
- **Sentencia N.º 759 de la Sala Constitucional del TSJ (21 de mayo de 2025)**:
  estableció el habeas data como el mecanismo procesal idóneo para pedir supresión,
  rectificación, confidencialidad, inclusión, actualización o uso correcto de datos en
  registros públicos o privados, reconociendo expresamente el **"derecho al olvido"**
  — indicando que mantener datos indefinidamente sin justificación legal, pasado un
  plazo razonable, vulnera derechos fundamentales (el caso de origen era sobre
  antecedentes penales, pero el principio de fondo — "sin justificación pasado un
  plazo razonable" — es el mismo aplicable aquí).

**Lectura práctica para este proyecto:** no hay un plazo numérico fijado por ley (a
diferencia del RGPD europeo, que tampoco fija un número exacto pero exige el
principio de "limitación del plazo de conservación" — guardar solo mientras sea
necesario para la finalidad). El estándar de facto en plataformas similares
(ver comparación abajo) usa entre 30 días y varios años según el tipo de dato.

### Comparación con otras plataformas de personas desaparecidas/denuncias

- **Missing People (Reino Unido):** casos sin actividad 6+ años se cierran y el
  registro se borra (salvo pedido expreso de conservarlo).
- **ICMP (International Commission on Missing Persons):** borra datos personales en
  un plazo definido tras resolverse el caso (todas las personas reportadas por una
  familia ya localizadas).
- **ICRC / Missing Persons Platform:** el dato que ya no es necesario se borra; el
  borrado también procede a pedido del usuario.
- **Missing Persons Platform (Nigeria):** permite pedir el borrado del propio
  registro en cualquier momento por correo.

Ninguna de estas fija un plazo corto para *reportes descartados* — porque tratan con
personas aún desaparecidas (retención larga tiene sentido: el caso puede reabrirse
años después). El caso de "El mundo te busca" es distinto para dos categorías
concretas: **reportes de estado marcados como falsos/erróneos** (`status_reports`
descartados) y **denuncias eliminadas por el admin por ser falsas** (`complaints`) —
ahí no hay razón legítima para conservar el dato una vez descartado, y conservarlo
expone a la plataforma (y a la persona señalada, si la hubo) sin ningún beneficio.

### Recomendación concreta (prioridad Alta)

| Dato | Situación hoy | Recomendación | Plazo sugerido |
|---|---|---|---|
| `status_reports` descartados (`dismissReport`) | **Hard delete inmediato** (`sb.from("status_reports").delete()`) | Ya está bien — se borra al instante, no hace falta cambiar nada. | — |
| `complaints` borradas por admin (`deleteComplaint`) | **Hard delete inmediato** | Ya está bien igual que arriba. | — |
| `complaints` **activas pero nunca revisadas** (no hay `moderation_status` en `complaints`, se publican directo) | Quedan indefinidamente si nadie las denuncia ni un admin las borra a mano | Job periódico: purgar denuncias sin ningún "apoyo" (`supports = 0`) y sin comentarios tras **90 días** — señal razonable de que nadie la validó ni le dio seguimiento. Antes de purgar, marcar `deleted_at` (soft-delete) y borrar recién a los 7 días extra por si hace falta revertir un error del job. | 90 días soft-delete → purga hard a los 97 |
| `persons` con `possible_duplicate = true` **descartado por moderador** (`dismissPersonDuplicate`) | Hoy solo se apaga el flag; el registro sigue igual | No requiere retención especial — es una persona real, no un dato "falso". No purgar. | — |
| Fotos huérfanas en Storage (ya hay `deleteStoragePhoto`, buen patrón) | Se borra al eliminar el registro dueño | Igual, ya está bien. Para las purgas nuevas de `complaints`, reusar `deleteStoragePhoto` en el job. | — |

**Cómo implementarlo (barato, sin infraestructura nueva):**

1. Añadir `deleted_at timestamptz` a `complaints` (patrón soft-delete: no se pierde el
   dato de inmediato, permite auditoría/recuperación ante error).
2. Un endpoint de servidor (Next.js Route Handler o Server Action) protegido por un
   secreto simple, invocado por un **cron gratuito**: GitHub Actions con
   `schedule:` (igual patrón que `scripts/sync-legacy-sites` que ya corre por GitHub
   Actions según el esquema) — cero costo adicional, no requiere un servicio de colas.
3. Lógica: `UPDATE complaints SET deleted_at = now() WHERE deleted_at IS NULL AND
   supports = 0 AND created_at < now() - interval '90 days' AND NOT EXISTS (SELECT 1
   FROM comments WHERE entity_type='complaint' AND entity_id = complaints.id)`, y
   aparte `DELETE FROM complaints WHERE deleted_at < now() - interval '7 days'`
   (purga real, con borrado de foto asociada primero).
4. Aplica el mismo patrón, plazo más largo (ej. 180 días), a `posts` tipo `necesito`
   ya resueltos sin interacción — pero eso es una mejora aparte, no pedida aquí.

Prioridad: **Alta** para `complaints` sin revisar (dato potencialmente falso o
difamatorio que puede quedar años online sin que nadie lo cuestione); **Baja** para
todo lo demás, porque ya se borra al instante o no aplica un "derecho al olvido" (la
persona desaparecida real sigue siendo relevante indefinidamente hasta que se
resuelva su caso).

---

## 5. Denuncias de irregularidades: protección de quien denuncia

### Situación actual (confirmada en código)

- `DenunciaButton.tsx` **no tiene ningún campo de nombre**: el formulario solo pide
  categoría, texto, estado/ubicación y foto opcional.
- `createComplaintAction` (`src/app/actions.ts`, línea 1082) exige sesión iniciada
  (`getCurrentUser()`) y pasa `user.username` como `authorName` a `createComplaint`.
- `ComplaintCard.tsx` (línea 59) muestra **"Reportado por {complaint.authorName}"** en
  cada tarjeta, visible para cualquier visitante del sitio, sin sesión.
- El propio modal ya avisa: *"Publicar requiere iniciar sesión (no es anónimo ante el
  sistema)"* — pero el texto sugiere que el anonimato se pierde solo "ante el
  sistema" (backend), y en la práctica **se pierde también ante el público**, porque el
  username queda expuesto en la tarjeta pública. Esa es una discrepancia entre lo que
  se comunica y lo que realmente ocurre.
- Categorías incluyen `abuso_autoridad` y `desvio_ayuda` — exactamente el tipo de
  denuncia que en un contexto de crisis con autoridades locales involucradas puede
  generar represalias reales contra quien la publicó, si su nombre de usuario es
  identificable o rastreable a una persona real.

### Buenas prácticas para plataformas de denuncia ciudadana en contextos de crisis/riesgo de represalia

1. **Separar "no anónimo ante el sistema" de "no anónimo ante el público".** Es
   razonable y hasta deseable que el sistema sepa quién publicó (permite banear abuso,
   cumplir con una orden judicial legítima, dar seguimiento) — pero el público NO
   necesita saber quién denunció para que la denuncia tenga valor. La mayoría de
   sistemas de denuncia seria (líneas de denuncia corporativas, ONGs de derechos
   humanos) muestran la denuncia SIN el nombre del denunciante, aunque internamente sí
   quede registrado.
2. **Mostrar un alias o "Comunidad" en vez del username real.** Cambio mínimo y
   barato: en `createComplaint`, guardar el `user_id` (ya se hace) pero NO propagar
   `username` como `authorName` público — mostrar algo como "Denuncia verificada de la
   comunidad" o un identificador no vinculable (ej. "Vecino de {estado}"). El
   `user_id` sigue disponible para moderación/abuso internamente.
3. **Nunca combinar denuncia + ubicación precisa + identidad pública.** Ya se pide
   `locationText` (ubicación del hecho, no de quien denuncia) — bien, no hay GPS del
   denunciante. Mantenerlo así.
4. **Explicar claramente en el aviso previo qué tan expuesto queda quien denuncia** —
   hoy el aviso dice "no es anónimo ante el sistema" sin aclarar que el nombre de
   cuenta SÍ es público en la tarjeta. Ajustar el texto (o el comportamiento) para que
   coincidan.
5. **Vía de escape para denuncias de alto riesgo:** para categorías especialmente
   sensibles (`abuso_autoridad`), considerar un canal alterno fuera de la plataforma
   (ej. enlazar a una ONG de derechos humanos local o a un canal cifrado tipo Signal)
   en vez de forzar todo por el formulario público — no todo lo que alguien quiera
   reportar sobre una autoridad debería quedar en una base de datos con su cuenta
   vinculada, por muy protegida que esté.

Prioridad: **Alta**. Es una decisión de producto barata de corregir (no propagar el
username real como `authorName` en las denuncias, o al menos ofrecerlo como opción)
frente a un riesgo real y ya mencionado explícitamente en el contexto de este pedido
("comentarios hostiles en redes"): alguien que denuncia desvío de ayuda o abuso de
autoridad en una zona de desastre, con su nombre de cuenta público, es un blanco fácil
de identificar si esa cuenta usa su nombre real (algo muy probable dado que el sitio
no fuerza seudónimos).

---

## Resumen priorizado de recomendaciones

| # | Recomendación | Prioridad | Costo |
|---|---|---|---|
| 5 | Dejar de mostrar el username real como autor público en `/denuncias` (usar alias/"Comunidad") | **Alta** | Cero — cambio de lógica, sin servicios nuevos |
| 4 | Job de purga (soft-delete 90 días + hard delete a los 97) para denuncias sin apoyo/comentarios | **Alta** | Cero — GitHub Actions ya usado en el repo |
| 1-2 | NSFWJS client-side antes de subir fotos (bloqueo blando) + Azure Content Safety server-side en el free tier para `persons`/`complaints` (marca para revisión) | **Alta** | Cero (NSFWJS) + gratis dentro de 5.000 imgs/mes (Azure) |
| 3 | Añadir pHash a la detección de duplicados (columna `photo_phash`, distancia de Hamming) | **Media** | Cero — librería open-source, cómputo trivial |

---

## Fuentes

- [Cloud Vision API pricing — Google Cloud](https://cloud.google.com/vision/pricing)
- [Amazon Rekognition pricing — AWS](https://aws.amazon.com/rekognition/pricing/)
- [DetectModerationLabels — AWS docs](https://docs.aws.amazon.com/rekognition/latest/APIReference/API_DetectModerationLabels.html)
- [Azure AI Content Safety — Pricing | Microsoft Azure](https://azure.microsoft.com/en-in/pricing/details/cognitive-services/content-safety/)
- [NSFWJS — GitHub (infinitered/nsfwjs)](https://github.com/infinitered/nsfwjs)
- [pHash.org — Home of pHash, the open source perceptual hash library](https://www.phash.org/)
- [sharp-phash / phash-js — pHash en JavaScript](https://ssojet.com/hashing/phash-in-javascript-in-browser/)
- [En Venezuela no existe una Ley que resguarde los datos personales — Transparencia Venezuela](https://transparenciave.org/project/en-venezuela-no-existe-una-ley-que-resguarde-los-datos-personales/)
- [Sala Constitucional del TSJ estableció el Habeas Data como mecanismo para la protección de datos personales — Badell & Grau](https://badellgrau.com/sala-constitucional-del-tsj-establecio-el-habeas-data-como-mecanismo-para-la-proteccion-de-datos-personales/)
- [Introducción a la Protección de Datos en Venezuela: El Habeas Data — Data Law RD](https://datalawrd.com/introduccion-a-la-proteccion-de-datos-en-venezuela-el-habeas-data/)
- [Privacy Policy — ICRC Missing Persons Platform](https://missingpersons.icrc.org/privacy-policy)
- [ICMP's policy on personal data processing and protection](https://oic.icmp.int/index.php?w=datapolicy&l=en)
- [Privacy of service users' data — Missing People (UK)](https://www.missingpeople.org.uk/legal-and-privacy/privacy-of-service-users-data)
- [Privacy Policy — Missing Persons Platform Nigeria](https://www.missingpersonsplatform.com/privacy-policy)
