import { type WASocket } from "@whiskeysockets/baileys";

export interface LeadNotify {
  source: "whatsapp" | "instagram";
  option: "idea" | "human";
  name?: string;
  contact: string;
  message?: string;
}

export async function notifyTeam(
  sock: WASocket,
  lead: LeadNotify,
): Promise<void> {
  const raw = process.env.BOT_NOTIFY_NUMBERS;
  if (!raw) return;
  const numbers = raw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (numbers.length === 0) return;

  const sourceLabel = lead.source === "whatsapp" ? "💬 WhatsApp" : "📸 Instagram";
  const optionLabel = lead.option === "idea" ? "💡 Nueva idea" : "📞 Quiere hablar";
  const who = lead.name
    ? `${lead.name} (${lead.contact})`
    : lead.contact;

  const body =
    `${sourceLabel} — ${optionLabel} de ${who}:\n` +
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
