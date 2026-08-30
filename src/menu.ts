import {
  getServicios,
  getProyectosActivos,
  getEquipoActivo,
  saveLead,
  type Servicio,
  type Proyecto,
  type MiembroEquipo,
} from "./db";

export type State =
  | "ROOT"
  | "IDEA_AWAIT"
  | "HUMAN_AWAIT"
  | "SERVICIOS"
  | "PROYECTOS"
  | "EQUIPO"
  | "SUBMENU";

export interface Session {
  state: State;
  submenu?: string;
  servicios?: Servicio[];
  proyectos?: Proyecto[];
  equipo?: MiembroEquipo[];
}

export interface ListRow {
  rowId: string;
  title: string;
  description?: string;
}
export interface ListSpec {
  buttonText: string;
  title: string;
  text: string;
  sections: { title: string; rows: ListRow[] }[];
}
export interface BotReply {
  text?: string;
  list?: ListSpec;
  sequential?: string[];
  lead?: {
    contact: string;
    name?: string;
    option: "idea" | "human";
    message?: string;
  };
}

export interface MenuOption {
  rowId: string;
  title: string;
  description?: string;
  action?: "idea" | "human" | "submenu";
  submenu?: string;
  response?: string;
}

export interface SubmenuConfig {
  title: string;
  text: string;
  options: MenuOption[];
}

export interface MenuConfig {
  ruffus: string;
  root: {
    title: string;
    text: string;
    options: MenuOption[];
  };
  submenus: Record<string, SubmenuConfig>;
  responses: Record<string, string | string[]>;
  lead?: {
    idea?: { prompt: string; thankYou: string };
    human?: { prompt: string; thankYou: string };
  };
}

const sessions = new Map<string, Session>();

function getSession(phone: string): Session {
  let s = sessions.get(phone);
  if (!s) {
    s = { state: "ROOT" };
    sessions.set(phone, s);
  }
  return s;
}

export function trunc(s: string, n = 24): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export const text = (t: string): BotReply => ({ text: t });
export const list = (l: ListSpec): BotReply => ({ list: l });

function buildList(
  title: string,
  description: string,
  rows: ListRow[],
  buttonText = "Ver opciones",
): BotReply {
  return list({
    buttonText,
    title,
    text: description,
    sections: [{ title: "Opciones", rows }],
  });
}

function servicioDetail(ruffus: string, sv: Servicio): string {
  return `${ruffus} *${sv.titulo}*\n${sv.tagline}\n\n${sv.descripcion}\n\nEscribí *menu* para volver.`;
}

function proyectoDetail(ruffus: string, p: Proyecto): string {
  const more = p.href ? `\nMás info: ${p.href}` : "";
  return `${ruffus} *${p.titulo}*\n${p.descripcion}${more}\n\nEscribí *menu* para volver.`;
}

function findOption(options: MenuOption[], input: string): MenuOption | undefined {
  const idx = parseInt(input, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= options.length) {
    return options[idx - 1];
  }
  return options.find((o) => o.rowId === input);
}

