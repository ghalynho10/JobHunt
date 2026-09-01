import { AppHeader } from "@/features/app-shell/app-header";
import { readOwnProfile } from "@/features/profile/queries";
import { readKillSwitch } from "@/lib/kill-switch";

/**
 * The end to end thread from spec 0001's follow-up, extended by spec 0002 and
 * repointed onto the real data model by spec 0003.
 *
 * Rendering this page proves six things connect at once: the framework, the
 * Supabase server client, the session, the row level security policy, the
 * deployment, and the error path. It sits at Foundation rather than waiting for
 * feature 11, so a break in any of them is found now.
 *
 * It reads `profile`, a real product table, so the proof rests on something the
 * product actually uses (spec 0003, AC-14). It used to read a throwaway scaffold
 * table, which was removed once this repoint had reached production.
 *
 * It also displays the kill switch, which proves a seventh: that the secret key
 * client can reach a table no user token can (spec 0002, AC-6). This page is
 * where a dashboard flip is confirmed to take effect with no deploy.
 *
 * The two reads are independent and use different clients, so they run
 * concurrently rather than one waiting on the other.
 *
 * SPEC 0008, AC-22: IT STAYS, AND IT KEEPS SHOWING FAILURES. It is a diagnostic
 * rather than a product route, so AC-2's ban on failure treatment does not reach
 * it: showing a failure is this page's entire job. It is deliberately not in the
 * navigation. It now wears the shell like every other route under `(app)`, and
 * its own inline sign out form is GONE, because the header above it carries sign
 * out and two sign out controls on one page is exactly the residue this feature
 * exists to clear rather than inherit.
 */
export default async function HealthPage() {
  const [result, killSwitch] = await Promise.all([
    readOwnProfile(),
    readKillSwitch(),
  ]);

  return (
    <>
      <AppHeader />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-8">
        <h1 className="text-2xl font-semibold">Profile check</h1>

        {result.ok ? (
          <>
            <p>Read your own profile through the real server client:</p>
            <blockquote className="border-l-4 pl-4">
              <p className="font-semibold">{result.value.full_name}</p>
              {result.value.location ? (
                <p>{result.value.location}</p>
              ) : undefined}
              {result.value.summary ? <p>{result.value.summary}</p> : undefined}
            </blockquote>
            <p className="text-sm">
              Profile <code>{result.value.id}</code>, which is your own auth
              user id.
            </p>
          </>
        ) : (
          /**
           * The failure is rendered, never swallowed. A blank page here would be
           * indistinguishable from a working one with nothing to show, which is
           * the exact failure mode the spec's error model exists to prevent.
           *
           * Spec 0003, AC-14: a signed in user with NO profile row lands here
           * with `record_not_found`, and must see this named failure rather than
           * an empty page. That is an ordinary state until feature 9 builds the
           * form that creates a profile, and it is still shown out loud.
           */
          <div role="alert" className="border-l-4 border-red-700 pl-4">
            <p className="font-semibold">Could not read your profile.</p>
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
              <strong>
                {killSwitch.value.enabled ? "stopped" : "running"}
              </strong>
              .
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
      </main>
    </>
  );
}
