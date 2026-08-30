import { createHandler, type MenuConfig, type HandleMessage } from "./menu";

const config: MenuConfig = {
  ruffus: "🐦",
  root: {
    title: "Ruffus, el Hornero Pi, π, piii 🐦",
    text: "En que te puedo ayudar?",
    options: [
      { rowId: "sumarme", title: "🎉 ¡Quiero sumarme!", action: "submenu", submenu: "sumarme" },
      { rowId: "asistir", title: "🎫 ¡Quiero asistir!", action: "submenu", submenu: "asistir" },
      { rowId: "quien_sos", title: "❓ ¿Quién sos?", response: "quien_sos" },
    ],
  },
  submenus: {
    sumarme: {
      title: "¿Quién nos habla? Pi 🐦",
      text: "Elegí tu perfil:",
      options: [
        { rowId: "sumarme:bailarin", title: "Un/una bailarín", response: "sumarme_bailarin" },
        { rowId: "sumarme:emprendedor", title: "Un/una emprendedor", response: "sumarme_emprendedor" },
        { rowId: "sumarme:cosplayer", title: "Un/una cosplayer", response: "sumarme_cosplayer" },
      ],
    },
    asistir: {
      title: "¿Que queres que te cuente? Pi 🐦",
      text: "Elegí una opción:",
      options: [
        { rowId: "asistir:feria", title: "🎪 Feria: Stands, Comida y juegos", response: "feria" },
        { rowId: "asistir:cine", title: "🎬 Cine: Peliculas y Pochoclos", response: "cine" },
        { rowId: "asistir:baile", title: "💃 Baile: Freestyle y Coreografías", action: "submenu", submenu: "baile" },
        { rowId: "asistir:actividades", title: "🎯 Actividades y Juegos", response: "actividades" },
      ],
    },
    baile: {
      title: "💃 Baile: Freestyle y Coreografías",
      text: "Elegí tu modalidad:",
      options: [
        { rowId: "baile:freestyle", title: "🔥 Freestyle 1vs1", response: "baile_freestyle" },
        { rowId: "baile:dancover", title: "💃 Dance Cover K-pop", response: "baile_dancover" },
      ],
    },
  },
  responses: {
    quien_sos: [
      "Yo soy ruffus, el hornero 🐦 mensajero de @horno.ar, facilito mensajes automáticos, e información web, notifico al resto del equipo.",
      "Muevo la correspondencia de aca para alla volando.",
      "¡Tambien hago de curier privado! Si necesitas un ruffus para tu negocio o evento",
      "Si te preguntan porque lo sabes, te lo conto un pajarito. Pi pi pi 🐦",
    ],
    sumarme_bailarin: "¡Genial! Te sumás como bailarín. Próximamente te compartimos los detalles de inscripción. Pi 🐦",
    sumarme_emprendedor: "¡Excelente! Como emprendedor vas a poder tener tu stand en la feria. Próximamente te compartimos la info. Pi 🐦",
    sumarme_cosplayer: "¡Excelente! Los cosplay son bienvenidos. Próximamente te compartimos los detalles. Pi 🐦",
    feria: "🎪 *Feriatón*\n\nStands de comida, juegos y mucho más. Próximamente te compartimos la lista completa de stands y propuestas gastronómicas. Pi 🐦",
    cine: "🎬 *Cartelera de películas para este sábado 18 de septiembre:*\n\n16hs\n17hs\n\nPróximamente agregamos los títulos. Pi 🐦",
    baile_freestyle: "🔥 *Freestyle 1vs1*\n\nPodes sumarte a una competencia de baile Freestyle 1vs1 por un premio en efectivo y otros premios.\n\nLa inscripción ya es valida como una entrada. Pi 🐦",
    baile_dancover: "💃 *Dance Cover K-pop*\n\nPodes sumarte a presentar tu Dance Cover de kpop solista o grupal frente a un jurado, y pelear por los premios en efectivo para los primeros puestos.\n\nLa inscripción ya es valida como una entrada. Pi 🐦",
    actividades: "🎯 *Actividades y Juegos*\n\nApertura de puertas: 15hs\nCierre de puertas: 22hs\n\nEl resto de los horarios van a estar disponibles más adelante. Pi 🐦",
  },
};

export const handleLaConveMessage: HandleMessage = createHandler(config);