export function createHandler(config: MenuConfig) {
  const { ruffus } = config;
  const leadConfig = {
    idea: {
      prompt: `${ruffus} ¡Me encanta! Contame tu idea y yo se la llevo volando al equipo. Escribila acá:`,
      thankYou: `${ruffus} ¡Gracias por la idea! Yo se la llevo al equipo y te escribimos pronto. Escribí *menu* para más opciones.`,
      ...config.lead?.idea,
    },
    human: {
      prompt: `${ruffus} 📞 ¿Con qué querés que te contacte el equipo?\nDejá tu consulta (tu número ya lo tenemos) y te escribimos por este mismo chat.\nEscribí *menu* para cancelar.`,
      thankYou: `${ruffus} ¡Listo! Uno del equipo te va a escribir por acá. Gracias ${ruffus}`,
      ...config.lead?.human,
    },
  };

  return async function handleMessage(
    phone: string,
    name: string | undefined,
    raw: string,
    source: "whatsapp" | "instagram" = "whatsapp",
  ): Promise<BotReply> {
    const clean = raw.trim().toLowerCase();
    const session = getSession(phone);

    if (["menu", "0", "hola", "inicio", "menu."].includes(clean)) {
      session.state = "ROOT";
      return buildRoot();
    }

    switch (session.state) {
      case "ROOT":
        return handleRoot(session, phone, clean);

      case "SUBMENU":
        return handleSubmenu(session, phone, clean);

      case "IDEA_AWAIT": {
        await saveLead({
          source,
          contact: phone,
          name,
          option: "idea",
          message: raw.trim(),
        });
        session.state = "ROOT";
        return {
          text: leadConfig.idea.thankYou,
          lead: { contact: phone, name, option: "idea", message: raw.trim() },
        };
      }

      case "HUMAN_AWAIT": {
        await saveLead({
          source,
          contact: phone,
          name,
          option: "human",
          message: raw.trim(),
        });
        session.state = "ROOT";
        return {
          text: leadConfig.human.thankYou,
          lead: { contact: phone, name, option: "human", message: raw.trim() },
        };
      }

      case "SERVICIOS": {
        const sv = clean.startsWith("s:")
          ? session.servicios?.find((x) => x.slug === clean.slice(2))
          : undefined;
        if (sv) return text(servicioDetail(ruffus, sv));
        const n = parseInt(clean, 10);
        const byIndex = !isNaN(n) ? session.servicios?.[n - 1] : undefined;
        if (byIndex) return text(servicioDetail(ruffus, byIndex));
        return text(`${ruffus} Elegí una opción de la lista o escribí *menu* para volver.`);
      }

      case "PROYECTOS": {
        const p = clean.startsWith("p:")
          ? session.proyectos?.find((x) => x.slug === clean.slice(2))
          : undefined;
        if (p) return text(proyectoDetail(ruffus, p));
        const n = parseInt(clean, 10);
        const byIndex = !isNaN(n) ? session.proyectos?.[n - 1] : undefined;
        if (byIndex) return text(proyectoDetail(ruffus, byIndex));
        return text(`${ruffus} Elegí una opción de la lista o escribí *menu* para volver.`);
      }

      case "EQUIPO":
        session.state = "ROOT";
        return buildRoot();

      default:
        session.state = "ROOT";
        return buildRoot();
    }

    function buildRoot(): BotReply {
      return buildList(
        `${ruffus} ${config.root.title}`,
        config.root.text,
        config.root.options,
      );
    }

    function handleRoot(session: Session, phone: string, input: string): BotReply {
      const opt = findOption(config.root.options, input);
      if (!opt) return buildRoot();

      if (opt.action === "idea") {
        session.state = "IDEA_AWAIT";
        return text(leadConfig.idea.prompt);
      }
      if (opt.action === "human") {
        session.state = "HUMAN_AWAIT";
        return text(leadConfig.human.prompt);
      }
      if (opt.action === "submenu" || opt.submenu) {
        const key = opt.submenu ?? opt.rowId;
        session.state = "SUBMENU";
        session.submenu = key;
        return buildSubmenu(key);
      }
      if (opt.response) {
        const resp = config.responses[opt.response] ?? opt.response;
        if (Array.isArray(resp)) {
          return { sequential: resp };
        }
        return text(resp);
      }
      return buildRoot();
    }

    function handleSubmenu(session: Session, phone: string, input: string): BotReply {
      const key = session.submenu ?? "default";
      const sub = config.submenus[key];
      if (!sub) {
        session.state = "ROOT";
        return buildRoot();
      }

      const opt = findOption(sub.options, input);
      if (!opt) return buildSubmenu(key);

      if (opt.submenu) {
        session.state = "SUBMENU";
        session.submenu = opt.submenu;
        return buildSubmenu(opt.submenu);
      }
      if (opt.action === "idea") {
        session.state = "IDEA_AWAIT";
        return text(leadConfig.idea.prompt);
      }
      if (opt.action === "human") {
        session.state = "HUMAN_AWAIT";
        return text(leadConfig.human.prompt);
      }
      if (opt.response) {
        const resp = config.responses[opt.response] ?? opt.response;
        if (Array.isArray(resp)) {
          return { sequential: resp };
        }
        return text(resp);
      }
      return buildSubmenu(key);
    }

    function buildSubmenu(key: string): BotReply {
      const sub = config.submenus[key];
      if (!sub) return buildRoot();
      return buildList(sub.title, sub.text, sub.options);
    }
  };
}

export type HandleMessage = (
  phone: string,
  name: string | undefined,
  raw: string,
  source?: "whatsapp" | "instagram",
) => Promise<BotReply>;
