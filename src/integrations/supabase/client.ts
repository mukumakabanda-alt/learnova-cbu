// IMPORTANT: once you click "Enable Cloud" / connect Supabase inside the
// Lovable editor, Lovable will generate its own version of this exact file
// with the correct project URL + key already filled in — let it overwrite
// this one. This version exists so the rest of the app has something
// correct to import against before that happens.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase env vars are missing. Enable Lovable Cloud for this project (or set VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY yourself) before auth, uploads, or the catalog will work.",
  );
}

export const supabase = createClient<Database>(supabaseUrl ?? "http://localhost", supabaseKey ?? "public-anon-key", {
  auth: { persistSession: true, autoRefreshToken: true },
}) as ReturnType<typeof createClient<Database>> & Record<string, any>;

