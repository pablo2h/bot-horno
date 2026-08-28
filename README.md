# Ruffus el Hornero — Bot de WhatsApp

Bot conversacional **menu-based** para el número de WhatsApp Business de Horno.
Responde como _Ruffus el Hornero_, el pajarito del equipo que mueve la correspondencia 🐦‍🔥:
da la bienvenida, muestra servicios/equipo/proyectos desde Supabase y deriva las
consultas del equipo guardándolas como _leads_.

## Stack

- **Transporte:** [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) (protocolo WhatsApp Web, no oficial).
- **Datos:** Supabase REST sobre el schema `horno` (lectura con anon key + RLS pública).
- **Persistencia de leads:** tabla `horno.whatsapp_leads` (escritura con anon + política RLS de insert, o service_role si se setea `BOT_SUPABASE_SERVICE_ROLE_KEY`).
- **Runtime:** Node ≥18, TypeScript, ejecutado con `tsx`.

## Requisitos

- Node ≥18 y pnpm.
- El proyecto de Supabase bueno es `obvnhcccovvruvpooyap` ("stage"). El bot usa las
  variables `BOT_*` definidas en `apps/bot-whatsapp/.env` (no las del `.env.local` del
  monorepo, que apuntan a un proyecto muerto).
- Configuración manual en el proyecto (ver abajo): exponer el schema `horno`, aplicar
  grants y crear `horno.whatsapp_leads`.

## ⚠️ Proyecto de Supabase y setup manual

El `.env.local` del monorepo apunta a `phtbdwjkjoztevwpicss.supabase.co`, un proyecto
que **no resuelve** (muerto/pausado). El CLI de Supabase está linkeado al proyecto
bueno: `obvnhcccovvruvpooyap` ("stage"), que es donde vive el schema `horno`.

Por eso el bot usa variables propias `BOT_*` (ver `apps/bot-whatsapp/.env`):

- `BOT_SUPABASE_URL` → `https://obvnhcccovvruvpooyap.supabase.co`
- `BOT_SUPABASE_ANON_KEY` → publishable key del proyecto correcto
- `BOT_SUPABASE_SERVICE_ROLE_KEY` (opcional) → si se setea, escribe con service_role;
  si no, escribe con anon (la tabla `horno.whatsapp_leads` tiene política de insert para `anon`).

Si tu `.env.local` ya apunta al proyecto correcto, podés borrar `apps/bot-whatsapp/.env`.

### Pasos manuales en el proyecto `obvnhcccovvruvpooyap` (Dashboard)

1. **Exponer el schema `horno`**: _Project Settings → API → Exposed schemas_ → agregar
   `horno`. Si no, el bot da `PGRST106: Invalid schema: horno`.
2. **Grants de lectura/escritura**: correr `supabase/migrations/20260828090100_horno_grants.sql`
   en el SQL Editor (o pegar el SQL). Sin esto da `42501: permission denied for schema horno`.
3. **Tabla de leads**: correr `supabase/migrations/20260828090000_horno_whatsapp_leads.sql`
   (idempotente: crea la tabla + política de insert para `anon`).
4. **Datos de `horno`**: si `servicios/proyectos/equipo` vienen vacíos, correr el seed
   `supabase/migrations/20260827174836_horno_seed.sql`.

## Instalación y ejecución

```bash
pnpm install
pnpm --filter bot-whatsapp dev
```

Al iniciar imprime un **QR** en la terminal. Escanealo con el WhatsApp Business
(menú > Dispositivos vinculados). La sesión se guarda en `.bot-auth/` (gitignored).

## Flujo de menú

`apps/bot-whatsapp/src/menu.ts` implementa una máquina de estados por número de teléfono.

| Opción            | Estado        | Comportamiento                                                    |
| ----------------- | ------------- | ----------------------------------------------------------------- |
| `1` / `idea`      | `IDEA_AWAIT`  | Pide la idea y guarda lead (`option='idea'`).                     |
| `2` / `eventos`   | —             | Mensaje _Próximamente_ (aún sin eventos expuestos).               |
| `3` / `proyectos` | `PROYECTOS`   | Lista `horno.proyectos` activos; `equipo` → lista `horno.equipo`. |
| `4` / `servicios` | `SERVICIOS`   | Lista `horno.servicios`; número → detalle.                        |
| `5` / `hablar`    | `HUMAN_AWAIT` | Pide consulta y guarda lead (`option='human'`).                   |
| `menu` / `0`      | `ROOT`        | Vuelve al menú principal.                                         |

