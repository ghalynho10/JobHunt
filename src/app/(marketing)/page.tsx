import Link from "next/link";

/**
 * A public route: no session required, so it lives in the `(marketing)` group
 * whose layout does not check one.
 *
 * Deliberately bare. Feature 6 ports the real entry page onto feature 5's design
 * tokens; this is a scaffold placeholder and should not grow.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">JobHunt</h1>
      <p>
        Scaffold. The one thread proved here is a protected page reading a row
        from Supabase through the real server client, under a real policy.
      </p>
      <Link href="/sign-in" className="underline">
        Sign in
      </Link>
    </main>
  );
}
