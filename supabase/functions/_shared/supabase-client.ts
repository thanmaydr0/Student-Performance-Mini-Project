import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Creates a Supabase client using the service role key (for backend operations)
export function createSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

// Creates a Supabase client using the user's JWT (for RLS-aware queries)
export function createSupabaseClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  );
}
