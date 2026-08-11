# Desplegar en VPS con GitHub Actions (PM2 + nginx)

Build en GitHub Actions → subida por SSH (rsync) → PM2 corre el servidor
`standalone` de Next.js detrás de nginx. El workflow está en
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) y se dispara en
cada push a `main` (o manual desde la pestaña **Actions**).

> Requisito en el VPS: **Node 20.6 o superior** (el arranque usa `--env-file`).
> Compruébalo con `node --version`.

---

## 1) Secrets del repositorio (GitHub → Settings → Secrets and variables → Actions)

Conexión al VPS:
- `VPS_HOST` — IP o host del VPS.
- `VPS_USER` — usuario SSH (p. ej. `deploy` o `ubuntu`).
- `VPS_PORT` — puerto SSH (si es 22 puedes omitirlo).
- `VPS_SSH_KEY` — **clave privada** SSH en **base64** (una sola línea) con acceso a ese usuario.

> La carpeta destino NO es un secret: va fija en el workflow como
> `DEPLOY_PATH: /var/www/elmundotebusca` (cámbiala ahí si usas otra ruta).
> La llave va en base64 para que no se rompan los saltos de línea al copiarla:
> genérala con `base64 -w0 ~/.ssh/deploy_elmundotebusca`.

Variables que se hornean en el build (cliente):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

(`NEXT_PUBLIC_SITE_URL` ya va fijo a `https://elmundotebusca.com` en el workflow.)

> Los **secretos de servidor** (service role, Turnstile secret, admin) NO van en
> GitHub: viven en el `.env` del VPS (paso 2).

### Generar la llave SSH de despliegue (en tu PC)
```bash
ssh-keygen -t ed25519 -C "deploy-elmundotebusca" -f deploy_key
# Pega deploy_key.pub en el VPS:
ssh-copy-id -i deploy_key.pub VPS_USER@VPS_HOST
# Copia el CONTENIDO de deploy_key (la privada) en el secret VPS_SSH_KEY.
```

---

## 2) Preparar el VPS (una sola vez)

```bash
# Carpeta destino (igual a VPS_PATH) y permisos del usuario de deploy
sudo mkdir -p /var/www/elmundotebusca
sudo chown -R $USER:$USER /var/www/elmundotebusca

# Secretos de runtime: crea el .env (NO se sube nunca; rsync lo conserva)
cat > /var/www/elmundotebusca/.env <<'EOF'
SUPABASE_SERVICE_ROLE_KEY=pega-aqui
TURNSTILE_SECRET_KEY=pega-aqui
ADMIN_TOKEN=pega-aqui
# Útiles también en runtime (no son secretas):
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=pega-aqui
NEXT_PUBLIC_SITE_URL=https://elmundotebusca.com
EOF
chmod 600 /var/www/elmundotebusca/.env

# PM2 global y arranque automático tras reinicios
sudo npm install -g pm2
pm2 startup    # ejecuta el comando que imprime (configura el servicio)
```

El primer despliegue (push a `main`) creará el proceso `elmundotebusca` con PM2.
A partir de ahí cada push hace `pm2 reload` (recarga sin downtime).

Comandos útiles: `pm2 status`, `pm2 logs elmundotebusca`, `pm2 reload elmundotebusca`.

---

## 3) nginx (reverse proxy) + SSL

> ⚠️ **Seguridad**: agrega el bloque `server { ... default_server ... return 444; }`
> de abajo ANTES del bloque real. Sin él, nginx acepta cualquier `Host` que
> alguien mande directo a la IP del VPS (saltándose Cloudflare y el dominio
> real) y lo reenvía igual a la app — la app ya no confía en esa cabecera
> para nada sensible (se corrigió en el código), pero es mejor cortarlo aquí,
> en el borde, para que ni siquiera le llegue a la app.

Crea `/etc/nginx/sites-available/elmundotebusca` :
```nginx
# Rechaza cualquier petición con un Host desconocido (IP directa, dominio
# ajeno) ANTES de que llegue a la app. Sin esto, este bloque sería el que
# nginx usa "por defecto" para hosts que no reconoce.
server {
    listen 80 default_server;
    server_name _;
    return 444;   # cierra la conexión sin responder nada
}

server {
    listen 80;
    server_name elmundotebusca.com www.elmundotebusca.com;

    client_max_body_size 12M;   # subida de fotos
    server_tokens off;          # no anunciar la versión exacta de nginx

    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/elmundotebusca /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL gratis con Let's Encrypt (añade el bloque 443 y la renovación automática)
sudo certbot --nginx -d elmundotebusca.com -d www.elmundotebusca.com
```

---

## 4) Mover el dominio a tu VPS (DNS en Namecheap)

En la zona DNS de `elmundotebusca.com`, **reemplaza** los registros que apuntan a
Vercel por:
- `A`  `@`   → **IP de tu VPS**
- `A`  `www` → **IP de tu VPS**  (o un `CNAME www` → `elmundotebusca.com`)

Espera la propagación (minutos a unas horas). Cuando resuelva al VPS, corre el
`certbot` del paso 3 (necesita que el dominio ya apunte al VPS para validar).

