# Interoperabilidad con otros registros de personas desaparecidas (PFIF, ICRC, HXL)

> Investigación pura — no se tocó código. Pregunta que responde: *¿vale la
> pena que "El Mundo Te Busca" hable el mismo idioma que otros registros de
> personas desaparecidas (PFIF, Cruz Roja, HXL/HDX) para que los datos se
> puedan cruzar entre plataformas?*

## Resumen ejecutivo

**Prioridad: prematura.** Los tres caminos de interoperabilidad que existían
para este tipo de proyecto están, hoy, efectivamente cerrados o en retirada:
el repositorio de Google Person Finder (el único implementador real de PFIF
a escala) está **archivado en modo solo-lectura desde el 17 de septiembre de
2025**; la especificación PFIF misma lleva **congelada desde 2012** (versión
1.4, sin ninguna revisión en 14 años); el sistema de la Cruz Roja/ICRC para
personas separadas por desastres **no tiene API pública ni formato de
intercambio abierto** — funciona por teléfono y personal en sitio, no por
integración de datos; y HXL, el estándar de OCHA para datos humanitarios,
**fue retirado oficialmente por su propio dueño el 31 de enero de 2026**
(antes de escribirse este documento). No existe hoy ninguna organización con
la que este proyecto pueda "enchufarse" técnicamente. Construir un exportador
PFIF ahora sería resolver un problema de integración para el cual no hay
ningún consumidor real del otro lado — esfuerzo bien acotado y reversible
(ver §5), pero sin destinatario. La condición que cambiaría esto no es
técnica sino humana: que una organización concreta (Cruz Roja Venezolana,
Protección Civil, o un futuro registro nacional unificado) pida explícitamente
un feed de datos en un formato dado.

---

## 1. PFIF (People Finder Interchange Format)

### 1.1 Qué es

PFIF es un formato XML para intercambiar registros de personas desaparecidas
o desplazadas entre distintos sistemas ("registries"), pensado para que un
mismo registro pueda copiarse de un repositorio a otro sin perder su
identidad. No es un protocolo de sincronización en vivo: es un formato de
volcado/importación (archivo XML descargable o feed HTTP con ese contenido).

### 1.2 Historia

- **Origen (2001–2005):** tras el 11-S surgieron más de 25 foros y registros
  de supervivientes distintos, sin forma de cruzarlos entre sí. Un intento
  manual de consolidación en Berkeley demostró que hacía falta un formato
  común.
- **Katrina (2005):** David Geilhufe impulsó el esfuerzo de estandarización;
  Ka-Ping Yee redactó la especificación inicial. **PFIF 1.0** salió el 4 de
  septiembre de 2005, y **1.1** al día siguiente.
- **PFIF 1.2 (enero 2010):** se añadieron campos internacionales para el
  terremoto de Haití.
- **PFIF 1.3 (marzo 2011):** protecciones de privacidad y formato de nombre
  más flexible.
- **PFIF 1.4 (29 de mayo de 2012):** última versión. Mejoró los campos de
  nombre, enlace a perfiles y soporte de múltiples fotos.
- Desde entonces: **ninguna revisión nueva.** La especificación lleva 14 años
  congelada.

### 1.3 ¿Sigue vigente en 2025–2026?

**No, de facto.** Verificación directa:

- El repositorio `google/personfinder` en GitHub —la implementación de
  referencia y el único despliegue de PFIF a gran escala (Google Person
  Finder, usado en Haití 2010, Chile, Japón/Tōhoku 2011, Nepal 2015)— **fue
  archivado por su dueño el 17 de septiembre de 2025** y quedó en modo
  solo-lectura (confirmado leyendo la página del repositorio).
- No se encontró un anuncio oficial de Google fechado en mayo de 2023 con ese
  detalle exacto (esa fecha, mencionada como hipótesis de partida en el
  encargo, no se pudo verificar con una fuente primaria); lo que sí está
  confirmado y es más reciente y concluyente es el archivado de septiembre de
  2025, que deja el proyecto sin desarrollo activo ni forma de que alguien
  externo lo reactive.
