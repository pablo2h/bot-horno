import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cargar variables del monorepo y del app antes de crear los clientes.
// __dirname = apps/bot-whatsapp/src  ->  ../.env = apps/bot-whatsapp/.env
dotenv.config({ path: path.resolve(process.cwd(), "../../.env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Preferimos BOT_* (proyecto bueno "stage" = obvnhcccovvruvpooyap).
// Fallbacks: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY apunta al proyecto correcto.
const SUPABASE_URL =
  process.env.BOT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.BOT_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.BOT_SUPABASE_SERVICE_ROLE_KEY; // solo explícito; el root apunta al proyecto muerto

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Faltan variables de Supabase: BOT_SUPABASE_URL / BOT_SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY).",
  );
}

const readClient: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false },
  },
);

// Si hay service_role lo usamos para escribir; si no, escribimos con anon
// (la tabla horno.whatsapp_leads tiene una política de insert para anon).
const writeClient: SupabaseClient = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : readClient;

export interface Servicio {
  slug: string;
  titulo: string;
  tagline: string;
  descripcion: string;
  icono: string | null;
}

export interface Proyecto {
  slug: string;
  titulo: string;
  descripcion: string;
  estado: string;
  href: string | null;
}

export interface MiembroEquipo {
  slug: string;
  nombre: string;
  rol: string;
  bio: string | null;
}

export async function getServicios(): Promise<Servicio[]> {
  const { data, error } = await readClient
    .schema("horno")
    .from("servicios")
    .select("slug,titulo,tagline,descripcion,icono")
    .order("titulo");
  if (error) throw error;
  return (data as Servicio[]) ?? [];
}

export async function getProyectosActivos(): Promise<Proyecto[]> {
  const { data, error } = await readClient
    .schema("horno")
    .from("proyectos")
    .select("slug,titulo,descripcion,estado,href")
    .eq("estado", "activo")
    .order("titulo");
  if (error) throw error;
  return (data as Proyecto[]) ?? [];
}

export async function getEquipoActivo(): Promise<MiembroEquipo[]> {
  const { data, error } = await readClient
    .schema("horno")
    .from("equipo")
    .select("slug,nombre,rol,bio")
    .eq("state", "activo")
    .order("nombre");
  if (error) throw error;
  return (data as MiembroEquipo[]) ?? [];
}

export async function saveLead(input: {
  phone: string;
  name?: string;
  option: "idea" | "human";
  message?: string;
}): Promise<void> {
  const { error } = await writeClient
    .schema("horno")
    .from("whatsapp_leads")
    .insert({
      phone: input.phone,
      name: input.name ?? null,
      option: input.option,
      message: input.message ?? null,
    });
  if (error) throw error;
}
