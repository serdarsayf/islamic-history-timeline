import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Cookie writes are unavailable in some server component contexts.
          }
        },
      },
    }
  );
}

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  // Verifies locally when the project signs JWTs asymmetrically; otherwise auth-js falls back to a getUser() call.
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims.sub) {
    return { supabase, user: null };
  }

  return { supabase, user: { id: data.claims.sub, email: data.claims.email } };
}
