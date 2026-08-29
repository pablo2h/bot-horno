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

---

## Planificación — Mejoras pendientes

### 1. Timeout por estado de conversación

**Problema actual**: el bot guarda estado por número en memoria sin expire. Si alguien:
1. Inicia conversación → estado `IDEA_AWAIT`
2. Responde algo fuera del menú (ej: "buenas")
3. El bot interpreta eso como el texto de la idea y guarda lead

**Solución propuesta**:
- Agregar timestamp a cada estado guardado: `{ state: 'IDEA_AWAIT', updatedAt: Date }`
- Descartar estado si pasó X minutos (ej: 10 min)
- Validar que el mensaje del usuario sea coherente con el estado actual antes de guardar lead

**Prioridad**: Media
**Esfuerzo**: Bajo

---

### 2. Reconocimiento de conversación retomadas

**Problema actual**: si un lead se fue por un flujo pero no completó (ej: pidió "tengo una idea" pero no mandó el texto), no hay forma de retomar esa conversación.

**Solución propuesta**:
- Guardar en la tabla `whatsapp_leads` un campo `resumed_at` o `last_interaction_at`
- Cuando el usuario vuelve a escribir, chequear si tiene un lead incompleto y mostrar un mensaje contextual: "Vi que tenías una idea sin completar. Querés continuar?"
- Alternativa: cambiar el flujo para que sin importar cuándo escriba el usuario, si hay un lead incompleto se le ofrezca retomar

**Prioridad**: Baja
**Esfuerzo**: Medio

---

### 3. Confirmación antes de guardar lead

**Problema actual**: el bot guarda el lead apenas recibe el mensaje, sin confirmar con el usuario.

**Solución propuesta**:
- Después de recibir el texto del lead, enviar un mensaje de confirmación: "Lo guardamos. Te contactamos pronto. ¿Algo más?"
- Dos botones: "Sí, gracias" → vuelve al menú / "No, eso era todo" → vuelve al menú
- Solo guardar en DB cuando el usuario confirma

**Prioridad**: Media
**Esfuerzo**: Bajo

---

### 4. Volumen persistente en Railway

**Problema actual**: sin volumen montado, cada redeploy borra `.bot-auth/` y el bot pide re-escanear QR.

**Solución**:
- Railway: montar un volumen en `/app/.bot-auth`
- O usar `BOT_PAIRING_PHONE` + pairing code (sin QR, más fácil para headless)

**Prioridad**: Alta
**Esfuerzo**: Bajo (config de Railway, no código)

---

### 5. Métricas y logging

**Qué falta**:
- Cuántos leads entran por opción (idea vs human)
- Tasa de finalización vs abandono
- Errores de Supabase o WhatsApp

**Solución propuesta**:
- Eventos en la tabla `whatsapp_leads`: columna `source` (menu/none), `conversation_id`
- O usar Supabase Analytics / Logflare

**Prioridad**: Baja
**Esfuerzo**: Medio

---

### Resumen de prioridad

| Mejora | Prioridad | Esfuerzo |
|---|---|---|
| Volumen persistente Railway | Alta | Bajo |
| Timeout por estado | Media | Bajo |
| Confirmación antes de guardar | Media | Bajo |
| Eventos / métricas | Baja | Medio |
| Retomar conversación | Baja | Medio |
