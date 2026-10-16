import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  const missing = [!url && 'VITE_SUPABASE_URL', !key && 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(Boolean).join(', ');
  throw new Error(
    `Supabase-Konfiguration fehlt: ${missing}. Legen Sie die Datei App/.env.local an (Vorlage: .env.example) und starten Sie den Dev-Server neu.`,
  );
}
if (key.startsWith('sb_secret_') || key.includes('service_role')) {
  throw new Error('Im Browser darf nur der öffentliche Publishable Key verwendet werden, niemals ein geheimer Schlüssel.');
}

export const supabase = createClient<Database>(url, key);

export type PetRow = Database['public']['Tables']['pets']['Row'];
export type PetInsert = Database['public']['Tables']['pets']['Insert'];
export type PetUpdate = Database['public']['Tables']['pets']['Update'];
export type RoutineRow = Database['public']['Tables']['routine_items']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