## Fuentes de datos (`horno`)

| Dato              | Tabla             | Filtro                     |
| ----------------- | ----------------- | -------------------------- |
| Servicios         | `horno.servicios` | todas                      |
| Proyectos activos | `horno.proyectos` | `estado = 'activo'`        |
| Equipo            | `horno.equipo`    | `state = 'activo'`         |
| Próximos eventos  | —                 | mensaje estático por ahora |

## Leads

`saveLead()` inserta en `horno.whatsapp_leads` (phone, name, option, message, status).
Por defecto escribe con la **anon key** (la tabla tiene RLS con política de `insert`
para `anon`), así no hace falta el service_role para correr el bot. Si se setea
`BOT_SUPABASE_SERVICE_ROLE_KEY`, usa ese cliente en su lugar (bypasea RLS igual).

## Notas y caveats

- **Baileys es no oficial.** Riesgo de baneo del número a alto volumen. Para producción
  conviene migrar el transporte a un BSP oficial (360Dialog/Twilio): la lógica de
  `menu.ts` no cambia, solo el `index.ts` (conexión + envío).
- **Listas interactivas (`listMessage`):** Baileys v6 **no tiene branch de envío**
  para `listMessage` en `sendMessage` (cae en `prepareWAMessageMedia` y tira
  `Invalid media type`). Por eso `index.ts` las construye como proto
  (`WAProto.Message.fromObject({ listMessage })`) y las envía con `sock.relayMessage(...)`.
  Las respuestas entrantes se leen en `m.message.listResponse.singleSelectReply`.
- `.bot-auth/` contiene credenciales de sesión: no se commitea.
- El bot ignora grupos (`@g.us`) y mensajes salientes.

## Despliegue 24/7 (Railway / Render / Fly)

Baileys mantiene un **WebSocket permanente** con WhatsApp Web, así que el bot es un
proceso Node de larga duración. **No sirve Vercel serverless** (se duerme). Usá un
contenedor persistente (Railway, Render o Fly.io) o un VPS.

1. **Build/start:** `pnpm --filter bot-whatsapp start` (corre con `tsx`, no hace falta
   compilar). El `Dockerfile` incluido hace `pnpm install` y arranca el servicio.
2. **Variables de entorno** (inyectadas por la plataforma, no en el repo):
   - `BOT_SUPABASE_URL` → `https://obvnhcccovvruvpooyap.supabase.co`
   - `BOT_SUPABASE_ANON_KEY` → publishable key del proyecto
   - `BOT_SUPABASE_SERVICE_ROLE_KEY` (opcional) → para escribir leads con service_role
   - `BOT_PAIRING_PHONE` (opcional) → si se setea, pide un _pairing code_ en vez de QR
     (útil en headless, sin terminal visible)
   - `BOT_NOTIFY_NUMBERS` (opcional) → números del equipo a avisar por WhatsApp cuando
     entra un lead, separados por coma y con código de país (ej. `5491112345678`). Si no
     se setea, el lead se guarda pero no se notifica.
3. **Volumen para la sesión:** montá un volumen en `apps/bot-whatsapp/.bot-auth` para
   que la sesión (QR) persista entre reinicios. Si no, pedirá re-escanear el QR.
4. **Primer arranque:** se imprime un QR en los logs (o un pairing code si seteaste
   `BOT_PAIRING_PHONE`). Recomendado para headless: escaneá el QR en tu compu local,
   y subí la carpeta `.bot-auth` a ese volumen para no depender de la terminal del server.

> El bot usa `BOT_*` y NO el `.env.local` del monorepo (que apunta a un proyecto muerto),
> así que en el server solo necesitás setear las variables de arriba.

## Notificaciones al equipo

Cuando un usuario deja un lead (`option='idea'` o `option='human'`), además de guardarlo
en `horno.whatsapp_leads` el bot envía un **WhatsApp de aviso** a los números en
`BOT_NOTIFY_NUMBERS` (separados por coma, con código de país, ej. `5491112345678`). El
mensaje incluye nombre (si lo dio), teléfono y el texto del lead. Si la variable no está
seteada, el lead se guarda pero no se notifica. Ver `notifyTeam()` en `src/index.ts`.

## Pendientes / próximos pasos

- Exponer "Próximos eventos" desde una tabla con fecha (hoy no existe).
- Migración a BSP oficial si se escala el volumen.
