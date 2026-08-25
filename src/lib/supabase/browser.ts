import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserConfig } from "@/lib/config";
import type { Database } from "@/lib/database.types";

export function createSupabaseBrowserClient() {
  const { anonKey, url } = getSupabaseBrowserConfig();
  return createBrowserClient<Database>(url, anonKey);
}

