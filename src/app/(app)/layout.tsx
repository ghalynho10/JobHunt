import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * The protected layout. Everything under the `(app)` group requires a session.
 *
 * BINDING RULE 6: this is where the session is verified, not in `proxy.ts`. The
 * proxy only refreshes the cookie. Row level security in Postgres is the real
 * guarantee behind this check, and every Server Action verifies its own caller
 * again independently, because an action is a callable endpoint whatever page
 * renders it.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();

  // `getClaims` verifies the token rather than trusting the cookie's contents.
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    // Visible, not silent. An unauthenticated request lands on the sign in page
    // rather than rendering an empty page that reads as success.
    redirect("/sign-in");
  }

  return children;
}
