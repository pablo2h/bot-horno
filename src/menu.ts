import {
  getServicios,
  getProyectosActivos,
  getEquipoActivo,
  saveLead,
  type Servicio,
  type Proyecto,
  type MiembroEquipo,
} from "./db";

type State =
  | "ROOT"
  | "IDEA_AWAIT"
  | "HUMAN_AWAIT"
  | "SERVICIOS"
  | "PROYECTOS"
  | "EQUIPO"
  | "SUBMENU";

interface Session {
  state: State;
  servicios?: Servicio[];
  proyectos?: Proyecto[];
  equipo?: MiembroEquipo[];
}

const sessions = new Map<string, Session>();
const RUFFUS = "🐦‍🔥";

function getSession(phone: string): Session {
  let s = sessions.get(phone);
  if (!s) {
    s = { state: "ROOT" };
    sessions.set(phone, s);
  }
  return s;
}

function trunc(s: string, n = 24): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
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
  lead?: {
    contact: string;
    name?: string;
    option: "idea" | "human";
    message?: string;
  };
}

const text = (t: string): BotReply => ({ text: t });
const list = (l: ListSpec): BotReply => ({ list: l });

export function rootMenu(): BotReply {
  return list({
    buttonText: "Ver opciones",
    title: `${RUFFUS} Ruffus el Hornero`,
    text: "Soy el pajarito del equipo que mueve la correspondencia. ¿Con qué te ayudo?",
    sections: [
      {
        title: "Opciones",
        rows: [
          {
            rowId: "idea",
            title: "💡 Tengo una idea",
            description: "Quiero colaborar",
          },
          { rowId: "eventos", title: "📅 Próximos eventos" },
          { rowId: "submenu", title: "3️⃣ ¿Qué onda Horno?" },
          { rowId: "hablar", title: "📞 Hablar con una persona" },
        ],
      },
    ],
  });
}

export function subMenu(): BotReply {
  return list({
    buttonText: "Ver opciones",
    title: "3️⃣ ¿Qué onda Horno?",
    text: "Somos un equipo que labura en ideas, contenido y tecnología. Elegí qué querés conocer:",
    sections: [
      {
        title: "Conocé Horno",
        rows: [
          { rowId: "proyectos", title: "🚀 Proyectos activos" },
          { rowId: "servicios", title: "📋 Servicios" },
          { rowId: "equipo", title: "👥 Conocer al equipo" },
        ],
      },
    ],
  });
}

function servicioDetail(sv: Servicio): string {
  return `${RUFFUS} *${sv.titulo}*\n${sv.tagline}\n\n${sv.descripcion}\n\nEscribí *menu* para volver.`;
}
function proyectoDetail(p: Proyecto): string {
  const more = p.href ? `\nMás info: ${p.href}` : "";
  return `${RUFFUS} *${p.titulo}*\n${p.descripcion}${more}\n\nEscribí *menu* para volver.`;
}

async function handleRoot(
  _s: Session,
  _phone: string,
  t: string,
): Promise<BotReply> {
  switch (t) {
    case "idea":
    case "1":
      _s.state = "IDEA_AWAIT";
      return text(
        `${RUFFUS} ¡Me encanta! Contame tu idea y yo se la llevo volando al equipo. Escribila acá:`,
      );
    case "eventos":
    case "2":
      return text(
        `${RUFFUS} 📅 *Próximos eventos*\n\nPor ahora no tenemos eventos publicados, pero estamos preparando novedades.\nSi querés que te avisemos, tocá *hablar* y te contacta el equipo. Escribí *menu* para volver.`,
      );
    case "submenu":
    case "3":
      _s.state = "SUBMENU";
      return subMenu();
    case "hablar":
    case "4":
      _s.state = "HUMAN_AWAIT";
      return text(
        `${RUFFUS} 📞 ¿Con qué querés que te contacte el equipo?\nDejá tu consulta (tu número ya lo tenemos) y te escribimos por este mismo chat.\nEscribí *menu* para cancelar.`,
      );
    default:
      return rootMenu();
  }
}

