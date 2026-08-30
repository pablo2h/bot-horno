import dotenv from "dotenv";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { handleMessage, type BotReply } from "./menu";
import { saveLead } from "./db";

const IG = {
  enabled: process.env.BOT_HORNO_IG_ENABLED === "true",
  accessToken: process.env.BOT_HORNO_IG_ACCESS_TOKEN ?? "",
  appSecret: process.env.BOT_HORNO_IG_APP_SECRET ?? "",
  verifyToken: process.env.BOT_HORNO_IG_VERIFY_TOKEN ?? "",
  accountId: process.env.BOT_HORNO_IG_ACCOUNT_ID ?? "",
  webhookPath:
    process.env.BOT_HORNO_IG_WEBHOOK_PATH ?? "/api/webhooks/instagram/horno",
  apiBase: "https://graph.instagram.com",
  apiVersion: "v26.0",
};

if (!IG.enabled) {
  console.log("[ig] Instagram bot disabled");
  process.exit(0);
}

if (!IG.accessToken || !IG.accountId) {
  console.error("[ig] Faltan BOT_HORNO_IG_ACCESS_TOKEN o BOT_HORNO_IG_ACCOUNT_ID");
  process.exit(1);
}

console.log("[ig] Config loaded:", {
  apiBase: IG.apiBase,
  apiVersion: IG.apiVersion,
  accountId: IG.accountId,
  webhookPath: IG.webhookPath,
  tokenPrefix: IG.accessToken.slice(0, 10) + "...",
});

async function igApi(
  method: "GET" | "POST",
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<any> {
  const url = `${IG.apiBase}/${IG.apiVersion}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${IG.accessToken}`,
  };

  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`IG API non-JSON response ${res.status}: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    const errDetail = json?.error?.message ?? json?.message ?? text;
    const errCode = json?.error?.code ?? "";
    const errSub = json?.error?.error_subcode ?? "";
    console.error(`[ig] API ERROR ${res.status}:`, {
      code: errCode,
      subcode: errSub,
      message: errDetail,
      fbtrace: json?.error?.fbtrace_id,
    });
    throw new Error(`IG API ${res.status} (${errCode}/${errSub}): ${errDetail}`);
  }

  return json;
}

async function sendText(igsid: string, text: string): Promise<void> {
  console.log(`[ig] Sending text to ${igsid}:`, text.slice(0, 80));
  const result = await igApi("POST", `/${IG.accountId}/messages`, {
    recipient: { id: igsid },
    message: { text },
  });
  console.log(`[ig] Send OK, message_id:`, result?.message_id);
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
  console.log(`[ig] Sending quick replies to ${igsid}:`, buttons.length, "buttons");
  const result = await igApi("POST", `/${IG.accountId}/messages`, {
    recipient: { id: igsid },
    message: {
      text,
      quick_replies: buttons.slice(0, 13),
    },
  });
  console.log(`[ig] Send OK, message_id:`, result?.message_id);
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
  try {
    const reply = await handleMessage(igsid, username, text);
    if (!reply) return;

    await sendMenu(igsid, reply);

    if (reply.lead) {
      try {
        await saveLead({
          source: "instagram",
          contact: igsid,
          name: reply.lead.name,
          option: reply.lead.option,
          message: reply.lead.message,
          metadata: {},
        });
      } catch (leadErr) {
        console.error("[ig] Error saving lead:", leadErr);
      }
    }
  } catch (err) {
    console.error("[ig] Error in handleIgMessage:", err);
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

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === IG.webhookPath) {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === IG.verifyToken) {
      console.log("[ig] Webhook verificado por Meta");
      res.writeHead(200);
      res.end(challenge ?? "ok");
    } else {
      console.warn("[ig] Verification failed:", { mode, token });
      res.writeHead(403);
      res.end("Forbidden");
    }
    return;
  }

  if (req.method === "POST" && url.pathname === IG.webhookPath) {
    let rawBody = "";
    for await (const chunk of req) {
      rawBody += chunk;
    }

    const signature = req.headers["x-hub-signature-256"] ?? null;
    if (signature && !verifySignature(rawBody, signature as string)) {
      console.warn("[ig] Firma de webhook inválida");
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    console.log("[ig] webhook object:", payload?.object);
    console.log("[ig] webhook entry:", JSON.stringify(payload?.entry?.[0] ?? {}).slice(0, 400));

    const entry = payload?.entry?.[0];
    if (!entry) {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    const events: any[] = entry.messaging ?? entry.changes ?? [];

    for (const event of events) {
      const change = event.value ?? event;

      const senderId = change.sender?.id;
      const recipientId = change.recipient?.id;

      if (!senderId) continue;
      if (senderId === IG.accountId) continue;

      if (change.message?.text) {
        const text = change.message.text;
        const username = change.sender?.username;
        console.log(`[ig] text="${text}" from=${senderId} to=${recipientId}`);
        handleIgMessage(senderId, text, username).catch((err) => {
          console.error("[ig] Unhandled error:", err);
        });
      } else if (change.message?.quick_reply?.payload) {
        const payload_text = change.message.quick_reply.payload;
        console.log(`[ig] quick_reply="${payload_text}" from=${senderId}`);
        handleIgMessage(senderId, payload_text).catch((err) => {
          console.error("[ig] Unhandled error:", err);
        });
      } else if (change.postback?.payload) {
        const payload_text = change.postback.payload;
        console.log(`[ig] postback="${payload_text}" from=${senderId}`);
        handleIgMessage(senderId, payload_text).catch((err) => {
          console.error("[ig] Unhandled error:", err);
        });
      } else {
        console.log("[ig] unhandled event:", JSON.stringify(change).slice(0, 200));
      }
    }

    res.writeHead(200);
    res.end("ok");
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[ig] Bot IG listening on port ${PORT}`);
  console.log(`[ig] Webhook path: ${IG.webhookPath}`);
  console.log(`[ig] API: ${IG.apiBase}/${IG.apiVersion}`);
  console.log(`[ig] Account ID: ${IG.accountId}`);
});