> Mientras tanto puedes probar el VPS por su IP. Una vez que el dominio esté en el
> VPS con SSL OK, puedes desconectar el proyecto en Vercel (o dejarlo de respaldo).

---

## 5) Base de datos

Sigue siendo **Supabase** (no cambia). Si aún no lo hiciste, ejecuta una vez
`supabase/schema.sql` en el SQL Editor de Supabase para tener todas las tablas
(incluida `saved_items`). El VPS solo corre la app; los datos viven en Supabase.

## 6) Ingesta automática de redes sociales (opcional)

`scripts/fetch-social-posts.mjs` busca hashtags (p. ej. `#TerremotoVE`) en las
APIs públicas de Bluesky y Mastodon y deja lo que encuentra en la cola de
moderación de `/admin` (nunca publica directo). El deploy (`deploy.yml`) ya
copia `scripts/` al VPS y le instala sus propias dependencias (aparte del
`node_modules` recortado de Next: `@supabase/supabase-js` no queda incluido
ahí, así que el script trae su propio `scripts/package.json`).

**No uses `npm run fetch:social` en el VPS** — el `package.json` que Next
genera para el standalone no tiene ese script; llama a `node` directo.
Añade la entrada de cron (agrega una línea al crontab existente del usuario,
**no lo reemplaces**: en este VPS compartido `crontab -l` ya tiene tareas de
otros proyectos):

```bash
crontab -l > /tmp/crontab_actual.txt   # respaldo antes de tocar nada
cp /tmp/crontab_actual.txt /tmp/crontab_nuevo.txt
cat >> /tmp/crontab_nuevo.txt <<'EOF'

# El Mundo Te Busca: ingesta de redes sociales por hashtag
*/15 * * * * cd /var/www/elmundotebusca/scripts && /usr/bin/node fetch-social-posts.mjs >> /var/www/elmundotebusca/logs/social-fetch.log 2>&1
EOF
diff /tmp/crontab_actual.txt /tmp/crontab_nuevo.txt   # confirma que solo se agrega, nada se borra
crontab /tmp/crontab_nuevo.txt
mkdir -p /var/www/elmundotebusca/logs
```

Ver los comentarios al inicio del script para las variables opcionales.
Desde la migración multi-país busca por separado en Venezuela y Colombia
(`SOCIAL_HASHTAGS_VE`/`SOCIAL_HASHTAGS_CO`, con el nombre viejo `SOCIAL_HASHTAGS`
como alias de VE si no se actualiza el `.env`) y ahora también en **Reddit**
además de Bluesky/Mastodon (`REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` — app
gratis tipo "script" en reddit.com/prefs/apps; sin esas dos variables, Reddit
simplemente no aporta resultados, igual que Bluesky sin sesión). El resto
(`MASTODON_INSTANCES`, `BLUESKY_IDENTIFIER`/`BLUESKY_APP_PASSWORD`) ya está
configurado en el `.env` del VPS.

## 7) Calentar la caché de noticias (opcional)

`src/app/api/cron/warm-news/route.ts` precarga la caché de `src/lib/news.ts`
(GDELT/GNews + traducción) para que la primera visita real del día no espere a
que respondan esas APIs externas. Sin esta entrada de cron, el endpoint sigue
ahí pero nadie lo llama — la caché solo se calienta con el primer visitante
real después de que vence (ver `NEWS_TTL_MS`/`CRISIS_STATS_TTL_MS`). Añádela
al mismo crontab del paso anterior (mismo cuidado: agregar, no reemplazar):

```bash
crontab -l > /tmp/crontab_actual.txt   # respaldo antes de tocar nada
cp /tmp/crontab_actual.txt /tmp/crontab_nuevo.txt
cat >> /tmp/crontab_nuevo.txt <<'EOF'

# El Mundo Te Busca: calienta la cache de noticias cada hora
0 * * * * curl -fsS "http://127.0.0.1:3200/api/cron/warm-news?secret=TU_CRON_SECRET" >> /var/www/elmundotebusca/logs/warm-news.log 2>&1
EOF
diff /tmp/crontab_actual.txt /tmp/crontab_nuevo.txt   # confirma que solo se agrega, nada se borra
crontab /tmp/crontab_nuevo.txt
```

Cambia `TU_CRON_SECRET` por el valor real de `CRON_SECRET` en el `.env` del
VPS (o quita `?secret=...` si lo dejaste vacío a propósito — el endpoint
queda abierto sin clave, ver `.env.example`). Usa el puerto interno
(`127.0.0.1:3200`, el mismo que `proxy_pass` en el bloque de nginx del paso 3),
no el dominio público: así el cron no depende de DNS/SSL ni pasa por
mantenimiento (`/api/cron` ya está exceptuado en `middleware.ts`, pero pasar
por nginx sería un salto innecesario para una llamada interna).

---

## Resumen del flujo
1. `git push origin main` →
2. GitHub Actions: `npm ci` + `npm run build` (con las NEXT_PUBLIC_*) →
3. empaqueta `.next/standalone` (+ estáticos, `public`, `ecosystem.config.cjs`) →
4. `rsync` al VPS (conserva el `.env`) →
5. `pm2 startOrReload` → nginx sirve `https://elmundotebusca.com`.