- Los otros adoptantes documentados de PFIF —**Sahana Eden / National
  Library of Medicine "People Locator"** y **Ushahidi**— no muestran
  actividad ni menciones verificables en 2024–2025 en las fuentes
  consultadas; la referencia más reciente encontrada para People Locator es
  de 2016.
- Conclusión: PFIF es, en la práctica, **un estándar abandonado**. Sigue
  siendo legible y documentado (útil como formato de *export* de una sola
  vía, "por si alguien algún día lo necesita"), pero no hay ningún sistema
  activo hoy que lo consuma en tiempo real.

### 1.4 Campos de la especificación (PFIF 1.4)

**Elemento `<person>`** (obligatorios en negrita):

| Campo | Descripción |
|---|---|
| **`person_record_id`** | Identificador único, formato `dominio.org/id_local` |
| `entry_date` | Fecha en que se creó/actualizó el registro (UTC, `YYYY-MM-DDThh:mm:ssZ`) |
| `expiry_date` | Fecha de expiración/borrado programado |
| `author_name`, `author_email`, `author_phone` | Quién publicó el registro |
| `source_name`, **`source_date`**, `source_url` | De dónde viene el dato originalmente |
| **`full_name`** | Nombre completo (obligatorio, incluso si el resto de identidad se desconoce) |
| `given_name`, `family_name`, `alternate_names` | Desglose de nombre |
| `description` | Texto libre |
| `sex` | `female` / `male` / `other` (omitir si se desconoce) |
| `date_of_birth` | Exacta (`YYYY-MM-DD`) o aproximada (`YYYY` o `YYYY-MM`) |
| `age` | Alternativa a `date_of_birth` |
| `home_street`, `home_neighborhood`, `home_city`, `home_state`, `home_postal_code`, `home_country` | Dirección estructurada |
| `photo_url` | Foto (debe ser accesible públicamente) |
| `profile_urls` | Enlaces a redes sociales u otros perfiles |

**Elemento `<note>`** (uno o más por persona, historial de actualizaciones):

| Campo | Descripción |
|---|---|
| `note_record_id`, `person_record_id` | Identificadores |
| `linked_person_record_id` | Para fusionar con otro registro (duplicados) |
| `entry_date`, `author_name`, `author_email`, `author_phone`, `source_date` | Metadatos de quién/cuándo |
| `author_made_contact` | Booleano: ¿el autor tuvo contacto directo? |
| `status` | Enum: `''` (sin especificar) / `information_sought` / `is_note_author` / `believed_alive` / `believed_missing` / `believed_dead` |
| `email_of_found_person`, `phone_of_found_person` | Contacto de la persona, si se localizó |
| `last_known_location` | Texto libre |
| `text` | Cuerpo de la nota |

### 1.5 Mapeo concreto Person → PFIF (si se implementara)

Contra `src/lib/types.ts` (tipo `Person`) y `src/lib/validation.ts`:

| Campo PFIF | Origen en `Person` | Nota |
|---|---|---|
| `person_record_id` | `elmundotebusca.com/${id}` | Formato exigido por el spec: dominio + id local |
| `entry_date` | `createdAt` | Ya es ISO; solo formatear a UTC con `Z` |
| `source_date` | `updatedAt` | — |
| `source_url` | `https://elmundotebusca.com/persona/${id}` | Ficha pública |
| `full_name` | `${firstName} ${lastName}`.trim() | Si `isUnidentified` y sin nombre, PFIF exige el campo igual → usar `"Sin identificar"` (mismo criterio que ya usa `createPerson` al insertar en la BD) |
| `given_name` / `family_name` | `firstName` / `lastName` | — |
| `sex` | `gender` | `masculino→male`, `femenino→female`, `otro→other`; omitir si `null` |
| `age` | `age` | Directo; PFIF pide *o* edad *o* fecha de nacimiento — este proyecto no captura fecha de nacimiento, así que siempre sería `age` |
| `description` | `description` | Incluye ya ropa/señas/contexto, encaja bien |
| `home_state` | `estado` | — |
| `home_neighborhood` o parte de `description` | `locationText` | PFIF no tiene un campo "texto libre de ubicación"; lo más fiel es meterlo en `home_neighborhood` o anexarlo a `description` |
| `photo_url` | `photoUrl` | Ya es una URL pública del bucket de Supabase Storage — compatible tal cual |
| **nota `status`** | `status` | `por_localizar→believed_missing`, `localizado→believed_alive`, `hospitalizado→believed_alive` (+ texto mencionando el hospital), `fallecido→believed_dead` |
| `author_name` / `author_phone` / `author_email` | `contactName` / `contactPhone` / `contactEmail` | **Ojo con privacidad**: PFIF asume que estos campos pueden republicarse en otro sistema fuera de tu control — revisar antes si el proyecto quiere exponer contacto directo a terceros no auditados |

