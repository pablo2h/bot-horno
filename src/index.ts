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
// Baileys es CJS: `proto` no es un named export estaticamente detectable en ESM,
// asi que lo tomamos del namespace (module.exports).
import * as Baileys from "@whiskeysockets/baileys";
import { handleMessage, type ListSpec, type BotReply } from "./menu";

const authDir = path.join(process.cwd(), ".bot-auth");

// Baileys v6 no expone un branch de envío para listMessage en sendMessage
// (caería en prepareWAMessageMedia y tiraría "Invalid media type"). Construimos
// el proto directamente y lo relayeamos.
// NOTA: en @whiskeysockets/baileys v6, las clases proto viven en WAProto (no proto).
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
  const msg = Baileys.WAProto.Message.fromObject({
    listMessage: {
      title: list.title,
      description: list.text,
      buttonText: list.buttonText,
      listType: 1, // SINGLE_SELECT
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
}

async function sendReply(
  sock: WASocket,
  jid: string,
  reply: BotReply,
): Promise<void> {
  if (reply.list) {
    if (isLidJid(jid)) {
      const text = listToText(reply.list);
      await sock.sendMessage(jid, { text });
    } else {
      await sendListMessage(sock, jid, reply.list);
    }
  } else {
    await sock.sendMessage(jid, { text: reply.text ?? "" });
  }
}

async function notifyTeam(
  sock: WASocket,
  lead: NonNullable<Awaited<ReturnType<typeof handleMessage>>["lead"]>,
): Promise<void> {
  const raw = process.env.BOT_NOTIFY_NUMBERS;
  if (!raw) return;
  const numbers = raw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (numbers.length === 0) return;

  const label = lead.option === "idea" ? "💡 Nueva idea" : "📞 Quiere hablar";
  const who = lead.name ? `${lead.name} (${lead.phone})` : lead.phone;
  const body =
    `${label} de ${who}:\n` +
    `${lead.message ?? "(sin mensaje)"}\n\n` +
    `— Ruffus el Hornero 🐦‍🔥`;

  for (const num of numbers) {
    const jid = num.includes("@")
      ? num
      : `${num.replace(/\D/g, "")}@s.whatsapp.net`;
    try {
      await sock.sendMessage(jid, { text: body });
    } catch (e) {
      console.error(`No pude notificar a ${num}:`, e);
    }
  }
}

async function connect(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock: WASocket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["RuffusBot", "Chrome", "1.0"],
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
    }
    if (connection === "close") {
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
        console.log(`[msg] text="${text}"`);
        const reply = await handleMessage(jid, m.pushName ?? undefined, text);
        if (!reply) continue;
        await sendReply(sock, jid, reply);
        if (reply.lead) await notifyTeam(sock, reply.lead);
      } catch (err) {
        console.error("Error manejando mensaje:", err);
        await sock.sendMessage(jid, {
          text: "Ocurrió un error 🐦‍🔥. Escribí *menu* para reiniciar.",
        });
      }
    }
  });
}

connect();
