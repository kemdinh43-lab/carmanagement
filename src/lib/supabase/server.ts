import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseBrowserConfig } from "@/lib/config";
import type { Database } from "@/lib/database.types";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { anonKey, url } = getSupabaseBrowserConfig();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, options, value }) => {
          cookieStore.set(name, value, options);
        });
      }
    }
  });
}

