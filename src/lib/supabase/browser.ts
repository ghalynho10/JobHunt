import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/env";

import type { Database } from "./database.types";

/**
 * The browser client, built with the publishable key.
 *
 * Spec 0001 puts the whole data path on the server, so this exists for the auth
 * handshake only (the OAuth redirect in feature 7). Reading or writing app data
 * from here would put a query shape in the browser, which the spec rules out.
 */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
