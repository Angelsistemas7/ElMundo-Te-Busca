# Entrar con Google — qué falta hacer a mano

El código ya está listo y compila. Para que el botón **"Continuar con Google"**
funcione de verdad faltan dos pasos de configuración que se hacen en paneles web
(no en el código, y no los puede hacer Claude porque implican crear credenciales
con tu cuenta).

## 🔴 ANTES DE NADA: hay DOS proyectos de Supabase, usa el correcto

Verificado por SSH contra el VPS el 15 ago. 2026:

| Dónde | Proyecto Supabase |
| --- | --- |
| **Producción** (`/var/www/elmundotebusca/.env`) | **`qcmqlqriqqvctwuvoyvc`** ← este es el bueno |
| `.env` del repo local | `nuckcchqqogjjwfvbtux` (otro proyecto, NO es el del sitio) |

Todo lo de este documento va en **`qcmqlqriqqvctwuvoyvc`**. Si se activa Google
en el otro proyecto, el botón fallará en producción sin dar una pista clara del
motivo.

Este desajuste es el que venía documentado como hipótesis en `PROXIMO-CHAT.md`
("posible mismatch de proyecto Supabase") y ahora queda **confirmado**. De paso
resuelve el otro pendiente marcado como urgente: se comprobó contra la base real
de producción que las columnas `persons.duplicate_match_id`, `photo_hash`,
`possible_duplicate`, `aid_points.category_status`, `posts.aid_point_id` y
`hospitals.photo_url` **sí existen** (HTTP 200 todas). El registro de personas
NO está roto; la comprobación anterior se hizo contra el proyecto equivocado.

> **Importante**: hasta que se completen estos pasos, el botón aparece pero al
> pulsarlo avisa que no está disponible y ofrece el login de usuario+contraseña
> de siempre. Nada del sitio se rompe mientras tanto.

## Decisión de arquitectura (por qué NO se cambió de proveedor)

Google entra como **un proveedor más dentro del Supabase Auth que ya usa el
sitio**, no como un sistema de cuentas aparte. El motivo es concreto: hay **18
columnas** con clave foránea a `auth.users(id)` (personas, publicaciones, puntos
de ayuda, caravanas, comentarios, hospitales, mascotas, voluntarios, denuncias,
perfiles, gestores delegados, guardados…) y políticas RLS que usan `auth.uid()`.
Mover la identidad a otro proveedor obligaría a reescribir todo eso y a migrar
las cuentas existentes. Con este camino, un usuario de Google nace en
`auth.users` igual que uno de contraseña y todo lo demás sigue funcionando sin
tocarse.

Las **credenciales** sí salen de tu proyecto de Firebase: un proyecto de Firebase
es también un proyecto de Google Cloud, y el Client ID de OAuth se crea ahí.

## Paso 1 — Crear las credenciales en Google Cloud

1. Entra en <https://console.cloud.google.com/apis/credentials> y arriba elige
   **tu proyecto de Firebase** (aparece en la misma lista).
2. Si te lo pide, configura primero la **pantalla de consentimiento**:
   - Tipo: **Externo**.
   - Nombre de la app: `El Mundo Te Busca`; correo de soporte: el tuyo.
   - Dominio autorizado: `elmundotebusca.com`.
   - Permisos: deja los básicos (`email`, `profile`, `openid`). **No pidas
     permisos extra** — cuantos menos datos, mejor, y menos revisión de Google.
   - Publícala (si queda en "Prueba", solo entran las cuentas que listes a mano).
3. **Crear credenciales → ID de cliente de OAuth → Aplicación web**.
4. En **URI de redireccionamiento autorizados** pega esta, y solo esta:

   ```
   https://qcmqlqriqqvctwuvoyvc.supabase.co/auth/v1/callback
   ```

   Ojo con dos cosas: aquí va la URL **de Supabase**, no la del sitio (Google le
   responde a Supabase, y Supabase reenvía después a `elmundotebusca.com`); y es
   el proyecto **de producción**, no el del `.env` local (ver el aviso del
   principio). Sin barra al final.
5. Guarda y copia el **Client ID** y el **Client Secret**.

## Paso 2 — Activar Google en Supabase

1. Dashboard de Supabase, **en el proyecto `qcmqlqriqqvctwuvoyvc`** →
   **Authentication → Providers → Google**.
2. Actívalo y pega el **Client ID** y el **Client Secret** del paso anterior.
3. En **Authentication → URL Configuration**:
   - **Site URL**: `https://elmundotebusca.com`
   - En **Redirect URLs** añade:
     ```
     https://elmundotebusca.com/auth/callback
     ```
     Y, si quieres probar en tu computadora, también:
     ```
     http://localhost:3000/auth/callback
     ```

Con eso el botón ya funciona. No hace falta ninguna variable nueva en el `.env`
ni volver a desplegar por este motivo (las claves viven en Supabase).

## Handoff — quién hace qué

| Tarea | Quién | Estado |
| --- | --- | --- |
| Código del botón, callback y paso de nombre de usuario | Claude | ✅ Hecho, build verde |
| Crear el ID de cliente de OAuth en Google Cloud | Dueño / equipo | Paso 1 |
| Activar el proveedor Google en Supabase (proyecto correcto) | Dueño / equipo | Paso 2 |
| Desplegar (commit + push → GitHub Actions) | Equipo | Pendiente |
| Prueba de punta a punta en el sitio publicado | Equipo | Pendiente |

