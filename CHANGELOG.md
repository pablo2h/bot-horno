# Changelog — Ruffus el Hornero

## v2 — Bot de Instagram (Meta official API)

### Arquitectura

- Bot de WhatsApp (Baileys) y bot de Instagram ahora son **dos entrypoints separados** en el mismo repo:
  - `src/index-whatsapp.ts` — Baileys (lo que antes era `index.ts`)
  - `src/index-instagram.ts` — Meta Instagram API con webhook HTTP

### Refactors

- `src/index.ts` → `src/index-whatsapp.ts` (sin cambios de lógica, solo renombrado)
- `notifyTeam()` extraído a `src/notify-team.ts` — reutilizable por ambos bots
- El mensaje de notificación ahora incluye `source` (`💬 WhatsApp` o `📸 Instagram`)
- `BotReply.lead.phone` renombrado a `BotReply.lead.contact` (más genérico)

### Base de datos

- Tabla unificada `horno.leads` con columna `source` (`whatsapp` | `instagram`)
- Migración: `migrations/001_unify_leads.sql`
- `db.ts` expone `saveLead({ source, contact, name, option, message })` como función principal
- `saveWhatsappLead()` mantenida como wrapper backward-compat
- Vista `horno.whatsapp_leads_v` para backward-compat con dashboards existentes

### Bot de Instagram (nuevo)

- Protocolo: **webhook HTTP** (Meta conecta a nuestro servidor, no al revés como Baileys)
- Envío: Send API REST (`graph.instagram.com/v26.0/me/messages`)
- Quick replies: hasta 13 botones de hasta 20 caracteres (sin menús anidados como WA)
- Menú: replica el menú del bot de WA con quick replies
- Notificaciones al equipo: WhatsApp directo a Sebastián y Pablo
- Timeout de ventana de 24h aplica (no se puede hacer outreach proactivo)

### Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `src/index-whatsapp.ts` | Entry point WhatsApp (renombrado desde index.ts) |
| `src/index-instagram.ts` | Entry point Instagram con webhook server HTTP |
| `src/notify-team.ts` | Función reutilizable para notificar al equipo |
| `migrations/001_unify_leads.sql` | Crea tabla `horno.leads` y migra datos |

### Pendiente

- Refrescar token de Instagram cada 50-60 días
- Volumen persistente para `.bot-auth/` y `.bot-auth-ig/`

---

## v1 — Bot de WhatsApp (original)

### Fixes

- **`proto.Message` undefined crash`**
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
  - Fix: detectar JIDs LID y enviar menús como texto plano con opciones numeradas.

### Menú

- **Opción 1 — 💡 Tengo una idea**: pide la idea, guarda lead, notifica al equipo.
- **Opción 2 — 📅 Eventos**: mensaje "Próximamente" (sin datos aún).
- **Opción 3 — 🤔 ¿Qué onda Horno?**: submenú con proyectos, servicios, equipo.
- **Opción 4 — 💬 Quiero hablar con alguien**: pide consulta, guarda lead, notifica al equipo.

### Notificaciones al equipo

- `BOT_NOTIFY_NUMBERS=549343462952,5493434056621`
- Cuando entra un lead, el bot envía un WhatsApp directo al equipo.

### Pendientes del bot de WA

- "Próximos eventos" — tabla existe pero no se consume todavía.
- Volumen `.bot-auth/` en Railway para persistir sesión entre reinicios.
- Posible migración a BSP oficial (360Dialog/Twilio) si escala.