async function handleSubMenu(
  _s: Session,
  _phone: string,
  t: string,
): Promise<BotReply> {
  switch (t) {
    case "proyectos":
    case "1": {
      const proyectos = await getProyectosActivos();
      _s.proyectos = proyectos;
      _s.state = "PROYECTOS";
      if (proyectos.length === 0) {
        return text(
          `${RUFFUS} No tenemos proyectos activos en este momento. Escribí *menu* para volver.`,
        );
      }
      return list({
        buttonText: "Ver proyectos",
        title: "🚀 Proyectos activos",
        text: "Elegí un proyecto para ver el detalle.",
        sections: [
          {
            title: "Proyectos",
            rows: proyectos.map((p) => ({
              rowId: `p:${p.slug}`,
              title: trunc(p.titulo),
              description: trunc(p.descripcion, 60),
            })),
          },
        ],
      });
    }
    case "servicios":
    case "2": {
      const servicios = await getServicios();
      _s.servicios = servicios;
      _s.state = "SERVICIOS";
      if (servicios.length === 0) {
        return text(
          `${RUFFUS} No tenemos servicios cargados todavía. Escribí *menu* para volver.`,
        );
      }
      return list({
        buttonText: "Ver servicios",
        title: "📋 Nuestros servicios",
        text: "Elegí un servicio para ver el detalle.",
        sections: [
          {
            title: "Servicios",
            rows: servicios.map((sv) => ({
              rowId: `s:${sv.slug}`,
              title: trunc(sv.titulo),
              description: trunc(sv.tagline, 60),
            })),
          },
        ],
      });
    }
    case "equipo":
    case "3": {
      const equipo = await getEquipoActivo();
      _s.equipo = equipo;
      _s.state = "EQUIPO";
      const listTxt = equipo
        .map((m) => `• ${m.nombre} — ${m.rol}`)
        .join("\n");
      return text(
        `${RUFFUS} 🐦 *Equipo de Horno:*\n${listTxt}\n\nEscribí *menu* para volver.`,
      );
    }
    default:
      return subMenu();
  }
}

export async function handleMessage(
  phone: string,
  name: string | undefined,
  raw: string,
): Promise<BotReply> {
  const clean = raw.trim().toLowerCase();
  const session = getSession(phone);

  if (["menu", "0", "hola", "inicio", "menu."].includes(clean)) {
    session.state = "ROOT";
    return rootMenu();
  }

  switch (session.state) {
    case "ROOT":
      return handleRoot(session, phone, clean);

    case "SUBMENU":
      return handleSubMenu(session, phone, clean);

    case "IDEA_AWAIT": {
      await saveLead({
        source: "whatsapp",
        contact: phone,
        name,
        option: "idea",
        message: raw.trim(),
      });
      session.state = "ROOT";
      return {
        text: `${RUFFUS} ¡Gracias por la idea! Yo se la llevo al equipo y te escribimos pronto. Escribí *menu* para más opciones.`,
        lead: { contact: phone, name, option: "idea", message: raw.trim() },
      };
    }

    case "HUMAN_AWAIT": {
      await saveLead({
        source: "whatsapp",
        contact: phone,
        name,
        option: "human",
        message: raw.trim(),
      });
      session.state = "ROOT";
      return {
        text: `${RUFFUS} ¡Listo! Uno del equipo te va a escribir por acá. Gracias ${RUFFUS}`,
        lead: { contact: phone, name, option: "human", message: raw.trim() },
      };
    }

    case "SERVICIOS": {
      const sv = clean.startsWith("s:")
        ? session.servicios?.find((x) => x.slug === clean.slice(2))
        : undefined;
      if (sv) return text(servicioDetail(sv));
      const n = parseInt(clean, 10);
      const byIndex = !isNaN(n) ? session.servicios?.[n - 1] : undefined;
      if (byIndex) return text(servicioDetail(byIndex));
      return text(
        `${RUFFUS} Elegí una opción de la lista o escribí *menu* para volver.`,
      );
    }

    case "PROYECTOS": {
      const p = clean.startsWith("p:")
        ? session.proyectos?.find((x) => x.slug === clean.slice(2))
        : undefined;
      if (p) return text(proyectoDetail(p));
      const n = parseInt(clean, 10);
      const byIndex = !isNaN(n) ? session.proyectos?.[n - 1] : undefined;
      if (byIndex) return text(proyectoDetail(byIndex));
      return text(
        `${RUFFUS} Elegí una opción de la lista o escribí *menu* para volver.`,
      );
    }

    case "EQUIPO":
      session.state = "ROOT";
      return rootMenu();

    default:
      session.state = "ROOT";
      return rootMenu();
  }
}
