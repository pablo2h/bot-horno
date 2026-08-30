import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SCHEMA = process.env.BOT_SCHEMA ?? "horno";

const SUPABASE_URL =
  process.env.BOT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.BOT_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.BOT_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Faltan variables de Supabase: BOT_SUPABASE_URL / BOT_SUPABASE_ANON_KEY.",
  );
}

const readClient: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

const writeClient: SupabaseClient = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : readClient;

export type LeadSource = "whatsapp" | "instagram";

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
    .schema(SCHEMA)
    .from("servicios")
    .select("slug,titulo,tagline,descripcion,icono")
    .order("titulo");
  if (error) throw error;
  return (data as Servicio[]) ?? [];
}

export async function getProyectosActivos(): Promise<Proyecto[]> {
  const { data, error } = await readClient
    .schema(SCHEMA)
    .from("proyectos")
    .select("slug,titulo,descripcion,estado,href")
    .eq("estado", "activo")
    .order("titulo");
  if (error) throw error;
  return (data as Proyecto[]) ?? [];
}

export async function getEquipoActivo(): Promise<MiembroEquipo[]> {
  const { data, error } = await readClient
    .schema(SCHEMA)
    .from("equipo")
    .select("slug,nombre,rol,bio")
    .eq("state", "activo")
    .order("nombre");
  if (error) throw error;
  return (data as MiembroEquipo[]) ?? [];
}

export async function saveLead(input: {
  source: LeadSource;
  contact: string;
  name?: string;
  option: "idea" | "human";
  message?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await writeClient
    .schema(SCHEMA)
    .from("leads")
    .insert({
      source: input.source,
      contact: input.contact,
      name: input.name ?? null,
      option: input.option,
      message: input.message ?? null,
      metadata: input.metadata ?? {},
    });
  if (error) throw error;
}

export async function saveWhatsappLead(input: {
  phone: string;
  name?: string;
  option: "idea" | "human";
  message?: string;
}): Promise<void> {
  return saveLead({
    source: "whatsapp",
    contact: input.phone,
    name: input.name,
    option: input.option,
    message: input.message,
  });
}