Campos que el proyecto **no** captura y quedarían vacíos: `date_of_birth`,
`alternate_names`, `home_street`, `home_postal_code`, `home_country`
(implícito Venezuela/Colombia vía `country`), `profile_urls`.

---

## 2. ICRC Family Links / Restoring Family Links

### 2.1 Cómo funciona

El Comité Internacional de la Cruz Roja (ICRC) opera una red global de
"Restoring Family Links" para reconectar a personas separadas por
conflictos, desastres o migración. Sus herramientas principales:

- **Trace the Face**: galería de fotos de personas buscando a su familia.
  Verificado en la documentación oficial: **no puedes publicar tu propia
  foto** — solo se publica a través de una Sociedad Nacional de la Cruz Roja
  o personal del ICRC. Es un flujo mediado por personas, no un formulario
  público ni una API de envío directo.
- **Family Links Answers (FLA)**: herramienta interna de gestión de casos
  usada por las Sociedades Nacionales (staff), no expuesta públicamente.
- Datos de menores de 15 años nunca se publican en abierto, solo se muestran
  en presencia de personal autorizado — refleja un estándar de protección de
  datos deliberadamente restrictivo, coherente con el mandato humanitario del
  ICRC pero incompatible con un intercambio automático abierto.

### 2.2 ¿Hay API o formato de intercambio abierto?

**No se encontró ninguno.** No hay documentación pública de una API REST,
webhook, o formato de exportación/importación masiva para terceros. El canal
de interacción con el público es humano: teléfono y oficinas físicas.

### 2.3 Caso concreto: terremoto Venezuela 2026

El ICRC y Cruz Roja Venezolana activaron su respuesta para este desastre
específico con **números de teléfono**, no con una integración de datos:

- `(+58) 422-7994880` — registrar datos de un familiar y mantenerlos
  actualizados.
- `(+58) 424 172 13 64` y `(+58) 412 636 50 15` — equipo de protección de
  Family Links del ICRC, para consultar por personas bajo su cuidado.

Esto confirma que, **incluso en el desastre que motiva este proyecto**, el
canal real con el ICRC es telefónico/humano. No hay ningún endpoint técnico
al que este proyecto pudiera conectarse hoy aunque quisiera.

---

## 3. HXL (Humanitarian Exchange Language) y HDX

### 3.1 Qué es

HXL, liderado por OCHA (la oficina de coordinación humanitaria de la ONU),
es un estándar **genérico** para hacer intercambiables hojas de cálculo y
datasets entre organizaciones humanitarias: se añade una fila de "hashtags"
(p. ej. `#adm1`, `#affected`, `#date`) debajo de los encabezados de columna,
sin cambiar herramientas ni flujos de trabajo existentes. No es un estándar
de dominio específico como PFIF — no define un vocabulario propio para
"persona desaparecida"; se usaría montando hashtags propios sobre las
columnas ya existentes de un CSV/export.

No se encontró ninguna vocabulario HXL oficial y específico para personas
desaparecidas — sería trabajo de diseño adicional inventar esa convención,
no algo ya resuelto que este proyecto pudiera simplemente adoptar.

