import { createHandler, type MenuConfig, type HandleMessage } from "./menu";

const config: MenuConfig = {
  ruffus: "🐦‍🔥",
  root: {
    title: "Ruffus el Hornero",
    text: "Soy el pajarito del equipo que mueve la correspondencia. ¿Con qué te ayudo?",
    options: [
      { rowId: "idea", title: "💡 Tengo una idea", description: "Quiero colaborar", action: "idea" },
      { rowId: "eventos", title: "📅 Próximos eventos", response: "eventos" },
      { rowId: "submenu", title: "3️⃣ ¿Qué onda Horno?", action: "submenu", submenu: "que_onda" },
      { rowId: "hablar", title: "📞 Hablar con una persona", action: "human" },
    ],
  },
  submenus: {
    que_onda: {
      title: "3️⃣ ¿Qué onda Horno?",
      text: "Somos un equipo que labura en ideas, contenido y tecnología. Elegí qué querés conocer:",
      options: [
        { rowId: "proyectos", title: "🚀 Proyectos activos", response: "proyectos" },
        { rowId: "servicios", title: "📋 Servicios", response: "servicios" },
        { rowId: "equipo", title: "👥 Conocer al equipo", response: "equipo" },
      ],
    },
  },
  responses: {
    eventos: "📅 *Próximos eventos*\n\nPor ahora no tenemos eventos publicados, pero estamos preparando novedades.\nSi querés que te avisemos, tocá *hablar* y te contacta el equipo. Escribí *menu* para volver.",
  },
};

export const handleHornoMessage: HandleMessage = createHandler(config);
