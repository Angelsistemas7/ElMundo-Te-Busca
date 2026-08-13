# Interoperabilidad de datos (PFIF y alternativas)

> Investigación nueva desde cero (agosto 2026). No reutiliza ninguna investigación
> previa — esa se perdió y no se asume que su veredicto ("prematuro") sea correcto;
> aquí se verifica todo con fuentes frescas.

## Veredicto (resumen ejecutivo)

**No vale la pena construir un exportador PFIF ni ningún otro conector de
interoperabilidad ahora mismo.** No porque la idea sea mala en abstracto, sino
porque hoy no existe **nadie del otro lado escuchando**:

- El estándar de facto para este problema (**PFIF**) está congelado desde 2012 y
  su única implementación de referencia (**Google Person Finder**) fue archivada
  por Google el **17 de septiembre de 2025** — ya no corre ninguna instancia.
- El **ICRC/Cruz Roja** no publica ninguna API o estándar abierto: su herramienta
  de cruce de bases de datos (Missing Persons Digital Matching) es una red
  cerrada entre el ICRC, las Sociedades Nacionales de la Cruz Roja/Media Luna
  Roja y "socios formales" bajo acuerdo — no acepta feeds de sitios ciudadanos.
  Para el terremoto de Venezuela 2026 en concreto, el propio ICRC dice
  explícitamente que **"en esta fase de la respuesta a la emergencia... no
  podemos verificar el estado o ubicación de las personas"** y solo ofrece
  dos teléfonos y un correo para reportes manuales, no un canal técnico.
- **HXL/HDX (OCHA)** nunca fue un estándar para fichas de personas desaparecidas
  (es una convención de etiquetado de columnas de spreadsheets humanitarios), y
  además el Centro de Datos Humanitarios de OCHA está **retirando el soporte a
  HXL a partir del 31 de enero de 2026**.
- El panorama real de sitios paralelos para este terremoto (venezuelatebusca.com,
  colombiatebusca.com, desaparecidosterremotovenezuela.com, venezuelareports.org,
  desaparecidosvenezuela.com, buscatupaciente.com...) **no usa ningún estándar
  de intercambio entre sí**. La consolidación que sí se intentó (Tilores) fue un
  trabajo manual y puntual de deduplicación sobre datos públicos, coordinado por
  correo — no una integración técnica ni una API viva.

El problema de fragmentación es real y está documentado en prensa (ver más
abajo), pero la causa no es "falta de un exportador PFIF": es que no hay
ninguna organización — ni el gobierno, ni el ICRC, ni un consorcio de los
sitios ciudadanos — pidiendo o consumiendo datos en un formato común. Construir
el exportador ahora sería trabajo especulativo sin consumidor. Se deja listo
el mapeo de campos (abajo) para poder construirlo rápido **el día que alguien
concreto lo pida**.

---

## 1. PFIF (People Finder Interchange Format)

