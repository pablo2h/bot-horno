import dotenv from "dotenv";
import path from "node:path";
import { randomBytes } from "node:crypto";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import QRCode from "qrcode-terminal";
import QRImage from "qrcode";
import { Boom } from "@hapi/boom";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  extractMessageContent,
  type ConnectionState,
  type WASocket,
} from "@whiskeysockets/baileys";
import * as Baileys from "@whiskeysockets/baileys";
import { type ListSpec, type BotReply, type HandleMessage } from "./menu";
import { handleHornoMessage } from "./menu-horno";
import { handleLaConveMessage } from "./menu-la-conve";
import { notifyTeam, type LeadNotify } from "./notify-team";
import { saveLead } from "./db";

const COMPANY = process.env.BOT_COMPANY ?? "horno";

const handlers: Record<string, HandleMessage> = {
  horno: handleHornoMessage,
  la_conve: handleLaConveMessage,
};

const handleMessage: HandleMessage = handlers[COMPANY] ?? handleHornoMessage;

console.log(`[wa] Company: ${COMPANY}`);

const authDir = path.join(process.cwd(), ".bot-auth");

function genMsgId(): string {
  return randomBytes(8)
    .toString("base64")
    .replace(/[+/=]/g, "")
    .slice(0, 21)
    .padEnd(21, "A");
}

function isLidJid(jid: string): boolean {
  return !!Baileys.isLidUser(jid);
}

function listToText(list: ListSpec): string {
  const lines = [`${list.title}\n${list.text}\n`];
  list.sections.forEach((section, si) => {
    if (section.title) lines.push(`*${section.title}*`);
    section.rows.forEach((row, ri) => {
      lines.push(`${si * 100 + ri + 1}. ${row.title}`);
      if (row.description) lines.push(`   ${row.description}`);
    });
  });
  return lines.join("\n");
}

async function sendListMessage(
  sock: WASocket,
  jid: string,
  list: ListSpec,
): Promise<void> {
  try {
    const msg = Baileys.WAProto.Message.fromObject({
      listMessage: {
        title: list.title,
        description: list.text,
        buttonText: list.buttonText,
        listType: 1,
        footerText: "Ruffus el Hornero 🐦‍🔥",
        sections: list.sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({
            title: r.title,
            description: r.description ?? "",
            rowId: r.rowId,
          })),
        })),
      },
    });
    await (sock as any).relayMessage(jid, msg, { messageId: genMsgId() });
  } catch (err) {
    console.error("[wa] List message failed, falling back to text:", err);
    const text = listToText(list);
    await sock.sendMessage(jid, { text });
  }
}

async function sendMessageWithRetry(
  sock: WASocket,
  jid: string,
  content: any,
  retries = 2,
): Promise<void> {
  for (let i = 0; i <= retries; i++) {
    try {
      await sock.sendMessage(jid, content);
      return;
    } catch (err) {
      if (i < retries) {
        console.log(`[wa] Send failed, retry ${i + 1}/${retries}...`);
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      } else {
        throw err;
      }
    }
  }
}

async function sendReply(
  sock: WASocket,
  jid: string,
  reply: BotReply,
): Promise<void> {
  try {
    if (reply.sequential) {
      for (const msg of reply.sequential) {
        await sendMessageWithRetry(sock, jid, { text: msg });
        await new Promise((r) => setTimeout(r, 1000));
      }
      return;
    }
    if (reply.list) {
      if (isLidJid(jid)) {
        const text = listToText(reply.list);
        await sendMessageWithRetry(sock, jid, { text });
      } else {
        await sendListMessage(sock, jid, reply.list);
      }
    } else {
      await sendMessageWithRetry(sock, jid, { text: reply.text ?? "" });
    }
  } catch (err) {
    console.error("[wa] Error sending reply:", err);
    // Fallback: send plain text
    const fallback = reply.list
      ? listToText(reply.list)
      : reply.text ?? "Error al enviar mensaje. Escribí *menu* para reiniciar.";
    try {
      await sendMessageWithRetry(sock, jid, { text: fallback });
    } catch {
      // Ignore fallback error
    }
  }
}

async function connect(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  let isReady = false;

  const sock: WASocket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["RuffusBot", "Chrome", "1.0"],
    // Wait for full sync before marking as ready
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { qr, connection, lastDisconnect } = update;
    if (qr) {
      const pairingPhone = process.env.BOT_PAIRING_PHONE;
      if (pairingPhone) {
        try {
          const code = await sock.requestPairingCode(pairingPhone);
          console.log(
            `\n📲 Pairing code: ${code}\nIngresalo en WhatsApp > Dispositivos vinculados > Vincular con número de teléfono.`,
          );
        } catch (e) {
          console.error("Error pidiendo pairing code:", e);
        }
      } else {
        QRCode.generate(qr, { small: true });
        try {
          const dataUrl = await QRImage.toDataURL(qr, { width: 320, margin: 1 });
          const shortUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
          console.log(
            `\n📷 Abrí este link en tu navegador para ver el QR y escanearlo:\n${shortUrl}\n` +
              `\n(Si preferís ver el QR como imagen en logs, copiá y pegá este data URL en el navegador):\n${dataUrl}\n`,
          );
        } catch {
          console.log(
            "\nNo se pudo generar el link del QR, revisá los logs anteriores.",
          );
        }
        console.log(
          "Escaneá el QR con tu WhatsApp (menú > Dispositivos vinculados).",
        );
      }
    }
    if (connection === "open") {
      console.log("Ruffus el Hornero conectado 🐦‍🔥");
      // Wait a bit for full sync before processing messages
      setTimeout(() => {
        isReady = true;
        console.log("[wa] Bot listo para procesar mensajes");
      }, 3000);
    }
    if (connection === "close") {
      isReady = false;
      const status = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (status === DisconnectReason.loggedOut) {
        console.log(
          "Sesión cerrada. Borrá la carpeta .bot-auth y volvé a correr.",
        );
      } else {
        console.log("Conexión caída, reconectando...");
        connect();
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      if (m.key.fromMe) continue;
      const jid = m.key.remoteJid;
      if (!jid || jid.endsWith("@g.us") || !m.message) continue;

      // Skip messages until bot is fully ready
      if (!isReady) {
        console.log("[wa] Bot no listo, ignorando mensaje");
        continue;
      }

      const single = (m.message as any)?.listResponse?.singleSelectReply;
      const selectedId: string | undefined =
        single?.selectedId ?? single?.selectedRowId;
      const rawContent = extractMessageContent(m.message);
      const msgText: string =
        (rawContent?.conversation ||
          rawContent?.extendedTextMessage?.text ||
          "") as string;
      const text = (selectedId || msgText || "").toString();
      if (!text) continue;

      try {
        console.log(`[wa-msg] text="${text}" from=${jid}`);
        const reply = await handleMessage(jid, m.pushName ?? undefined, text);
        if (!reply) continue;
        await sendReply(sock, jid, reply);
        if (reply.lead) {
          await notifyTeam(sock, {
            source: "whatsapp",
            option: reply.lead.option,
            name: reply.lead.name,
            contact: reply.lead.contact,
            message: reply.lead.message,
          });
        }
      } catch (err) {
        console.error("Error manejando mensaje:", err);
        try {
          await sendMessageWithRetry(sock, jid, {
            text: "Ocurrió un error 🐦‍🔥. Escribí *menu* para reiniciar.",
          });
        } catch {
          // Ignore send error
        }
      }
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }
  });
}

connect();
