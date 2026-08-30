import dotenv from "dotenv";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { handleMessage, type BotReply } from "./menu";
import { saveLead } from "./db";
import { notifyTeam, type LeadNotify } from "./notify-team";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { DisconnectReason } from "@whiskeysockets/baileys";
import type { WASocket } from "@whiskeysockets/baileys";

const IG = {
  enabled: process.env.BOT_HORNO_IG_ENABLED === "true",
  accessToken: process.env.BOT_HORNO_IG_ACCESS_TOKEN ?? "",
  appSecret: process.env.BOT_HORNO_IG_APP_SECRET ?? "",
  verifyToken: process.env.BOT_HORNO_IG_VERIFY_TOKEN ?? "",
  accountId: process.env.BOT_HORNO_IG_ACCOUNT_ID ?? "",
  webhookPath:
    process.env.BOT_HORNO_IG_WEBHOOK_PATH ?? "/api/webhooks/instagram/horno",
  apiBase: "https://graph.instagram.com/v26.0",
};

if (!IG.enabled) {
  console.log("Instagram bot disabled");
  process.exit(0);
}

if (!IG.accessToken || !IG.accountId) {
  console.error("Faltan INSTAGRAM_ACCESS_TOKEN o INSTAGRAM_ACCOUNT_ID");
  process.exit(0);
}

const authDir = path.join(process.cwd(), ".bot-auth-ig");
let waSock: WASocket | null = null;

async function getWasSock(): Promise<WASocket> {
  if (waSock) return waSock;
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  waSock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["RuffusBot", "Chrome", "1.0"],
  });
  waSock.ev.on("creds.update", saveCreds);
  waSock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("WhatsApp para notificaciones conectado 🐦‍🔥");
    }
    if (connection === "close") {
      const status = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (status === DisconnectReason.loggedOut) {
        waSock = null;
      }
    }
  });
  return waSock;
}

async function igGet(endpoint: string): Promise<any> {
  const res = await fetch(`${IG.apiBase}${endpoint}&access_token=${IG.accessToken}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`IG API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function igPost(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${IG.apiBase}${endpoint}&access_token=${IG.accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`IG API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function sendText(igsid: string, text: string): Promise<void> {
  await igPost("/me/messages", {
    recipient: { id: igsid },
    message: { text },
  });
}

interface IgQuickReply {
  content_type: "text";
  title: string;
  payload: string;
}

async function sendQuickReplies(
  igsid: string,
  text: string,
  buttons: IgQuickReply[],
): Promise<void> {
  await igPost("/me/messages", {
    recipient: { id: igsid },
    message: {
      text,
      quick_replies: buttons.slice(0, 13),
    },
  });
}

async function sendMenu(igsid: string, reply: BotReply): Promise<void> {
  if (reply.list) {
    const text = `${reply.list.title}\n\n${reply.list.text}`;
    const buttons: IgQuickReply[] = reply.list.sections
      .flatMap((s) => s.rows)
      .slice(0, 13)
      .map((r) => ({
        content_type: "text" as const,
        title: r.title.slice(0, 20),
        payload: r.rowId,
      }));

    if (buttons.length > 0) {
      await sendQuickReplies(igsid, text, buttons);
    } else {
      await sendText(igsid, text);
    }
  } else if (reply.text) {
    await sendText(igsid, reply.text);
  }
}

async function handleIgMessage(igsid: string, text: string, username?: string): Promise<void> {
  const reply = await handleMessage(igsid, username, text);
  if (!reply) return;

  await sendMenu(igsid, reply);

  if (reply.lead) {
    await saveLead({
      source: "instagram",
      contact: igsid,
      name: reply.lead.name,
      option: reply.lead.option,
      message: reply.lead.message,
      metadata: {},
    });

    const sock = await getWasSock();
    if (sock) {
      const leadNotify: LeadNotify = {
        source: "instagram",
        option: reply.lead.option,
        name: reply.lead.name,
        contact: igsid,
        message: reply.lead.message,
      };
      await notifyTeam(sock, leadNotify);
    }
  }
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !IG.appSecret) return false;
  const expected = crypto
    .createHmac("sha256", IG.appSecret)
    .update(rawBody)
    .digest("hex");
  return `sha256=${expected}` === signature;
}

function parseWebhookBody(body: string): any {
  return JSON.parse(body);
}

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === IG.webhookPath) {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === IG.verifyToken) {
      console.log("Webhook verificado por Meta");
      res.writeHead(200);
      res.end(challenge ?? "ok");
    } else {
      res.writeHead(403);
      res.end("Forbidden");
    }
    return;
  }

  if (req.method === "POST" && url.pathname === IG.webhookPath) {
    const signature = req.headers["x-hub-signature-256"] ?? null;
    let rawBody = "";
    for await (const chunk of req) {
      rawBody += chunk;
    }

    if (!verifySignature(rawBody, signature as string | null)) {
      console.warn("Firma de webhook inválida");
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    let payload: any;
    try {
      payload = parseWebhookBody(rawBody);
    } catch {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    const entry = payload?.entry?.[0];
    if (!entry) {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      const igsid = event.sender?.id;

      if (!igsid || igsid === IG.accountId) continue;

      if (event.message?.text) {
        const text = event.message.text;
        const username = event.sender?.username;
        console.log(`[ig] text="${text}" from=${igsid}`);
        handleIgMessage(igsid, text, username).catch((err) => {
          console.error("[ig] Error:", err);
        });
      } else if (event.postback?.payload) {
        const payload_text = event.postback.payload;
        console.log(`[ig] postback="${payload_text}" from=${igsid}`);
        handleIgMessage(igsid, payload_text).catch((err) => {
          console.error("[ig] Error:", err);
        });
      }
    }

    res.writeHead(200);
    res.end("ok");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Bot IG listening on port ${PORT}`);
  console.log(`Webhook path: ${IG.webhookPath}`);
  console.log(`Necesitás que Meta pueda reachear este server en HTTPS para el webhook.`);
});
