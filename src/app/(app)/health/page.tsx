import { signOut } from "@/features/dev-session/actions";
import { readScaffoldCheck } from "@/features/scaffold-check/queries";
import { readKillSwitch } from "@/lib/kill-switch";

/**
 * The end to end thread from spec 0001's follow-up, extended by spec 0002.
 *
 * Rendering this page proves six things connect at once: the framework, the
 * Supabase server client, the session, the row level security policy, the
 * deployment, and the error path. It sits at Foundation rather than waiting for
 * feature 11, so a break in any of them is found now.
 *
 * It also displays the kill switch, which proves a seventh: that the secret key
 * client can reach a table no user token can (spec 0002, AC-6). This page is
 * where a dashboard flip is confirmed to take effect with no deploy.
 *
 * The two reads are independent and use different clients, so they run
 * concurrently rather than one waiting on the other.
 */
export default async function HealthPage() {
  const [result, killSwitch] = await Promise.all([
    readScaffoldCheck(),
    readKillSwitch(),
  ]);

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

      <h2 className="mt-4 text-xl font-semibold">Kill switch</h2>

      {killSwitch.ok ? (
        <>
          <p>
            Gated calls are{" "}
            <strong>{killSwitch.value.enabled ? "stopped" : "running"}</strong>.
          </p>
          <p className="text-sm">
            Flag <code>kill_switch_enabled</code> is{" "}
            <code>{String(killSwitch.value.enabled)}</code>, last changed{" "}
            {killSwitch.value.updatedAt}.
          </p>
        </>
      ) : (
        /**
         * Spec 0002, AC-8. A failed read means switched on, and it is rendered
         * as a failure rather than as a plain "on". If a broken read and a
         * deliberate flip looked the same on screen, the one distinction this
         * criterion exists to preserve would be gone: you could not tell a
         * stopped system from a blind one.
         */
        <div role="alert" className="border-l-4 border-red-700 pl-4">
          <p className="font-semibold">
            Could not read the kill switch, so gated calls are treated as
            stopped.
          </p>
          <p>{killSwitch.message}</p>
          <p className="text-sm">
            Kind <code>{killSwitch.kind}</code>, severity{" "}
            <code>{killSwitch.severity}</code>.
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