### 3.2 Estado actual (lo más importante de esta sección)

**El propio Centro de Datos Humanitarios de OCHA retiró HXL.** Verificado en
`hxlstandard.org`: *"as of 31 January 2026 the Centre for Humanitarian Data
will no longer be supporting the Humanitarian Exchange Language (HXL)
standard and tools related to the HDX platform"*. La razón que dan: están
migrando a "nuevas formas de estandarizar datos" y construyendo sobre las
lecciones de HXL, no simplemente abandonándolo sin reemplazo — pero a la
fecha de este documento (agosto 2026) **no hay todavía un sucesor
publicado**, solo la promesa de explorarlo. HXL queda como estándar abierto
que cualquiera puede seguir usando internamente, pero sin soporte activo de
OCHA ni garantía de que las herramientas de HDX lo sigan aceptando.

Conclusión: HXL no es una vía de interoperabilidad viable ahora mismo — no
por falta de mérito técnico, sino porque el propio organismo que lo mantenía
lo está desactivando en el momento en que se escribe este documento.

---

## 4. ¿Hay alguien real con quien interoperar hoy?

Antes de decidir, vale ver el panorama competitivo real. Una búsqueda sobre
plataformas para el terremoto de Venezuela 2026 encontró **al menos siete
sitios ciudadanos independientes** operando en paralelo, además de este
proyecto: registros de personas desaparecidas y portales de emergencia
distintos, cada uno con su propia base de datos aislada, ninguno anunciando
uso de PFIF, HXL ni ningún otro estándar de intercambio. (Al margen: uno de
esos dominios tiene un nombre muy parecido al de este proyecto — "Venezuela
Te Busca" vs. "El Mundo Te Busca" — lo cual es un tema de confusión de marca
aparte, no de interoperabilidad técnica, pero vale que el equipo lo tenga en
el radar.)

Esto confirma el diagnóstico: el ecosistema real está **fragmentado entre
proyectos ciudadanos aislados**, no coordinado por una organización central
con la que valga la pena integrarse. Ni Cruz Roja Venezolana ni Protección
Civil publican hoy un feed de datos abierto al que este proyecto pudiera
sumarse, y no hay evidencia de que ningún otro sitio ciudadano exponga o
consuma PFIF tampoco. Construir soporte para un estándar que nadie más en el
ecosistema local usa no resuelve un problema real de los usuarios — resuelve
un problema hipotético de arquitectura.

**Cuándo cambiaría esto:** si Cruz Roja Venezolana, Protección Civil, o
alguna instancia de coordinación (nacional o de la ONU/OCHA) pidiera
explícitamente un feed de datos, o si emergiera un registro nacional
unificado post-terremoto con el que integrarse tendría beneficio real para
las familias (menos sitios que revisar). Hasta entonces, es una solución
buscando problema.

---

## 5. Si se implementara de todos modos: esfuerzo y aislamiento

Aun con la recomendación de no priorizarlo, vale dejar dimensionado el
trabajo por si en algún momento cambia el contexto (§4):

- **Alcance mínimo razonable**: un endpoint de solo lectura, p. ej.
  `src/app/api/export/pfif/route.ts`, que recorra `getPersons()` (ya
  existente en `src/lib/data.ts`) y serialice cada `Person` a un `<person>`
  PFIF 1.4 con su `<note>` de estado más reciente, según el mapeo de §1.5.
- **No requiere cambios de esquema** (ni en `types.ts`, ni en
  `supabase/schema.sql`): es una transformación de lectura sobre datos que
  ya existen, no una nueva funcionalidad de captura.
- **Tamaño estimado**: medio día a un día de trabajo para un desarrollador
  que ya conoce el repo — la parte no trivial es escribir bien el
  serializador XML (escapar texto, formatear fechas a UTC, manejar el caso
  `isUnidentified` sin nombre) y probarlo contra 2-3 registros reales, no la
  lógica de negocio en sí.
