# Changelog — Ruffus el Hornero

## Qué se hizo y por qué

### Fixes

- **`proto.Message` undefined crash**
  - Baileys v6 no exporta `proto.Message` como módulo standalone.
  - Fix: importar como `const { proto } = require("@whiskeysockets/baileys")` y usar `proto.Message.fromObject({...})`.

- **`listMessage` + `sendMessage` → "Invalid media type"**
  - Baileys v6 no tiene branch de envío para `listMessage` en `sendMessage` (cae en `prepareWAMessageMedia`).
  - Fix: construir el mensaje como proto (`proto.Message.fromObject({ listMessage })`) y enviarlo con `sock.relayMessage()`.

- **`listType: "SINGLE_SELECT"` (string)**
  - El valor de enum en el proto es numérico: `1`.
  - Fix: `listType: 1`.

- **`extractText` no existía**
  - La función para extraer contenido de mensajes era `Baileys.extractMessageContent(m.message)`.

- **LID JIDs (`@lid`) no reciben menús interactivos**
  - WhatsApp no routea respuestas de `relayMessage` a Linked Devices (JID termina en `@lid`).
  - Fix: detectar JIDs LID y enviar menús como texto plano con opciones numeradas. Listas interactivas solo para JIDs que no son LID.

### Menú

- **Opción 1 — 💡 Tengo una idea**: pide la idea, guarda lead (`option='idea'`), notifica al equipo.
- **Opción 2 — 📅 Eventos**: mensaje "Próximamente" (sin datos aún).
- **Opción 3 — 🤔 ¿Qué onda Horno?**: submenú nuevo con:
  - Proyectos activos (de `horno.proyectos`)
  - Servicios (de `horno.servicios`)
  - Conocer al equipo (de `horno.equipo`)
- **Opción 4 — 💬 Quiero hablar con alguien**: pide consulta, guarda lead (`option='human'`), notifica al equipo.

- Shortcuts numéricos "1"-"4" en todos los estados del menú.
- Estado `SUBMENU` agregado en `menu.ts`.

### Notificaciones al equipo

- `BOT_NOTIFY_NUMBERS=549343462952,5493434056621` (Sebastián + Pablo).
- Cuando entra un lead, el bot envía un WhatsApp directo al equipo con los datos del lead.
- Si la notificación falla (ej. número no existe), se ignora — el lead igual se guarda en DB.

### Base de datos

- Tabla `horno.whatsapp_leads` guarda: phone (LID format), name, option, message, status, created_at.
- RLS policy permite INSERT con anon key (no necesita service_role).
- 3 leads de prueba ya guardados confirmando que funciona end-to-end.

### Archivos del bot

| Archivo | Qué hace |
|---|---|
| `src/index.ts` | Conexión Baileys, manejo de mensajes entrantes, LID detection, `sendReply`, `notifyTeam`, import de `extractMessageContent` |
| `src/menu.ts` | Máquina de estados (ROOT, IDEA_AWAIT, HUMAN_AWAIT, PROYECTOS, SERVICIOS, EQUIPO, SUBMENU), `handleRoot`, `handleSubMenu`, `rootMenu`, `subMenu` |
| `src/db.ts` | Cliente Supabase, `getServicios`, `getProyectosActivos`, `getEquipoActivo`, `saveLead` |
| `.env` | `BOT_SUPABASE_URL`, `BOT_SUPABASE_ANON_KEY`, `BOT_NOTIFY_NUMBERS` (gitignored) |
| `Dockerfile` | Node 22 Alpine, `pnpm install`, `tsx src/index.ts` |

### Deployment

- **Problema**: el monorepo original tenía `web` (Next.js, requiere Node 20+) y `bot-whatsapp`. `turbo run build` fallaba porque intentaba buildear `web` con Node 18.
- **Solución**: bot extraído a repo propio `bot-horno` con Dockerfile minimal (sin build step — `tsx` corre directo).

### Pendientes

- "Próximos eventos" — tabla existe pero no se consume todavía.
- Volumen `.bot-auth/` en Railway para persistir sesión entre reinicios (evita re-escanear QR).
- Posible migración a BSP oficial (360Dialog/Twilio) si escala el volumen — la lógica de menú no cambia, solo `index.ts`.