**No hay variables de entorno nuevas.** Se comprobó por SSH que el `.env` del VPS
ya tiene sus 13 variables completas, sin ningún `pega-aqui` y sin vacías, con
`MAINTENANCE_MODE=false`. Las credenciales de Google viven **solo** en el panel
de Supabase, así que no hay que tocar el `.env` ni reiniciar PM2 por este cambio.

> ⚠️ El botón no aparecerá en `elmundotebusca.com` hasta que se despliegue: el
> código está en la carpeta local, sin commit. Configurar Google y Supabase antes
> del despliegue es correcto y no rompe nada — simplemente el botón aún no se ve.

## Cómo comprobar que quedó bien

1. Entra al sitio en una ventana privada y pulsa **Entrar → Continuar con Google**.
2. Elige una cuenta. Debe volver al sitio pidiendo **elegir nombre de usuario**.
3. Escribe uno y continúa: vuelves a la página donde estabas, ya con sesión.
4. Comprueba en **Supabase → Authentication → Users** que aparece la cuenta
   nueva, y en la tabla `profiles` que tiene su fila con ese nombre.

## Qué puede hacer una cuenta creada con Google

**Todo lo que puede hacer una cuenta normal**, sin excepciones. No hay una "cuenta
de segunda": el usuario de Google nace en `auth.users` igual que uno de
usuario+contraseña, y cada función del sitio resuelve la identidad con
`getCurrentUser()` y guarda `user_id` — el mismo camino para ambos tipos. Eso
incluye ofrecerse como **voluntario** (`registerVolunteerAction`), publicar
personas, puntos de ayuda, caravanas, mascotas y denuncias, comentar, reaccionar,
guardar, "Mis publicaciones", las notificaciones de la campanita, los enlaces de
gestión de sus propias publicaciones y solicitar ser gestor delegado de un
hospital o punto de ayuda.

La única diferencia real es la contraseña: no tiene una en este sitio (la
administra Google), y de ahí salen los dos ajustes de la pantalla de
*Configuración* descritos abajo.

## Detalles del comportamiento (para saber qué esperar)

- **Nombre de usuario**: Google no da uno, y en este sitio el nombre de usuario
  es la identidad pública (comentarios, `/perfil/publico`, gestores delegados).
  Por eso el primer ingreso pasa por `/cuenta/usuario`. Mientras no se elija, la
  cuenta existe pero **no cuenta como sesión iniciada** — a propósito, para que
  nadie aparezca publicando como "Usuario".
- **Mismo correo que una cuenta vieja**: si alguien ya tenía cuenta con
  contraseña usando ese correo y luego entra con Google, Supabase enlaza ambas
  identidades al mismo usuario. Conserva su nombre y sus publicaciones, y podrá
  entrar de las dos formas.
- **Cuentas de Google no tienen contraseña aquí**: en *Configuración*, en vez del
  formulario de cambiar contraseña se explica que la clave se administra desde
  Google; y al eliminar la cuenta se confirma tecleando el nombre de usuario (no
  hay contraseña que pedir).
- **Turnstile**: el botón de Google no lo usa. La propia pantalla de Google ya
  hace de barrera anti-bot y en ese punto todavía no se escribe nada en la base.
- **Selector de cuenta**: siempre se muestra (`prompt=select_account`) en vez de
  entrar con la última usada. En teléfonos prestados o compartidos —lo normal en
  un refugio— entrar sin querer con la cuenta de otra persona sería grave.

## Nota para desarrollo local

El `.env` del repo trae `NEXT_PUBLIC_SITE_URL=https://elmundotebusca.com`, y el
callback usa **siempre** esa variable para armar la vuelta (nunca las cabeceras
de la petición, que puede falsear quien la envía — es la misma precaución que ya
había en `middleware.ts` y en los correos de recuperación). Efecto práctico: si
pruebas en `localhost` con ese `.env`, al volver de Google te manda al sitio en
producción. Para probar en local, crea un `.env.local` con:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Archivos que se tocaron

| Archivo | Qué hace |
| --- | --- |
| `src/lib/auth.ts` | `getGoogleAuthUrl`, `completeOAuthLogin`, `completeOAuthProfile`, `getPendingOAuthUser`, `currentUserHasPassword` |
| `src/app/auth/callback/route.ts` | Vuelta de Google: cambia el código por sesión y decide a dónde ir |
| `src/app/cuenta/usuario/page.tsx` | Paso de "elige tu nombre de usuario" |
| `src/components/ChooseUsernameForm.tsx` | Formulario de ese paso |
| `src/components/GoogleSignInButton.tsx` | El botón (con el logo en SVG, sin peticiones extra) |
| `src/components/AuthMenu.tsx` | Botón + separador sobre el login de siempre |
| `src/components/AccountSettings.tsx` | Adapta contraseña y borrado de cuenta a cuentas sin contraseña |
| `src/app/actions.ts` | `startGoogleLoginAction`, `chooseUsernameAction` |
| `src/lib/validation.ts` | `chooseUsernameSchema` (mismas reglas de nombre de siempre) |
