import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/env";

import type { Database } from "./database.types";

/**
 * BINDING RULE 1 (spec 0001). This is the ONLY module in the repository that may
 * build a client with the secret key (`sb_secret_...`).
 *
 * That key carries BYPASSRLS. A client built with it skips every policy, so it
 * sees and can change every user's rows. Importing this module from anywhere
 * under `src/app` is forbidden, and feature 2 adds the lint rule that enforces
 * it rather than leaving it to memory.
 *
 * The allow list is closed. Only these callers may import this:
 *
 *  1. the development only test session mint (feature 8), hard blocked outside
 *     development
 *  2. the kill switch read, `src/lib/kill-switch.ts`, built in feature 3 rather
 *     than feature 10: spec 0002 needs the switch to exist before the first
 *     external call, so feature 10 inherits this read instead of writing it
 *  3. the seeded demo account (feature 31)
 *
 * Adding a fourth caller means editing spec 0001 first, not editing this file.
 */
export function createSecretClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        // This client is never a signed in user. Persisting or refreshing a
        // session here would be meaningless and would risk leaking one.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
