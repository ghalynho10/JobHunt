"use client";

// JobHunt landing page. Requires the JobHunt theme in tailwind.config
// (see brand-tokens.md: paper, surface, ink, muted, secondary, line, primary, accent; sans/mono fonts).
// Fonts: Space Grotesk (display + body) + JetBrains Mono (labels/data), loaded in your root layout.
// The static HTML preview uses the Tailwind CDN for prototyping only; remove it in production.

import { useEffect, useRef, useState } from "react";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className ?? "h-3 w-3 shrink-0"} aria-hidden="true">
      <path
        d="M2.5 6.2 4.8 8.5 9.6 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className ?? "h-3 w-3 shrink-0"} aria-hidden="true">
      <circle
        cx="6"
        cy="6"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeDasharray="2 1.6"
      />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className ?? "h-[18px] w-[18px]"} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-[18px] w-[18px]"} aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

const LOCKUP_PATH =
  "M23.19 71.4 Q12.52 71.4 6.26 65.53 Q0 59.65 0 49 L0 42.7 L12.01 42.7 L12.01 49 Q12.01 54.15 14.82 57.15 Q17.63 60.15 22.87 60.15 Q27.9 60.15 30.47 57.2 Q33.03 54.24 33.03 49 L33.03 10.92 L20.96 10.92 L20.96 0 L52.94 0 L52.94 10.92 L45.04 10.92 L45.04 49 Q45.04 59.9 39.27 65.65 Q33.5 71.4 23.19 71.4Z M85.86 71.4 Q78.46 71.4 72.62 68.37 Q66.78 65.35 63.44 59.66 Q60.1 53.97 60.1 46.05 L60.1 44.52 Q60.1 36.61 63.44 30.92 Q66.78 25.23 72.62 22.2 Q78.46 19.17 85.86 19.17 Q93.26 19.17 99.1 22.2 Q104.94 25.23 108.28 30.92 Q111.62 36.61 111.62 44.52 L111.62 46.05 Q111.62 53.97 108.28 59.66 Q104.94 65.35 99.1 68.37 Q93.26 71.4 85.86 71.4Z M85.86 61.21 Q92.15 61.21 96.16 57.17 Q100.17 53.12 100.17 45.77 L100.17 44.8 Q100.17 37.46 96.2 33.41 Q92.23 29.36 85.86 29.36 Q79.59 29.36 75.57 33.41 Q71.55 37.46 71.55 44.8 L71.55 45.77 Q71.55 53.12 75.57 57.17 Q79.59 61.21 85.86 61.21Z M147.44 71.4 Q140.51 71.4 136.76 68.95 Q133.02 66.5 131.25 63.49 L129.55 63.49 L129.55 70 L118.3 70 L118.3 0 L129.75 0 L129.75 26.76 L131.45 26.76 Q132.58 24.84 134.52 23.13 Q136.46 21.41 139.63 20.29 Q142.8 19.17 147.44 19.17 Q153.55 19.17 158.68 22.14 Q163.82 25.11 166.92 30.8 Q170.02 36.49 170.02 44.52 L170.02 46.05 Q170.02 54.08 166.91 59.77 Q163.8 65.47 158.66 68.43 Q153.53 71.4 147.44 71.4Z M144.06 61.38 Q150.3 61.38 154.42 57.36 Q158.53 53.34 158.53 45.77 L158.53 44.8 Q158.53 37.24 154.46 33.22 Q150.38 29.2 144.06 29.2 Q137.84 29.2 133.71 33.22 Q129.59 37.24 129.59 44.8 L129.59 45.77 Q129.59 53.34 133.71 57.36 Q137.84 61.38 144.06 61.38Z M179.84 70 L179.84 0 L191.85 0 L191.85 29.44 L219.53 29.44 L219.53 0 L231.54 0 L231.54 70 L219.53 70 L219.53 40.36 L191.85 40.36 L191.85 70Z M262.67 70.83 Q256.97 70.83 252.61 68.26 Q248.24 65.69 245.8 61.04 Q243.35 56.38 243.35 50.17 L243.35 20.57 L254.8 20.57 L254.8 49.28 Q254.8 55.28 257.77 58.21 Q260.74 61.14 266.12 61.14 Q272.21 61.14 275.73 57.1 Q279.24 53.06 279.24 45.62 L279.24 20.57 L290.69 20.57 L290.69 70 L279.44 70 L279.44 63.06 L277.75 63.06 Q276.44 65.81 273 68.32 Q269.56 70.83 262.67 70.83Z M303.3 70 L303.3 20.57 L314.55 20.57 L314.55 27.51 L316.25 27.51 Q317.55 24.68 320.99 22.21 Q324.43 19.74 331.32 19.74 Q337.04 19.74 341.39 22.31 Q345.75 24.88 348.2 29.5 Q350.64 34.11 350.64 40.4 L350.64 70 L339.19 70 L339.19 41.3 Q339.19 35.28 336.23 32.35 Q333.26 29.43 327.88 29.43 Q321.78 29.43 318.27 33.47 Q314.75 37.52 314.75 44.96 L314.75 70Z M381.56 70 Q376.83 70 373.98 67.13 Q371.12 64.27 371.12 59.43 L371.12 30.1 L358.16 30.1 L358.16 20.57 L371.12 20.57 L371.12 4.69 L382.57 4.69 L382.57 20.57 L396.76 20.57 L396.76 30.1 L382.57 30.1 L382.57 57.47 Q382.57 60.47 385.4 60.47 L395.32 60.47 L395.32 70Z";