### Qué es
PFIF es un formato XML para intercambiar fichas de personas desaparecidas/
localizadas entre registros distintos tras un desastre. Nació después del 11-S
(cuando aparecieron más de 25 registros de supervivientes incompatibles entre
sí) y se formalizó tras el huracán Katrina (2005): Ka-Ping Yee, con Kieran Lal
y Jonathan Plax, publicó **PFIF 1.0 el 4 de septiembre de 2005**.
Fuente: [Wikipedia — People Finder Interchange Format](https://en.wikipedia.org/wiki/People_Finder_Interchange_Format).

### Estado actual: congelado, no abandonado formalmente pero sin desarrollo desde 2012
- Última versión publicada: **PFIF 1.4, 29 de mayo de 2012**. No ha habido
  ninguna versión nueva en más de 13 años.
  Fuente: [zesty.ca/pfif](http://zesty.ca/pfif/) (spec editada por Ka-Ping Yee) —
  indexada y citada por [Wikipedia](https://en.wikipedia.org/wiki/People_Finder_Interchange_Format)
  y [AcronymFinder](https://www.acronymfinder.com/People-Finder-Interchange-Format-(PFIF).html).
  Nota: al intentar volver a acceder a `zesty.ca` en esta misma investigación
  (agosto 2026) el sitio ya no respondía (`ECONNREFUSED` / conexión rechazada) —
  es decir, puede estar cayendo intermitentemente o haberse retirado; los
  resultados de búsqueda en caché de agosto 2026 seguían mostrándolo indexado.
  Tratar la spec como "documento histórico", no como servicio en línea confiable.
- **Google Person Finder** — la implementación de referencia y el mayor
  consumidor real de PFIF — fue **archivado por su dueño (Google) el 17 de
  septiembre de 2025** en GitHub: *"This repository was archived by the owner
  on Sep 17, 2025. It is now read-only."*
  Fuente: [github.com/google/personfinder](https://github.com/google/personfinder)
  (banner de archivado, verificado directamente).
- Práctica operativa de Google incluso cuando el proyecto corría: pasados unos
  meses de una crisis, Google **borraba el repositorio de esa crisis y expiraba
  los registros** por política de privacidad — es decir, ni siquiera en su
  mejor momento era un archivo permanente con el que interoperar a largo plazo.
  Fuente: [Person Finder Help — qué pasa con los datos cuando pasa la crisis](https://support.google.com/personfinder/answer/1628148?hl=en).

**Conclusión sobre PFIF: el estándar existe como documento y es técnicamente
sencillo de implementar, pero no hay ninguna instancia activa de Person Finder
ni ningún otro consumidor institucional corriendo hoy que lo lea.** Construir
un exportador PFIF hoy sería exportar a un formato que nadie importa.

---

## 2. ICRC / Cruz Roja Internacional

### ¿Tiene una API o estándar público?
No. Lo que tiene es:

1. **Restoring Family Links (RFL)** — el programa general de búsqueda familiar
   del Movimiento de la Cruz Roja/Media Luna Roja. Es un servicio, no un
   estándar de datos público.
   Fuente: [Restoring Family Links — Wikipedia](https://en.wikipedia.org/wiki/Restoring_Family_Links);
   [icrc.org/es/what-we-do/reconnecting-families](https://www.icrc.org/en/what-we-do/reconnecting-families).

2. **Missing Persons Digital Matching (MPDM)** — herramienta interna del
   "Central Tracing Agency's Digitalization Programme" que cruza (hace
   *matching*, no exporta) bases de datos del ICRC, las Sociedades Nacionales y
   **"socios formales"** bajo acuerdo, sin exponer las bases completas entre sí
   (solo señala coincidencias para investigación humana). No hay indicio de
   que acepte feeds de sitios ciudadanos no afiliados, ni documentación pública
   de una API con la que un tercero pueda integrarse.
   Fuente: [Missing Persons Digital Matching Project — ICRC](https://missingpersons.icrc.org/news-stories/missing-persons-digital-matching-project-faster-and-better-answers);
   PDF interno *MPDM tool — long-term mission* (icrc.org, no aporta detalles
   técnicos adicionales legibles).

### Contacto concreto y real para el terremoto de Venezuela 2026
El ICRC sí tiene un canal humano activo específico para este desastre (útil
para la app aunque no sea técnico):
- Teléfonos de Family Links Protection: **(+58) 424 172 13 64** y
  **(+58) 412 636 50 15**.
- Para reportar información de alguien no localizado: **(+58) 422-7994880**
  ("se guardará en nuestro registro actualizado").
- Correo: **centrocontactove@icrc.org**.
- El propio ICRC advierte que en esta fase **no puede verificar estado ni
  ubicación de personas** — es decir, ni ellos mismos tienen aún un registro
  consolidado y verificado con el que interoperar.

Fuente: [ICRC — Información útil para personas afectadas por los terremotos en Venezuela](https://www.icrc.org/es/articulo/informacion-util-para-personas-afectadas-por-los-terremotos-en-venezuela)
(consultado agosto 2026); refuerzo institucional en
[American Red Cross — El Movimiento de la Cruz Roja responde en Venezuela](https://www.redcross.org/cruz-roja/nosotros/noticias-y-eventos/articulos-de-noticias/2026/el-movimiento-de-la-cruz-roja-responde-en-venezuela.html).

**Conclusión: no hay integración técnica posible con el ICRC hoy. Sí hay un
canal humano (teléfono/correo) que podría enlazarse desde la UI como recurso
de ayuda adicional — eso es una mejora de producto trivial, no de
interoperabilidad de datos, y queda fuera del alcance de esta investigación.**

---

## 3. HXL / HDX (OCHA)

- **HXL (Humanitarian Exchange Language)** es una convención de etiquetas para
  columnas de hojas de cálculo humanitarias (p. ej. `#adm1+name`,
  `#affected+killed`), pensada para reportes agregados (cifras, ubicaciones,
  necesidades) — **nunca fue un esquema para fichas individuales de personas
  desaparecidas** al estilo PFIF. No es sustituto funcional de PFIF aunque
  hubiera seguido vivo.
- Y de hecho **está siendo retirado**: el Centro de Datos Humanitarios de OCHA
  anunció que a partir del **31 de enero de 2026 deja de dar soporte a HXL y
  a las herramientas asociadas en HDX** (deja de pedir etiquetado HXL a quien
  sube datasets, retira Quick Charts, etc.). El estándar sigue siendo abierto
  y usable internamente por quien quiera, pero OCHA ya no lo mantiene ni lo
  promueve.
  Fuente: [Retiring HXL Services — The Centre for Humanitarian Data](https://centre.humdata.org/retiring-hxl-services/).

**Conclusión: no aplica ni siquiera conceptualmente a este proyecto (es para
datasets agregados, no fichas de personas), y además está en retirada.**

---

## 4. Nota al margen: EDXL-TEC (OASIS), por si aparece en otra búsqueda

Existe también **EDXL-TEC** ("Tracking of Emergency Clients"), un estándar de
OASIS (organización de estándares técnicos, la misma de EDXL-CAP) pensado para
rastrear evacuados entre refugios. Es mucho más de nicho que PFIF: está
orientado al sistema de refugios de la Cruz Roja Americana (National Shelter
System) en EE. UU., no hay evidencia de adopción en Latinoamérica ni de uso
para este terremoto, y no aparece mencionado en ninguna cobertura de prensa
sobre Venezuela/Colombia 2026.
Fuente: [OASIS EDXL-TEC Registry Exchange v1.0](https://docs.oasis-open.org/emergency/edxl-tec-registry/v1.0/edxl-tec-registry-v1.0.html).
Se descarta por el mismo motivo que PFIF pero con menos adopción todavía.

---

## 5. Sitios paralelos para el terremoto de Venezuela/Colombia 2026

Además de `venezuelatebusca.com` y `colombiatebusca.com` (los dos sitios
"legacy" que este proyecto ya sincroniza cada hora, ver
`scripts/sync-legacy-sites/README.md`), la prensa de agosto 2026 documenta
varios registros ciudadanos más, todos independientes entre sí:

| Sitio | Cifra reportada (ago. 2026) | Nota |
|---|---|---|
| `venezuelatebusca.com` | ~44.274 reportados | Legacy, ya sincronizado por este proyecto |
| `desaparecidosterremotovenezuela.com` | 44.418 (29.518 "incontactables") | Creado por venezolanos en el exterior; formulario + sección "Localizados a salvo" |
| `venezuelareports.org` / `venezuelareporta.org` | 41.311 | — |
| `desaparecidosvenezuela.com` | — | — |
| `desaparecidovenezuela.com` ("Rescate Venezuela") | — | — |
| `buscatupaciente.com` | — | Mencionado junto a los anteriores como registro a consultar |
| VenApp (gubernamental) | sin cifra pública | Canal oficial del Estado Mayor de Emergencia; no publica datos abiertos |

Ninguno de estos sitios menciona públicamente usar PFIF, HXL, EDXL-TEC ni
ningún otro estándar de intercambio. El propio Infobae (7 de agosto de 2026)
confirma que **no hay coordinación entre ellos ni con cifras oficiales**: cita
un rango de estimados de desaparecidos que va de 1.579 a más de 71.000 según
la fuente, y una fuente diplomática resumiendo: *"No hay cifras fiables"*. El
artículo no menciona ningún esfuerzo de unificación técnica en curso.
Fuente: [Infobae — Venezuela sigue con dificultades para contar a los desaparecidos (7 ago. 2026)](https://www.infobae.com/venezuela/2026/08/07/venezuela-sigue-con-dificultades-para-contar-a-los-desaparecidos-tras-los-terremotos-que-dejaron-mas-de-6000-muertos/).

El único intento real de consolidación encontrado es un caso de estudio de
**Tilores** (empresa de resolución de identidades/deduplicación), que entre el
24 de junio y el 14 de julio de 2026 combinó manualmente los datos **públicos**
de varios de estos registros (incluido `venezuelatebusca.com`) y los depuró de
duplicados, coordinándose por correo con los administradores de cada sitio —
**no fue una integración técnica por API ni por un formato estándar**, fue
scraping/exportación puntual + trabajo manual, y el proyecto ya terminó.
Fuente: [tilores.io/venezuela-te-busca](https://tilores.io/venezuela-te-busca/).

Esto confirma el diagnóstico: **la fragmentación es un problema real y
documentado por prensa, pero nadie lo está resolviendo con un estándar técnico
— ni siquiera el único actor que lo intentó (Tilores) usó uno.** Si en el
futuro surge un consorcio real entre estos sitios (o el gobierno/ICRC) para
unificar cifras, ese sería el momento de construir un exportador — y en ese
escenario probablemente el formato lo definiría ese consorcio ad hoc (como
hizo Tilores, con CSV/JSON simple), no necesariamente PFIF.

---

## 6. Mapeo de campos: `Person` (este proyecto) → PFIF 1.4

Documentado para el futuro, **sin construir código**. PFIF 1.4 es XML
(típicamente servido como Atom feed) con dos tipos de registro:
`pfif:person` y `pfif:note`. Fuente de los nombres de campo:
[PFIF spec / Wikipedia](https://en.wikipedia.org/wiki/People_Finder_Interchange_Format)
y [Google Person Finder DataAPI wiki](https://github.com/google/personfinder/wiki/DataAPI)
(la wiki confirma que Person Finder "almacena y exporta registros usando PFIF,
basado en XML", pero ya no aporta el catálogo completo por sí misma — se
completa con el conocimiento general de la spec 1.4, que debe reverificarse
contra `zesty.ca/pfif/1.4` cuando el sitio vuelva a responder, antes de
implementar nada).

### `pfif:person` ← `Person` (`src/lib/types.ts`)

| Campo PFIF 1.4 | Campo `Person` | Notas de conversión |
|---|---|---|
| `person_record_id` | `id` (prefijado, p. ej. `elmundotebusca.org/{id}`) | PFIF exige un ID único con dominio propio |
| `entry_date` | `createdAt` | ISO 8601, PFIF lo exige en UTC |
| `author_name` | `contactName` | — |
| `author_email` | `contactEmail` | — |
| `author_phone` | `contactPhone` | — |
| `source_name` | constante `"El Mundo Te Busca"` | — |
| `source_date` | `updatedAt` | — |
| `source_url` | `https://.../persona/{id}` | — |
| `full_name` | `firstName + " " + lastName` | Si `isUnidentified` y no hay nombre → `"Sin identificar"` (ya es el comportamiento actual) |
| `given_name` | `firstName` | — |
| `family_name` | `lastName` | — |
| `description` | `description` | Incluye ropa/señas, igual que hoy |
| `sex` | `gender` | Mapeo: `masculino→male`, `femenino→female`, `otro→other`; `null` → omitir |
| `age` | `age` | PFIF admite rango de texto ("30-40") o entero; este proyecto solo tiene entero |
| `home_city` / `home_state` | `locationText` / `estado` | PFIF no tiene "texto libre de ubicación"; se perdería precisión al exportar |
| `home_country` | `country` (`ve`/`co`) | Convertir a ISO 3166-1 alpha-2 (`VE`/`CO`) |
| `photo_url` | `photoUrl` | Debe ser URL pública accesible (ya lo es, vía Supabase Storage) |
| — (sin equivalente) | `lat` / `lng` | PFIF 1.4 **no tiene coordenadas geográficas** — se perderían al exportar |
| — (sin equivalente) | `cedula` | Sin campo PFIF equivalente; es dato sensible, probablemente no debería exportarse igual |
| — (sin equivalente) | `status`, `hospitalName`, `verified`, `possibleDuplicate`, `reactions` | Sin equivalente directo en `pfif:person`; `status` se modela en PFIF vía `pfif:note` (ver abajo), no en el registro de persona |

### `pfif:note` ← estado / `StatusReport`

PFIF separa la persona (datos fijos) del **estado** (que cambia con el
tiempo) en registros `note` independientes, encadenados por
`person_record_id`. Esto en realidad **encaja muy bien** con el modelo de
`StatusReport` de este proyecto:

| Campo PFIF 1.4 (`note`) | Campo `StatusReport` / `Person` | Notas |
|---|---|---|
| `note_record_id` | `id` (de `StatusReport`) | — |
| `person_record_id` | `personId` | — |
| `author_name` | `reporterName` | — |
| `author_phone` | `reporterPhone` | — |
| `source_date` / `entry_date` | `createdAt` | — |
| `status` | `reportedStatus` / `status` | Mapeo: `por_localizar→information_sought`, `localizado→believed_alive`, `hospitalizado→believed_alive` (+texto en `text`), `fallecido→believed_dead` |
| `last_known_location` | `locationFound` | — |
| `text` | `notes` | — |
| `author_made_contact` | — | Sin equivalente hoy; se podría inferir de `reporterRelationship` |

### Qué se pierde en la conversión (documentarlo es importante)
- Coordenadas `lat`/`lng` (mapa) — PFIF 1.4 no las soporta.
- Cédula/documento de identidad — no hay campo, y exportarla tal cual sería
  cuestionable en privacidad.
- Todo el modelo de consenso comunitario (reacciones, votos, "me gusta",
  comentarios) — PFIF no tiene concepto de eso, es de un solo autor por nota.
- `possibleDuplicate` / `duplicateMatchId` — sin equivalente; PFIF maneja
  duplicados con `pfif:linked_person_record_id` en las notas, pero es un
  mecanismo distinto (vincular dos IDs de persona, no marcar sospecha).

---

## Cuándo reabrir esta decisión

Vale la pena reconsiderar construir un exportador si ocurre **cualquiera** de
estas señales concretas (no especulativas):
1. El ICRC, PAHO/OPS, o Protección Civil de Venezuela/Colombia publican una
   API o formato de intercambio propio y piden explícitamente feeds de
   terceros.
2. Surge un consorcio real entre los sitios ciudadanos existentes
   (`venezuelatebusca.com`, `desaparecidosterremotovenezuela.com`,
   `venezuelareports.org`, etc.) para unificar cifras — en ese caso el formato
   lo definiría ese consorcio, probablemente algo más simple que PFIF (CSV/JSON).
3. Reaparece una instancia activa de Google Person Finder u otro consumidor
   real de PFIF para este desastre específico.

Ninguna de las tres se cumple hoy (agosto 2026).
