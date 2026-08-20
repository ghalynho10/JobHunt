import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/env";

import type { Database } from "./database.types";

/**
 * The request scoped server client. Every read and write goes through this.
 *
 * It carries the caller's own token, so row level security applies by
 * construction: there is no code path here that can quietly bypass a policy.
 * Never share one across requests, so this builds a new client each call.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // A Server Component cannot write cookies. That is fine here:
            // src/proxy.ts refreshes the session on every request, so the
            // refreshed cookie is already on its way back to the browser.
          }
        },
      },
    },
  );
}
