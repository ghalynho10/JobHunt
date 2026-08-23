/**
 * A public route: no session required, so it lives in the `(marketing)` group
 * whose layout does not check one.
 *
 * AC-18 recovery drill: deliberately throws so a real production break can be
 * confirmed and the promote-to-recover path proven live. Forced dynamic so the
 * throw happens per request rather than failing the build. Reverted
 * immediately after. See spec 0002 AC-18.
 */
export const dynamic = "force-dynamic";

export default function HomePage(): never {
  throw new Error("AC-18 recovery drill: deliberate break");
}