- **Reversibilidad**: alta. Es un endpoint aislado, aditivo, que no toca
  `actions.ts` ni ninguna ruta de escritura. Se puede borrar sin dejar rastro
  ni migrar nada si más adelante se decide que no sirvió.
- **Lo que NO vale la pena ahora, y es un esfuerzo de otro orden**: construir
  el lado de *importación* (aceptar PFIF de otros sistemas). Eso sí exigiría
  diseño serio de deduplicación (ya hay una base con `possibleDuplicate` /
  `duplicateMatchId` en `types.ts`, pero pensada para duplicados internos, no
  para fusionar con una fuente externa no verificada), moderación de datos
  ajenos no confiables, parsing/validación de XML de terceros (superficie de
  ataque nueva) y decisiones de confianza (¿un PFIF externo debería aparecer
  ya "verified"? ¿quién es responsable si trae datos incorrectos?). Ese
  trabajo no está justificado sin que exista ya alguien concreto del otro
  lado enviando ese feed.
- **Antes de construir nada**: dado que hoy el proyecto no tiene ningún
  consumidor real (§4), lo más barato y reversible de todo sería simplemente
  **documentar el mapeo** (ya queda hecho en §1.5 de este documento) y
  esperar a que un interesado concreto lo pida, en vez de mantener código sin
  usuario.

---

## Fuentes

- [People Finder Interchange Format — Wikipedia](https://en.wikipedia.org/wiki/People_Finder_Interchange_Format)
- [PFIF 1.4 — zesty.ca](http://zesty.ca/pfif/1.4/)
- [PFIF 1.2 — zesty.ca](http://zesty.ca/pfif/1.2/)
- [PFIF FAQ e implementation guidelines — zesty.ca](http://zesty.ca/pfif/faq.html)
- [google/personfinder — GitHub (repositorio archivado 17 sep. 2025)](https://github.com/google/personfinder)
- [google/personfinder Wiki — DataAPI](https://github.com/google/personfinder/wiki/DataAPI)
- [pfif module — personfinder.readthedocs.io](https://personfinder.readthedocs.io/en/latest/pfif.html)
- [Google Person Finder — Wikipedia](https://en.wikipedia.org/wiki/Google_Person_Finder)
- [Person Finder FAQ — support.google.com](https://support.google.com/personfinder/faq/1628221?hl=en)
- [US National Library of Medicine: People Locator — Sahana Foundation](https://sahanafoundation.org/deployments/us-national-library-of-medicine/)
- [Restoring Family Links — Wikipedia](https://en.wikipedia.org/wiki/Restoring_Family_Links)
- [Information notice — Restoring Family Links (ICRC)](https://familylinks.icrc.org/information-notice)
- [FAQ — Trace the Face (ICRC)](https://tracetheface.familylinks.icrc.org/faq/)
- [Trace the Face: Reuniting families — ICRC](https://www.icrc.org/en/document/trace-face-reuniting-families)
- [Información útil para personas afectadas por los terremotos en Venezuela — ICRC](https://www.icrc.org/es/articulo/informacion-util-para-personas-afectadas-por-los-terremotos-en-venezuela)
- [Buscar a las personas desaparecidas, prioridad tras los terremotos de Venezuela — Cruz Roja Española](https://www2.cruzroja.es/web/ahora/-/buscar-personas-desaparecidas-prioridad-terremotos-venezuela)
- [Learn how to use the Humanitarian Exchange Language — OCHA](https://www.unocha.org/publications/report/world/learn-how-use-humanitarian-exchange-language)
- [HXL — Humanitarian Exchange Language — IM Toolbox (OCHA Knowledge Base)](https://humanitarian.atlassian.net/wiki/spaces/imtoolbox/pages/42502162/HXL+-+Humanitarian+Exchange+Language)
- [Retiring HXL Services — hxlstandard.org](https://hxlstandard.org/standard/1-1final/)
- [The Centre for Humanitarian Data](https://centre.humdata.org/)
- [An Introduction to the Humanitarian Exchange Language — centre.humdata.org](https://centre.humdata.org/learning-path/hxl/)
