import { signOut } from "@/features/dev-session/actions";
import { readScaffoldCheck } from "@/features/scaffold-check/queries";

/**
 * The end to end thread from spec 0001's follow-up.
 *
 * Rendering this page proves six things connect at once: the framework, the
 * Supabase server client, the session, the row level security policy, the
 * deployment, and the error path. It sits at Foundation rather than waiting for
 * feature 11, so a break in any of them is found now.
 */
export default async function HealthPage() {
  const result = await readScaffoldCheck();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Scaffold check</h1>

      {result.ok ? (
        <>
          <p>Read one row through the real server client:</p>
          <blockquote className="border-l-4 pl-4">
            {result.value.note}
          </blockquote>
          <p className="text-sm">
            Row <code>{result.value.id}</code>, created{" "}
            {result.value.created_at}.
          </p>
        </>
      ) : (
        /**
         * The failure is rendered, never swallowed. A blank page here would be
         * indistinguishable from a working one with nothing to show, which is
         * the exact failure mode the spec's error model exists to prevent.
         */
        <div role="alert" className="border-l-4 border-red-700 pl-4">
          <p className="font-semibold">Could not read the row.</p>
          <p>{result.message}</p>
          <p className="text-sm">
            Kind <code>{result.kind}</code>, severity{" "}
            <code>{result.severity}</code>.
          </p>
        </div>
      )}

      <form action={signOut}>
        <button type="submit" className="border px-3 py-1">
          Sign out
        </button>
      </form>
    </main>
  );
}