function Lockup({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 484.26 71.4" className={className ?? "h-7 w-auto"} fill="currentColor" role="img" aria-label="JobHunt">
      <title>JobHunt</title>
      <g transform="scale(2.1875)">
        <rect x="2" y="2" width="11" height="3" />
        <rect x="2" y="2" width="3" height="11" />
        <rect x="12" y="12" width="8" height="8" />
        <rect x="19" y="27" width="11" height="3" />
        <rect x="27" y="19" width="3" height="11" />
      </g>
      <path transform="translate(87.5 0)" d={LOCKUP_PATH} />
    </svg>
  );
}

const MATCHED_SKILLS = ["Go", "PostgreSQL", "gRPC", "Kubernetes", "Terraform", "TypeScript", "REST APIs", "CI/CD"];
const MISSING_SKILLS = ["Airflow", "Kafka", "AWS"];

function MatchBar() {
  return (
    <div className="mt-3 flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="match-cell h-2 flex-1 rounded-sm bg-primary-600" />
      ))}
      {Array.from({ length: 3 }).map((_, i) => (
        <span key={`gap-${i}`} className="h-2 flex-1 rounded-sm border border-line" />
      ))}
    </div>
  );
}

export default function JobHuntLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (reduce || !("IntersectionObserver" in window)) {
      reveals.forEach((el) => el.classList.add("revealed"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="bg-paper font-sans text-ink antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <a href="#" className="text-primary-600" aria-label="JobHunt home">
            <Lockup />
          </a>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            <a href="#how-it-works" className="text-[14px] font-medium text-muted transition-colors hover:text-ink">How it works</a>
            <a href="#reasoning" className="text-[14px] font-medium text-muted transition-colors hover:text-ink">The reasoning</a>
            <a href="#about" className="text-[14px] font-medium text-muted transition-colors hover:text-ink">About</a>
          </nav>

          <div className="hidden items-center gap-4 md:flex">
            <a href="#start" className="mono-label text-[13px] text-muted transition-colors hover:text-ink">
              Try the demo <span className="ml-1 rounded border border-line px-1 py-0.5 text-[10px] tracking-[0.06em] text-muted">SOON</span>
            </a>
            <a href="#start" className="inline-flex items-center rounded-lg border border-line bg-surface px-4 py-2 text-[14px] font-medium transition-colors hover:border-ink/30 hover:bg-paper">
              Sign in
            </a>
          </div>

          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line md:hidden"
            aria-label="Toggle menu"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 5.5h14M3 10h14M3 14.5h14" /></svg>
          </button>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="border-t border-line bg-paper px-5 py-4 md:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobile">
              <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-[15px] font-medium hover:bg-surface">How it works</a>
              <a href="#reasoning" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-[15px] font-medium hover:bg-surface">The reasoning</a>
              <a href="#about" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-[15px] font-medium hover:bg-surface">About</a>
              <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
                <a href="#start" className="mono-label inline-flex items-center gap-2 px-3 py-2 text-[13px] text-muted">Try the demo <span className="rounded border border-line px-1 py-0.5 text-[10px] tracking-[0.06em]">SOON</span></a>
                <a href="#start" onClick={() => setMenuOpen(false)} className="rounded-lg border border-line bg-surface px-3 py-3 text-center text-[15px] font-medium">Sign in</a>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:pb-28">
          <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <p className="eyebrow" data-reveal>Job search, with the reasoning shown</p>
              <h1 data-reveal className="mt-4 max-w-[16ch] text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[54px] sm:leading-[1.06]">
                Job search that shows its work.
              </h1>
              <p data-reveal className="mt-5 max-w-[54ch] text-[17px] leading-[1.6] text-muted">
                JobHunt ranks openings for your profile, then shows exactly which skills matched and which are missing. You see the reasoning behind every result, not just a number.
              </p>

              <div data-reveal className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <a href="#start" className="inline-flex items-center gap-2.5 rounded bg-primary-800 px-6 py-4 text-[15px] font-medium text-white transition-colors hover:bg-primary-600 active:translate-y-px">
                  <GoogleIcon />
                  Sign in with Google
                </a>
                <a href="#start" className="inline-flex items-center gap-2.5 rounded border border-line bg-paper px-6 py-4 text-[15px] font-medium text-ink transition-colors hover:border-primary-800 hover:text-primary-800 active:translate-y-px">
                  <GitHubIcon />
                  Sign in with GitHub
                </a>
                <a href="#start" className="mono-label ml-1 inline-flex items-center gap-2 text-[13px] text-muted underline-offset-4 transition-colors hover:text-ink">
                  or try the demo <span className="rounded border border-line px-1 py-0.5 text-[10px] tracking-[0.06em]">SOON</span>
                </a>
              </div>
            </div>

            {/* Ranked result card */}
            <figure data-reveal className="rounded-2xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(26,26,26,0.04),0_12px_32px_-16px_rgba(26,26,26,0.18)] sm:p-6">
              <div className="flex items-center justify-between">
                <span className="mono-label text-[12px] uppercase tracking-[0.08em] text-muted">Northwind Labs</span>
                <span className="mono-label text-[12px] text-muted">4d ago</span>
              </div>
              <figcaption className="mt-2 text-[20px] font-semibold tracking-[-0.01em]">Senior Backend Engineer</figcaption>
              <p className="mono-label mt-1 text-[12.5px] text-muted">Berlin · Hybrid · €92k–118k</p>

              <div className="my-5 border-t border-line" />

              <div className="flex items-baseline justify-between">
                <span className="eyebrow">Your match</span>
                <span className="font-mono text-[22px] font-semibold tracking-[-0.01em]"><span className="rounded-md bg-accent-300 px-2 py-0.5 text-ink">8 / 11</span></span>
              </div>

              <MatchBar />

              <div className="mt-5">
                <p className="mono-label text-[12px] uppercase tracking-[0.06em] text-secondary">Matched</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MATCHED_SKILLS.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 rounded-md bg-primary-300 px-2.5 py-1 text-[13px] font-medium text-primary-800">
                      <CheckIcon />
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <p className="mono-label text-[12px] uppercase tracking-[0.06em] text-secondary">Missing</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MISSING_SKILLS.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[13px] font-medium text-muted">
                      <GapIcon />
                      {s}
                    </span>
                  ))}
                </div>
                <ul className="mt-3 space-y-1 font-mono text-[13px] leading-[1.6] text-secondary">
                  <li>Airflow: nice to have, not core to this backend role.</li>
                  <li>Kafka: nice to have, named once in the posting.</li>
                  <li>AWS: overlaps with your Terraform work, so the gap is small.</li>
                </ul>
              </div>

              <div className="my-5 border-t border-line" />

              <p className="font-mono text-[13px] leading-[1.6] text-secondary">
                <span className="text-primary-600">//</span> 8 of 11 skills matched. Strong fit on the core backend stack; the data-infra gap is the one to name in your application.
              </p>

              <a href="#" className="mt-4 inline-flex items-center gap-1 text-[13.5px] font-medium text-ink underline-offset-4 hover:underline">
                Apply on the real posting
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true"><path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
            </figure>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="max-w-2xl" data-reveal>
              <p className="eyebrow">How it works</p>
              <h2 className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-[-0.01em]">Three steps, no black box.</h2>
            </div>

            <div className="mt-12 grid gap-10 sm:grid-cols-3">
              <div data-reveal className="border-t-2 border-primary-800 pt-5">
                <span className="font-mono text-[13px] font-medium text-primary-600">01</span>
                <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.01em]">Tell it what you're after</h3>
                <p className="mt-2 text-[15px] leading-[1.6] text-muted">Point it at your profile or resume, then set real filters: location, seniority, remote or hybrid, salary, and job type.</p>
                <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden="true">
                  <span className="inline-flex items-center rounded-md border border-line px-2.5 py-1 font-mono text-[11.5px] text-muted">Location</span>
                  <span className="inline-flex items-center rounded-md border border-line px-2.5 py-1 font-mono text-[11.5px] text-muted">Remote / hybrid</span>
                  <span className="inline-flex items-center rounded-md border border-line px-2.5 py-1 font-mono text-[11.5px] text-muted">Seniority</span>
                  <span className="inline-flex items-center rounded-md border border-line px-2.5 py-1 font-mono text-[11.5px] text-muted">Salary</span>
                  <span className="inline-flex items-center rounded-md border border-line px-2.5 py-1 font-mono text-[11.5px] text-muted">Job type</span>
                </div>
              </div>
              <div data-reveal className="border-t-2 border-primary-800 pt-5">
                <span className="font-mono text-[13px] font-medium text-primary-600">02</span>
                <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.01em]">Search and read the reasoning</h3>
                <p className="mt-2 text-[15px] leading-[1.6] text-muted">Results come back ranked for you. Each one shows which skills matched and which are missing, so the number is never a mystery.</p>
                <div className="mt-4" aria-hidden="true">
                  <div className="flex gap-[3px]">
                    <span className="h-2 flex-1 rounded-sm bg-primary-600" />
                    <span className="h-2 flex-1 rounded-sm bg-primary-600" />
                    <span className="h-2 flex-1 rounded-sm bg-primary-600" />
                    <span className="h-2 flex-1 rounded-sm bg-primary-600" />
                    <span className="h-2 flex-1 rounded-sm bg-primary-600" />
                    <span className="h-2 flex-1 rounded-sm bg-primary-600" />
                    <span className="h-2 flex-1 rounded-sm border border-line" />
                    <span className="h-2 flex-1 rounded-sm border border-line" />
                  </div>
                  <p className="mt-2 font-mono text-[11.5px] text-muted">matched / gap, always both.</p>
                </div>
              </div>
              <div data-reveal className="border-t-2 border-primary-800 pt-5">
                <span className="font-mono text-[13px] font-medium text-primary-600">03</span>
                <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.01em]">Apply on the real posting, then track it</h3>
                <p className="mt-2 text-[15px] leading-[1.6] text-muted">JobHunt links out to the actual listing and records that you applied.</p>
                <p className="mt-4 font-mono text-[12.5px] leading-[1.6] text-primary-600">No auto-fill. No application is ever submitted for you.</p>
              </div>
            </div>
          </div>
        </section>

        {/* The reasoning */}
        <section id="reasoning" className="scroll-mt-24 border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="max-w-2xl" data-reveal>
              <p className="eyebrow">The reasoning</p>
              <h2 className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-[-0.01em]">The score is not a black box.</h2>
              <p className="mt-3 max-w-[60ch] text-[16px] leading-[1.6] text-muted">Most tools hand you one number. JobHunt breaks it into the parts you can actually act on.</p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <div data-reveal className="rounded-2xl border border-line bg-paper p-6 sm:p-7">
                <p className="mono-label text-[12px] uppercase tracking-[0.08em] text-muted">Most tools</p>
                <p className="mt-6 text-[44px] font-semibold leading-none tracking-[-0.02em] text-muted">82%</p>
                <div className="mt-4 h-2 w-full rounded-full bg-line/20" aria-hidden="true">
                  <div className="h-2 w-[82%] rounded-full bg-muted" />
                </div>
                <p className="mt-5 text-[15px] leading-[1.6] text-muted">A single number. You can't see which skills moved it, so you can't act on it.</p>
              </div>

              <div data-reveal className="rounded-2xl border border-line bg-surface p-6 shadow-[0_12px_32px_-20px_rgba(26,26,26,0.22)] sm:p-7">
                <p className="mono-label text-[12px] uppercase tracking-[0.08em] text-muted">JobHunt</p>
                <p className="mt-6 text-[44px] font-semibold leading-none tracking-[-0.02em]"><span className="rounded-lg bg-accent-300 px-3 py-1 text-ink">8 of 11</span></p>
                <MatchBar />
                <p className="mt-5 text-[15px] leading-[1.6] text-muted">The reasoning is written out: which skills matched, which are missing, and what to say about the gap.</p>
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
              <div data-reveal>
                <p className="eyebrow">About</p>
                <h2 className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-[-0.01em]">Built for real use, not for show.</h2>
                <div className="mt-5 space-y-4 text-[16px] leading-[1.6] text-muted">
                  <p>JobHunt is a real product in progress, built and run by one engineer. I use it for my own search, so the parts that are broken get fixed because I run into them too.</p>
                  <p>The ranking compares your profile against each posting and writes out the reasoning. A score you can't question isn't much help when you're deciding where to spend an application.</p>
                  <p>Anything not built yet is labeled as such on this page, not implied.</p>
                </div>
              </div>

              <div data-reveal className="self-start rounded-2xl border border-line bg-surface p-6">
                <p className="mono-label text-[12px] uppercase tracking-[0.08em] text-secondary">What's real today</p>
                <ul className="mt-4 space-y-4 font-mono text-[13px] leading-[1.7]">
                  <li className="flex gap-3">
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary-300 px-2 py-0.5 text-[11px] font-medium text-primary-800"><CheckIcon className="h-2.5 w-2.5" />working</span>
                    <span className="text-muted">profile · filtered search · ranked results with reasoning · application tracking</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-muted"><GapIcon className="h-2.5 w-2.5" />planned</span>
                    <span className="text-muted">email digests · a no-sign-in demo account</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Sign in */}
        <section id="start" className="scroll-mt-24 bg-primary-800">
          <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-24">
            <div data-reveal>
              <h2 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.01em] text-paper sm:text-[34px]">Start your search.</h2>
              <p className="mx-auto mt-3 max-w-[46ch] text-[16px] leading-[1.6] text-paper">Sign in with Google or GitHub and run your first search. No email, no password, no subscription. JobHunt is free.</p>
            </div>

            <div data-reveal className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href="#" className="inline-flex w-full items-center justify-center gap-2.5 rounded bg-paper px-6 py-4 text-[15px] font-medium text-ink transition-colors hover:bg-primary-300 active:translate-y-px sm:w-auto">
                <GoogleIcon />
                Sign in with Google
              </a>
              <a href="#" className="inline-flex w-full items-center justify-center gap-2.5 rounded border border-paper/50 px-6 py-4 text-[15px] font-medium text-paper transition-colors hover:border-paper hover:bg-paper/10 active:translate-y-px sm:w-auto">
                <GitHubIcon />
                Sign in with GitHub
              </a>
            </div>

            <p data-reveal className="mt-6 font-mono text-[13px] text-primary-300">
              Want a look first? <a href="#" className="text-paper underline underline-offset-4 hover:text-primary-300">Try the demo</a> <span className="ml-1 rounded border border-primary-300/50 px-1 py-0.5 text-[10px] tracking-[0.06em]">SOON</span>
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="text-primary-600">
            <Lockup className="h-6 w-auto" />
          </div>
          <p className="font-mono text-[12.5px] text-muted">Built with Next.js, TypeScript, and Tailwind. Sign-in via Google and GitHub.</p>
          <p className="font-mono text-[12.5px] text-muted">© 2026 JobHunt</p>
        </div>
      </footer>
    </div>
  );
}
