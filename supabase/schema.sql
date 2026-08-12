-- ─────────────────────────────────────────────────────────────────────────
-- Venezuela te busca — Esquema de base de datos (PostgreSQL / Supabase)
--
-- Cómo aplicarlo:
--   1. Crea un proyecto gratis en https://app.supabase.com
--   2. Abre "SQL Editor" y pega TODO este archivo. Ejecuta.
--   3. Copia URL y claves a tu .env.local (ver .env.example)
--
-- Diseñado para escalar: índices en los campos de búsqueda/filtro y
-- búsqueda de texto completo en español sobre nombre + ubicación.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- búsqueda difusa por nombre/cédula

-- ── Tipos ────────────────────────────────────────────────────────────────
do $$ begin
  create type person_status as enum ('por_localizar', 'localizado', 'hospitalizado', 'fallecido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gender_type as enum ('masculino', 'femenino', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type person_cause as enum ('desastre', 'otra');
exception when duplicate_object then null; end $$;

do $$ begin
  create type aid_point_type as enum ('comida', 'agua', 'medicina', 'refugio', 'alojamiento', 'ropa', 'otro');
exception when duplicate_object then null; end $$;
-- Migración para bases ya creadas: añade 'alojamiento' (hogares que abren sus puertas).
alter type aid_point_type add value if not exists 'alojamiento';

-- ── Personas ───────────────────────────────────────────────────────────────
create table if not exists persons (
  id uuid primary key default uuid_generate_v4(),
  first_name      text not null check (length(first_name) between 1 and 80),
  last_name       text default '' check (length(last_name) <= 80),
  cedula          text,
  age             int check (age between 0 and 120),
  gender          gender_type,
  estado          text,
  location_text   text default '',
  description     text default '',
  photo_url       text,
  status          person_status not null default 'por_localizar',
  hospital_name   text,
  is_unidentified boolean not null default false,
  cause           person_cause not null default 'desastre',
  contact_name    text,
  contact_phone   text,
  contact_email   text,
  verified        boolean not null default false,
  reactions       jsonb not null default '{"fuerza":0,"corazon":0,"difundir":0}',
  -- columna generada para búsqueda de texto completo en español (incluye
  -- `description`: es el único dato con el que se busca a alguien sin
  -- identificar en "¿La reconoces?" — rasgos, ropa, características).
  search_doc tsvector generated always as (
    to_tsvector('spanish',
      coalesce(first_name,'') || ' ' ||
      coalesce(last_name,'') || ' ' ||
      coalesce(cedula,'') || ' ' ||
      coalesce(estado,'') || ' ' ||
      coalesce(location_text,'') || ' ' ||
      coalesce(description,''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migración para bases ya creadas: `search_doc` no incluía `description`, así
-- que buscar por rasgos/ropa en "¿La reconoces?" no encontraba nada (el único
-- dato disponible ahí). Recrear la columna generada recalcula sola la
-- búsqueda para TODOS los registros existentes, sin tocar los datos.
drop index if exists persons_search_idx;
alter table persons drop column if exists search_doc;
alter table persons add column search_doc tsvector generated always as (
  to_tsvector('spanish',
    coalesce(first_name,'') || ' ' ||
    coalesce(last_name,'') || ' ' ||
    coalesce(cedula,'') || ' ' ||
    coalesce(estado,'') || ' ' ||
    coalesce(location_text,'') || ' ' ||
    coalesce(description,''))
) stored;

create index if not exists persons_status_idx        on persons (status);
create index if not exists persons_estado_idx        on persons (estado);
create index if not exists persons_gender_idx        on persons (gender);
create index if not exists persons_age_idx           on persons (age);
create index if not exists persons_unidentified_idx  on persons (is_unidentified);
create index if not exists persons_created_idx       on persons (created_at desc);
create index if not exists persons_search_idx        on persons using gin (search_doc);
create index if not exists persons_name_trgm_idx     on persons using gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- Migración multi-país (ago. 2026): además del terremoto de Venezuela (jun.
-- 2026), la plataforma ahora también sirve el terremoto de Colombia (10 ago.
-- 2026). `country` filtra cada tabla por instancia de desastre/país; las filas
-- existentes (todas de Venezuela) quedan en 've' por el default.
alter table persons add column if not exists country text not null default 've';
create index if not exists persons_country_idx on persons (country);

-- Migración "categoría de publicación" (ago. 2026): por qué se publicó a esta
-- persona — ligada al desastre activo, u otra causa (desaparición cotidiana
-- ajena al terremoto). Filas existentes quedan en 'desastre' por el default
-- (es el caso original de la plataforma).
alter table persons add column if not exists cause person_cause not null default 'desastre';
create index if not exists persons_cause_idx on persons (cause);

-- ── Sincronización desde colombiatebusca.com / venezuelatebusca.com ────────
-- Esos sitios quedaron sin mantenimiento (ver docs/ESTADO-DEL-PROYECTO.md).
-- `external_source`/`external_id` identifican el registro original para que
-- la sincronización horaria (scripts/sync-legacy-sites) pueda hacer upsert
-- idempotente sin depender de un archivo de estado local entre corridas de
-- GitHub Actions (cada corrida es una máquina nueva).
alter table persons add column if not exists external_source text;
alter table persons add column if not exists external_id text;
create unique index if not exists persons_external_uniq
  on persons (external_source, external_id)
  where external_id is not null;

-- ── Aviso de posible duplicado (nombre parecido, cédula o foto idéntica) ────
-- `photo_hash` es un SHA-256 determinístico de los bytes de la foto (no un
-- modelo de IA ni hash perceptual): detecta cuando el MISMO archivo se subió
-- ya sea desde el formulario de publicar o desde el sync de sitios viejos.
-- `possible_duplicate`/`duplicate_match_id` se calculan al crear el registro
-- (manual o automático) y NO bloquean la publicación, solo la marcan para que
-- un moderador la revise en /admin — puede ser gente real que comparte una
-- sola foto familiar, no necesariamente el mismo caso repetido.
alter table persons add column if not exists photo_hash text;
alter table persons add column if not exists possible_duplicate boolean not null default false;
alter table persons add column if not exists duplicate_match_id uuid references persons(id) on delete set null;
create index if not exists persons_photo_hash_idx on persons (photo_hash) where photo_hash is not null;
create index if not exists persons_possible_duplicate_idx on persons (possible_duplicate) where possible_duplicate;

-- ── Propietario de la publicación (token privado de gestión) ────────────────
-- Tabla aparte y SIN lectura pública: el token es secreto. Solo el servidor
-- (service role) lo lee para verificar al autor. Permite que quien publicó
-- gestione su registro (estado, edición, borrado) sin crear cuenta.
create table if not exists person_owners (
  person_id uuid primary key references persons(id) on delete cascade,
  token     text not null,
  created_at timestamptz not null default now()
);

-- ── Propietario de recursos (puntos de ayuda, caravanas, mascotas) ──────────
-- Igual que person_owners pero genérico: el autor de un punto de ayuda, una
-- caravana o una mascota lo gestiona con un enlace privado (token). Sin
-- lectura pública; la verificación del autor se hace en el servidor con la
-- service role. No es una FK porque entity_id apunta a una de varias tablas
-- según entity_type.
create table if not exists resource_owners (
  entity_type text not null check (entity_type in ('aid_point','march','post','pet')),
  entity_id   uuid not null,
  token       text not null,
  created_at  timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

-- ── Gestores delegados de recursos (los asigna el admin) ────────────────────
-- El admin da a un usuario (cuenta) permiso para administrar un hospital o un
-- punto de ayuda concreto (estado/disponibilidad/insumos, edición), sin ser el
-- admin global ni el publicador. Tabla PRIVADA: solo el servidor (service role)
-- la lee/escribe. La verificación del permiso se hace en el servidor.
create table if not exists resource_managers (
  entity_type text not null check (entity_type in ('aid_point','hospital')),
  entity_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  granted_by  text,
  created_at  timestamptz not null default now(),
  primary key (entity_type, entity_id, user_id)
);
create index if not exists resource_managers_entity_idx on resource_managers (entity_type, entity_id);
create index if not exists resource_managers_user_idx   on resource_managers (user_id);

-- ── Solicitudes de gestor delegado (las envía el voluntario, las aprueba el
-- admin) ─────────────────────────────────────────────────────────────────
-- Puente entre "quiero ayudar" y `resource_managers`: el usuario logueado
-- pide permiso sobre UN hospital/punto de ayuda concreto y explica qué
-- información puede aportar; el admin la ve en /admin y con un clic la
-- aprueba (crea la fila en resource_managers) o la rechaza. `entity_name` se
-- desnormaliza para no tener que resolver el nombre del recurso en cada
-- lectura del panel. Tabla PRIVADA: solo el servidor (service role).
create table if not exists manager_requests (
  id          uuid primary key default uuid_generate_v4(),
  entity_type text not null check (entity_type in ('aid_point','hospital')),
  entity_id   uuid not null,
  entity_name text not null default '',
  user_id     uuid not null references auth.users(id) on delete cascade,
  message     text not null default '' check (length(message) <= 800),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now()
);
create index if not exists manager_requests_status_idx on manager_requests (status, created_at desc);
create index if not exists manager_requests_user_idx   on manager_requests (user_id);
alter table manager_requests enable row level security;
-- Sin políticas a propósito: solo el servidor (service role) la lee/escribe;
-- quién pidió qué permiso no es público.

-- ── Roles globales (no atados a un recurso concreto) ─────────────────────────
-- A diferencia de resource_managers (UN punto de ayuda u hospital), estos roles
-- aplican a TODA una categoría (ej. "puede actualizar cualquier hospital") o dan
-- el mismo alcance del ADMIN_TOKEN pero por cuenta individual. Tabla PRIVADA:
-- solo el servidor (service role) la lee/escribe.
create table if not exists app_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','moderator','hospital_moderator','aid_point_moderator')),
  granted_by text,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index if not exists app_roles_role_idx on app_roles (role);

-- Migración para bases ya creadas: rol 'moderator' (reportes de hallazgos,
-- posts de comunidad, visto bueno a personas/puntos de ayuda/hospitales —
-- SIN Colaboradores, gestores, héroes ni denuncias, eso sigue solo para 'admin').
alter table app_roles drop constraint if exists app_roles_role_check;
alter table app_roles add constraint app_roles_role_check
  check (role in ('admin','moderator','hospital_moderator','aid_point_moderator'));

alter table app_roles enable row level security;
-- Sin políticas a propósito: quién tiene qué rol no es público, y asignarlo
-- requiere ya ser admin (se resuelve en el servidor con la service role).

-- ── Reportes de cambio de estado (con verificación anti-abuso) ──────────────
create table if not exists status_reports (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references persons(id) on delete cascade,
  reported_status       person_status not null,
  reporter_name         text not null,
  reporter_phone        text not null,
  reporter_relationship text not null,
  location_found        text not null,
  notes                 text default '',
  verified              boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists status_reports_person_idx   on status_reports (person_id);
create index if not exists status_reports_verified_idx on status_reports (verified);

-- ── Puntos de ayuda (comida / agua / refugio...) ────────────────────────────
create table if not exists aid_points (
  id uuid primary key default uuid_generate_v4(),
  name           text not null,
  types          aid_point_type[] not null default '{comida}',
  estado         text,
  location_text  text not null,
  schedule_text  text default '',
  description    text default '',
  photo_url      text,
  contact_name   text,
  contact_phone  text,
  verified       boolean not null default false,
  available      boolean not null default true,
  votes_available int not null default 0,
  votes_depleted  int not null default 0,
  likes          int not null default 0,
  updated_at     timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists aid_points_estado_idx on aid_points (estado);
create index if not exists aid_points_type_idx   on aid_points using gin (types);

-- Migración multi-país (ago. 2026): ver nota en `persons` más arriba.
alter table aid_points add column if not exists country text not null default 've';
create index if not exists aid_points_country_idx on aid_points (country);

-- Existencias POR CATEGORÍA (ej. {"agua":"urgente","comida":"cubierto"}), en
-- vez de un solo disponible/agotado para todo el punto. La fija el autor o el
-- admin (igual que `available`), no es un voto. Categoría ausente = cubierta.
alter table aid_points add column if not exists category_status jsonb not null default '{}'::jsonb;

-- ── Marchas / caravanas ─────────────────────────────────────────────────────
create table if not exists marches (
  id uuid primary key default uuid_generate_v4(),
  title           text not null,
  origin_text     text not null,
  destination_text text not null,
  depart_at       timestamptz not null,
  organizer_name  text not null,
  organizer_phone text not null,
  whatsapp_url    text,
  description     text default '',
  attendees_count int not null default 0,
  likes           int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists marches_depart_idx on marches (depart_at);

-- Migración multi-país (ago. 2026): ver nota en `persons` más arriba.
alter table marches add column if not exists country text not null default 've';
create index if not exists marches_country_idx on marches (country);

-- Vínculo opcional a un punto de ayuda concreto: qué necesidad atiende esta
-- caravana, para que se vea cruzada en la ficha del punto (ago. 2026).
alter table marches add column if not exists aid_point_id uuid references aid_points(id) on delete set null;
create index if not exists marches_aid_point_idx on marches (aid_point_id) where aid_point_id is not null;

-- ── Hospitales ──────────────────────────────────────────────────────────────
create table if not exists hospitals (
  id uuid primary key default uuid_generate_v4(),
  name          text not null,
  estado        text,
  location_text text default '',
  status        text not null default 'operativo' check (status in ('operativo','saturado','lleno','cerrado')),
  specialties   text[] not null default '{}',
  needs_text    text default '',
  contact_name  text,
  contact_phone text,
  verified      boolean not null default false,
  votes_supplies    int not null default 0,
  votes_no_supplies int not null default 0,
  likes             int not null default 0,
  updated_at    timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists hospitals_estado_idx on hospitals (estado);
create index if not exists hospitals_status_idx on hospitals (status);

-- Migración multi-país (ago. 2026): ver nota en `persons` más arriba.
alter table hospitals add column if not exists country text not null default 've';
create index if not exists hospitals_country_idx on hospitals (country);

create table if not exists hospital_patients (
  id uuid primary key default uuid_generate_v4(),
  hospital_id uuid not null references hospitals(id) on delete cascade,
  full_name   text not null,
  cedula      text,
  condition   text default '',
  status      text not null default 'estable' check (status in ('estable','critico','observacion','alta')),
  note        text default '',
  created_at timestamptz not null default now()
);
create index if not exists hospital_patients_hospital_idx on hospital_patients (hospital_id);

-- ── Comunidad / Feed ────────────────────────────────────────────────────────
create table if not exists posts (
  id uuid primary key default uuid_generate_v4(),
  type          text not null check (type in ('necesito','ofrezco','rescate','medico','caravana','identificar','info')),
  body          text not null check (length(body) between 5 and 1500),
  estado        text,
  location_text text default '',
  photo_url     text,
  link_url      text,
  author_name   text not null,
  contact_phone text,
  pinned        boolean not null default false,
  reactions     jsonb not null default '{"apoyo":0,"corazon":0,"hecho":0}',
  -- suma de las 3 reacciones, para poder ordenar el muro "por relevancia" sin
  -- tener que traer todo y sumar en el servidor.
  reactions_total int generated always as (
    coalesce((reactions->>'apoyo')::int, 0) +
    coalesce((reactions->>'corazon')::int, 0) +
    coalesce((reactions->>'hecho')::int, 0)
  ) stored,
  created_at timestamptz not null default now()
);

-- Migración para bases ya creadas: añade `reactions_total` (no existía).
alter table posts add column if not exists reactions_total int generated always as (
  coalesce((reactions->>'apoyo')::int, 0) +
  coalesce((reactions->>'corazon')::int, 0) +
  coalesce((reactions->>'hecho')::int, 0)
) stored;

create index if not exists posts_type_idx      on posts (type);
create index if not exists posts_estado_idx    on posts (estado);
create index if not exists posts_created_idx   on posts (created_at desc);
create index if not exists posts_pinned_idx    on posts (pinned);

-- Vínculo opcional a un punto de ayuda concreto (mismo patrón que marches
-- arriba): qué necesidad u oferta atiende este post, cruzado en su ficha.
alter table posts add column if not exists aid_point_id uuid references aid_points(id) on delete set null;
create index if not exists posts_aid_point_idx on posts (aid_point_id) where aid_point_id is not null;
create index if not exists posts_reactions_idx on posts (reactions_total desc);

-- Migración: ingesta automática de publicaciones de otras redes (Bluesky,
-- Mastodon) por hashtag. Nunca se publican directas: nacen `pending` y solo
-- se ven en /comunidad tras el visto bueno de un moderador en /admin (mismo
-- filtro en la capa de aplicación que usan personas sin verificar/denuncias,
-- ver `getPosts`/`getPostsPage` en `src/lib/data.ts`).
alter table posts add column if not exists origin text not null default 'community'
  check (origin in ('community','bluesky','mastodon'));
alter table posts add column if not exists moderation_status text not null default 'approved'
  check (moderation_status in ('pending','approved','rejected'));
-- Clave de deduplicación entre corridas del script de ingesta (p. ej.
-- "bluesky:at://did:.../app.bsky.feed.post/xyz"); las publicaciones de la
-- comunidad la dejan NULL (un índice único normal permite múltiples NULL,
-- así que no hace falta que sea parcial — y así el "on conflict" que hace
-- el .upsert() de PostgREST puede usarlo como árbitro sin restricciones raras).
alter table posts add column if not exists external_id text;
create unique index if not exists posts_external_id_idx on posts (external_id);
create index if not exists posts_moderation_status_idx on posts (moderation_status, created_at);

-- Migración multi-país (ago. 2026): ver nota en `persons` más arriba.
alter table posts add column if not exists country text not null default 've';
create index if not exists posts_country_idx on posts (country);

-- ── Denuncias de irregularidades ────────────────────────────────────────────
-- Reportes ciudadanos de irregularidades. Publicar requiere sesión (la app lo
-- exige); por eso `user_id` no es opcional en la práctica. La comunidad "Apoya".
create table if not exists complaints (
  id uuid primary key default uuid_generate_v4(),
  category      text not null check (category in ('riesgo_ninos','desvio_ayuda','fraude','abuso_autoridad','persona_desaparecida','otra')),
  body          text not null check (length(body) between 10 and 1500),
  estado        text,
  location_text text default '',
  photo_url     text,
  author_name   text not null,
  supports      int not null default 0,
  user_id       uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists complaints_category_idx on complaints (category);
create index if not exists complaints_created_idx  on complaints (created_at desc);
create index if not exists complaints_user_idx     on complaints (user_id);

-- Migración multi-país (ago. 2026): ver nota en `persons` más arriba.
alter table complaints add column if not exists country text not null default 've';
create index if not exists complaints_country_idx on complaints (country);

-- ── Mascotas ────────────────────────────────────────────────────────────────
create table if not exists pets (
  id uuid primary key default uuid_generate_v4(),
  status        text not null check (status in ('perdida','encontrada','refugio','veterinario')),
  species       text not null default 'perro' check (species in ('perro','gato','otro')),
  name          text default '',
  description   text not null check (length(description) between 5 and 800),
  photo_url     text,
  estado        text,
  location_text text default '',
  contact_phone text,
  user_id       uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists pets_status_idx  on pets (status);
create index if not exists pets_created_idx on pets (created_at desc);

-- Migración multi-país (ago. 2026): ver nota en `persons` más arriba.
alter table pets add column if not exists country text not null default 've';
create index if not exists pets_country_idx on pets (country);

-- ── Voluntarios ("Puedo ayudar") ────────────────────────────────────────────
create table if not exists volunteers (
  id uuid primary key default uuid_generate_v4(),
  type          text not null check (type in ('medico','enfermero','psicologo','rescatista','conductor','cocinero','traductor','electricista','otra')),
  name          text not null,
  availability_text text default '',
  skills_text   text default '',
  estado        text,
  location_text text default '',
  contact_phone text,
  contact_email text,
  photo_url     text,
  user_id       uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists volunteers_type_idx    on volunteers (type);
create index if not exists volunteers_created_idx  on volunteers (created_at desc);
create index if not exists idx_volunteers_user_id  on volunteers (user_id);

-- Migración multi-país (ago. 2026): ver nota en `persons` más arriba.
alter table volunteers add column if not exists country text not null default 've';
create index if not exists volunteers_country_idx on volunteers (country);

-- Búsqueda por texto libre en `posts`/`complaints`/`pets`/`volunteers`: la app
-- busca con `ILIKE '%texto%'` en varias columnas (comunidad, denuncias,
-- mascotas, voluntarios) SIN ningún índice que lo respalde — a diferencia de
-- `persons` (arriba). Sin índice, cada búsqueda escanea la tabla entera fila
-- por fila; sin límite de peticiones, es una forma barata de generar carga
-- cara en la base a medida que estas tablas crezcan. Un índice `gin_trgm_ops`
-- por columna deja que Postgres combine los que hagan falta (`BitmapOr`) en
-- vez de recorrer todo. (Va aquí, después de crear las 4 tablas, no antes —
-- antes estaba arriba del todo y fallaba en una base nueva y vacía.)
create index if not exists posts_body_trgm_idx          on posts using gin (body gin_trgm_ops);
create index if not exists posts_location_trgm_idx      on posts using gin (location_text gin_trgm_ops);
create index if not exists posts_author_trgm_idx         on posts using gin (author_name gin_trgm_ops);
create index if not exists complaints_body_trgm_idx      on complaints using gin (body gin_trgm_ops);
create index if not exists complaints_location_trgm_idx  on complaints using gin (location_text gin_trgm_ops);
create index if not exists complaints_author_trgm_idx    on complaints using gin (author_name gin_trgm_ops);
create index if not exists pets_name_trgm_idx            on pets using gin (name gin_trgm_ops);
create index if not exists pets_description_trgm_idx     on pets using gin (description gin_trgm_ops);
create index if not exists pets_location_trgm_idx        on pets using gin (location_text gin_trgm_ops);
create index if not exists volunteers_name_trgm_idx      on volunteers using gin (name gin_trgm_ops);
create index if not exists volunteers_skills_trgm_idx    on volunteers using gin (skills_text gin_trgm_ops);
create index if not exists volunteers_location_trgm_idx  on volunteers using gin (location_text gin_trgm_ops);

-- ── Héroes (sección curada de Noticias) ─────────────────────────────────────
-- Cualquiera puede proponer un héroe; nace verified=false ("sin verificar") y
-- el moderador le da el visto bueno o lo elimina. Tiene "me gusta" y comentarios.
create table if not exists heroes (
  id uuid primary key default uuid_generate_v4(),
  category      text not null check (category in ('bombero','rescatista','perro','medico','voluntario','donante','fuerza','otro')),
  title         text not null,
  body          text not null,
  estado        text,
  location_text text default '',
  photo_url     text,
  source_name   text,
  source_url    text,
  author_name   text not null default 'Comunidad',
  verified      boolean not null default false,
  likes         int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists heroes_verified_idx on heroes (verified, created_at desc);

-- Migración multi-país (ago. 2026): ver nota en `persons` más arriba.
alter table heroes add column if not exists country text not null default 've';
create index if not exists heroes_country_idx on heroes (country);

-- ── Noticias curadas (las agrega el equipo, con su fuente) ───────────────────
create table if not exists news_items (
  id uuid primary key default uuid_generate_v4(),
  kind        text not null check (kind in ('ayuda','noticia')),
  title       text not null,
  body        text not null,
  source_name text,
  source_url  text,
  photo_url   text,
  likes       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists news_items_kind_idx on news_items (kind, created_at desc);

-- Migración multi-país (ago. 2026): ver nota en `persons` más arriba. Aquí el
-- equipo (admin) elige el país al crear la noticia, no se infiere del cliente.
alter table news_items add column if not exists country text not null default 've';
create index if not exists news_items_country_idx on news_items (country);

-- ── Comentarios (foro de comunidad) ─────────────────────────────────────────
create table if not exists comments (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null check (entity_type in ('person','aid_point','march','post','hospital','complaint','pet','hero','news_item')),
  entity_id   uuid not null,
  -- Respuesta en hilo (un nivel): apunta al comentario raíz; null si es de primer nivel.
  parent_id   uuid references comments(id) on delete cascade,
  author_name text not null,
  body        text not null check (length(body) between 1 and 1000),
  photo_url   text,
  likes       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists comments_entity_idx on comments (entity_type, entity_id);
create index if not exists comments_parent_idx on comments (parent_id);

-- ── updated_at automático en persons ────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists persons_touch on persons;
create trigger persons_touch before update on persons
  for each row execute function touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Lectura pública; escritura pública controlada (la app valida + Turnstile).
-- Los cambios de estado público se hacen con la service role tras verificar
-- un reporte, NO directamente desde el cliente.
alter table persons        enable row level security;
alter table status_reports enable row level security;
alter table aid_points     enable row level security;
alter table marches        enable row level security;
alter table comments         enable row level security;
alter table posts            enable row level security;
alter table complaints       enable row level security;
alter table pets             enable row level security;
alter table volunteers       enable row level security;
alter table heroes           enable row level security;
alter table news_items       enable row level security;
alter table hospitals        enable row level security;
alter table hospital_patients enable row level security;
alter table person_owners    enable row level security;
alter table resource_owners  enable row level security;
alter table resource_managers enable row level security;
-- resource_managers: SIN políticas (solo service role). Quién gestiona un recurso
-- no es público; se resuelve en el servidor con la service role.

-- person_owners / resource_owners: SIN lectura pública (los tokens son secretos)
-- y SIN inserción pública. Se escriben con service role al publicar.

-- Lectura para todos. Drop antes de create para que re-ejecutar el archivo sea
-- idempotente (Postgres no tiene "create policy if not exists").
drop policy if exists "public_read_persons"    on persons;
drop policy if exists "public_read_aid"        on aid_points;
drop policy if exists "public_read_marches"    on marches;
drop policy if exists "public_read_comments"   on comments;
drop policy if exists "public_read_posts"      on posts;
drop policy if exists "public_read_complaints" on complaints;
drop policy if exists "public_read_pets"       on pets;
drop policy if exists "public_read_volunteers" on volunteers;
drop policy if exists "public_read_heroes"     on heroes;
drop policy if exists "public_read_news"       on news_items;
drop policy if exists "public_read_hospitals"  on hospitals;
drop policy if exists "public_read_patients"   on hospital_patients;

create policy "public_read_persons"   on persons          for select using (true);
create policy "public_read_aid"       on aid_points       for select using (true);
create policy "public_read_marches"   on marches          for select using (true);
create policy "public_read_comments"  on comments         for select using (true);
create policy "public_read_posts"     on posts            for select using (true);
create policy "public_read_complaints" on complaints      for select using (true);
create policy "public_read_pets"      on pets             for select using (true);
create policy "public_read_volunteers" on volunteers      for select using (true);
create policy "public_read_heroes"    on heroes           for select using (true);
create policy "public_read_news"      on news_items       for select using (true);
create policy "public_read_hospitals" on hospitals        for select using (true);
create policy "public_read_patients"  on hospital_patients for select using (true);

-- Escrituras (INSERT/UPDATE/DELETE): SOLO por service role desde el servidor.
-- Antes había inserción pública con la clave anon; se quitó porque permitía
-- saltarse Turnstile y la validación, e incluso falsear `user_id`. Todas las
-- acciones escriben con SUPABASE_SERVICE_ROLE_KEY (obligatoria en producción).
-- Re-ejecutar este archivo elimina las políticas antiguas si ya existían:
drop policy if exists "public_insert_persons"            on persons;
drop policy if exists "public_insert_reports"            on status_reports;
drop policy if exists "public_insert_aid"                on aid_points;
drop policy if exists "public_insert_marches"            on marches;
drop policy if exists "public_insert_comments"           on comments;
drop policy if exists "public_insert_posts"              on posts;
drop policy if exists "public_insert_hospitals"          on hospitals;
drop policy if exists "public_insert_patients"           on hospital_patients;
drop policy if exists "public_insert_owners"             on person_owners;
drop policy if exists "public_insert_resource_owners"    on resource_owners;

-- Reacciones a publicaciones y disponibilidad de puntos: se actualizan vía
-- acciones del servidor. Si no usas service role, habilita estas dos:
-- create policy "public_update_post_reactions" on posts      for update using (true) with check (true);
-- create policy "public_update_aid_available"  on aid_points for update using (true) with check (true);

-- Nota: NO se crea política de UPDATE/DELETE para anon.
-- Editar estado de personas o verificar reportes/puntos requiere la
-- service role (servidor), evitando que cualquiera marque "localizado".

-- ── Cuentas: perfil de usuario (login OPCIONAL) ──────────────────────────────
-- Supabase Auth gestiona auth.users (correo de acceso + hash de la contraseña).
-- Aquí solo guardamos el nombre de usuario (único) y, si lo dieron, el correo de
-- recuperación. El nombre visible se desnormaliza en cada publicación/comentario,
-- así que el cliente NUNCA necesita leer esta tabla.
create table if not exists profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  username       text not null,
  username_lower text not null unique,
  login_email    text not null,
  recovery_email text,
  created_at     timestamptz not null default now()
);

-- Migración para bases ya creadas: foto de perfil (opcional) y preferencia de
-- avisos por correo (ver /perfil y /configuracion).
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists email_notifications boolean not null default false;

alter table profiles enable row level security;
-- Sin políticas a propósito: `profiles` solo se lee/escribe con la service role
-- desde el servidor (registro e inicio de sesión). Con la clave anon no se puede
-- leer ni el nombre de usuario, ni el correo de recuperación.

-- ── Cuentas: enlazar publicaciones y comentarios a la cuenta (OPCIONAL) ───────
-- Si publicas con sesión iniciada, la fila queda ligada a tu user_id y la puedes
-- gestionar desde cualquier dispositivo. Sigue conviviendo con el token anónimo.
alter table persons    add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table posts      add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table aid_points add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table marches    add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table comments   add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table hospitals  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_persons_user_id    on persons(user_id);
create index if not exists idx_posts_user_id      on posts(user_id);
create index if not exists idx_aid_points_user_id on aid_points(user_id);
create index if not exists idx_marches_user_id    on marches(user_id);
create index if not exists idx_hospitals_user_id  on hospitals(user_id);

-- Migración para bases ya creadas: coordenada exacta del punto de ayuda
-- (marcada en el mapa o por GPS). null si solo se dio la ubicación en texto.
alter table aid_points add column if not exists lat double precision;
alter table aid_points add column if not exists lng double precision;
alter table hospitals  add column if not exists lat double precision;
alter table hospitals  add column if not exists lng double precision;
alter table persons    add column if not exists lat double precision;
alter table persons    add column if not exists lng double precision;
alter table volunteers add column if not exists lat double precision;
alter table volunteers add column if not exists lng double precision;

-- Migración para bases ya creadas: el "visto bueno" del admin a hospitales.
-- (En instalaciones nuevas ya viene en el create table de hospitals.)
alter table hospitals  add column if not exists verified boolean not null default false;

-- Migración para bases ya creadas: publicaciones fijadas (destacadas) en el muro.
alter table posts      add column if not exists pinned boolean not null default false;

-- Migración para bases ya creadas: foto opcional en voluntarios.
alter table volunteers add column if not exists photo_url text;

-- Migración para bases ya creadas: permitir comentarios en denuncias, mascotas
-- y héroes. (Recrea el check de comments.entity_type para incluirlos.)
alter table comments drop constraint if exists comments_entity_type_check;
alter table comments add constraint comments_entity_type_check
  check (entity_type in ('person','aid_point','march','post','hospital','complaint','pet','hero','news_item'));

-- ── Guardar / seguir publicaciones (requiere cuenta) ─────────────────────────
-- Quien inició sesión puede "guardar" una publicación para seguir su actividad
-- (avisos de comentarios nuevos en la campanita) y volver a ella. Es privado:
-- cada quien solo ve y gestiona sus propios guardados. `title` se desnormaliza
-- para mostrar la lista sin leer la tabla origen. Único por (usuario, entidad).
create table if not exists saved_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('person','aid_point','march','post','hospital','complaint','pet','hero')),
  entity_id   uuid not null,
  title       text not null default '',
  created_at  timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);
create index if not exists saved_items_user_idx on saved_items (user_id, created_at desc);

alter table saved_items enable row level security;
-- Solo el dueño lee/crea/borra sus guardados (defensa en profundidad; el
-- servidor además filtra por user_id de la sesión).
drop policy if exists "saved_items_select_own" on saved_items;
drop policy if exists "saved_items_insert_own" on saved_items;
drop policy if exists "saved_items_delete_own" on saved_items;
create policy "saved_items_select_own" on saved_items for select using (auth.uid() = user_id);
create policy "saved_items_insert_own" on saved_items for insert with check (auth.uid() = user_id);
create policy "saved_items_delete_own" on saved_items for delete using (auth.uid() = user_id);

-- ── Migración: mascotas con el mismo alcance que un punto de ayuda ──────────
-- Antes una mascota reportada quedaba fija para siempre (sin editar, sin
-- marcar "encontrada", sin borrar). Ahora tiene el mismo modelo de gestión por
-- enlace privado (token) que puntos de ayuda/caravanas/posts, más enlace a la
-- cuenta si publicaste con sesión iniciada.
alter table resource_owners drop constraint if exists resource_owners_entity_type_check;
alter table resource_owners add constraint resource_owners_entity_type_check
  check (entity_type in ('aid_point','march','post','pet'));

alter table pets add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table pets add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_pets_user_id on pets(user_id);

drop trigger if exists pets_touch on pets;
create trigger pets_touch before update on pets
  for each row execute function touch_updated_at();

-- ── Migración: enlazar voluntarios a la cuenta (para saber si ya te ofreciste) ──
-- Antes `volunteers` no tenía `user_id`, así que no había forma de saber si
-- quien inició sesión ya se había ofrecido, y el aviso "Quiero ayudar" del
-- inicio seguía apareciendo aunque ya lo hubieras hecho.
alter table volunteers add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_volunteers_user_id on volunteers(user_id);

-- ── Migración: un voto por cuenta en el consenso de disponibilidad ──────────
-- Antes "votar" solo sumaba 1 a un contador (votes_available/votes_depleted en
-- aid_points, votes_supplies/votes_no_supplies en hospitals): una sola cuenta
-- podía llamar la acción sin límite y falsear la señal de consenso que otros
-- usan para decidir a dónde ir a buscar ayuda. Ahora cada cuenta tiene UN voto
-- por recurso (puede cambiarlo, no repetirlo) y los contadores se recalculan
-- a partir de esta tabla.
create table if not exists consensus_votes (
  entity_type text not null check (entity_type in ('aid_point','hospital')),
  entity_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  vote        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (entity_type, entity_id, user_id)
);
create index if not exists consensus_votes_entity_idx on consensus_votes (entity_type, entity_id);

alter table consensus_votes enable row level security;
-- Sin lectura pública: es el voto individual de cada cuenta (el contador
-- agregado sí es público, en aid_points/hospitals). Solo el servidor
-- (service role) la lee/escribe para recalcular esos contadores.
