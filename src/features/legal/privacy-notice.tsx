import { Text } from "@/components/ui/text";

import {
  BulletList,
  InlineLink,
  LegalClause,
  LegalSubheading,
  Paragraphs,
} from "./legal-document";
import {
  CONTACT_EMAIL,
  RESPONSIBLE_PARTY,
  RESPONSIBLE_PARTY_COUNTRY,
  SERVICE_NAME,
} from "./publication";
import { DATA_RECIPIENTS } from "./recipients";
import {
  IDENTITY_FIELDS,
  PERSONAL_DATA_TABLES,
  fieldsFor,
} from "./stored-fields";

/**
 * The body of the privacy notice (spec 0009, AC-2, AC-3, AC-4, AC-7, AC-8,
 * AC-10, AC-11, AC-12, AC-13, AC-14).
 *
 * WRITTEN FROM THE CODE, NOT FROM A TEMPLATE. The field list below is rendered
 * from `stored-fields.ts`, which a test binds to the generated database types;
 * the company list is rendered from `recipients.ts`, which a test binds to
 * `src/env.ts`. Neither list is typed out here, and that is invariants 1 and 2:
 * the prose on this page cannot disagree with the list the suite checks,
 * because there is only one list.
 *
 * EVERY CLAIM HERE IS ONE SOMEBODY CAN CHECK. That is the whole design. A
 * notice drafted from a template is wrong in ways a reader can catch, and a
 * reader who catches one stops believing the rest of it.
 */

const INTRODUCTION = [
  `${SERVICE_NAME} ranks real job openings against a profile you write, and keeps track of the ones you applied to. Doing that means holding your career history, so this page says exactly what is held, who else sees it, and how to have all of it removed.`,
  `${SERVICE_NAME} is run by ${RESPONSIBLE_PARTY}, an individual resident in ${RESPONSIBLE_PARTY_COUNTRY}, who is the person responsible for this data and the person you reach at the address below. There is no company behind this and no team: one person built it and one person answers your mail.`,
];

const STORED_INTRO = [
  "This is the complete list, and it is generated from the database itself rather than written out by hand, so a change to what is stored cannot quietly leave this page behind.",
];

const IDENTITY_INTRO =
  "When you sign in with Google or GitHub, that account hands over:";

const STORED_CLOSING = [
  "Nothing else is collected. There is no resume upload, no browsing history, no contact list, and nothing bought from anybody.",
];

const PURPOSE_INTRO = [
  "Under the UK and EU General Data Protection Regulation, every purpose needs a lawful basis. There are two here, and each is named with the purpose it belongs to rather than listed on its own.",
];

const PURPOSES = [
  "Your sign in details, profile, work history, preferences and applications are processed because the service cannot be provided without them. This is contract necessity: you asked for a tool that ranks jobs against your career history, and there is no version of that which does not process your career history.",
  "Error and performance events are processed to keep the service working, on the basis of legitimate interest. Nobody should be asked to opt in to a product noticing that it broke, and the events carry no personal data, which is the point below about Sentry.",
];

const RECIPIENTS_INTRO = [
  "Five other companies are involved in running this service. Each one is named here with what it actually receives, and this list is generated from the same registry the codebase uses, so a new one cannot be added without appearing here.",
];

const SENTRY_CLAIM = [
  "Sentry deserves a sentence of its own, because error reporting is the usual way personal data leaks into a third party without anybody deciding it should. It is switched off here on purpose: no user identity is attached to an event, no request body is collected, which is where profiles and resumes travel, and no cookies are sent. A change that made any of that false fails the test suite, so this sentence cannot go stale in silence.",
];

const NEVER_INTRO = [
  "Some things are worth stating as plain negatives rather than leaving to be inferred from what is above.",
];

const NEVER = [
  "Your data is not sold, and never has been.",
  "It is not used for advertising, and there is no advertising on this service.",
  "It is not shared with data brokers or any other party beyond the five companies named above.",
  "It is not used to train machine learning models, by anyone.",
  "It is not read for any purpose other than running this service for you.",
];

const GOOGLE_DISCLOSURE = [
  "Signing in with Google gives this service your email address, the display name on that account, and the address of its picture. Nothing more is requested: no access to your mail, your files, your calendar or your contacts.",
  "That data is used for one thing, which is knowing which account you are so your own profile comes back when you return. It is stored in the sign in records held by Supabase, described above, and it is shared with nobody. It is removed along with everything else when you ask for your account to be deleted.",
];

const COOKIES = [
  "One cookie is set, and it is the session cookie that keeps you signed in as you move between pages. It is strictly necessary: without it, signing in would not survive a single click. It is not used to follow you, and it means nothing to any other website.",
  "There is no analytics, no tracking, no advertising pixel, and no third party script on any page of this service. That is not a promise about intentions, it is a test: adding an analytics package or a script tag from another origin fails the build.",
];

const RETENTION = [
  "There is no fixed retention period. What you enter is kept for as long as you want it kept, and it is removed when you ask for it to be removed.",
  "Accounts that go quiet are not deleted automatically. Somebody who stops looking for work for a year and comes back should find their profile where they left it, so nothing here expires on its own. The other side of that is worth saying plainly: if you want your data gone, you have to ask, because time alone will not do it.",
];

const DELETION = [
  "Write to the address below and ask, from the email address you signed in with, and your account record is removed by hand.",
  "Removing that record removes everything: the profile, the skills, the work history, the preferences, every application and every answer you wrote all fall with it, because each is tied to the account record and the database is built to delete them alongside it. Nothing is kept back, anonymised and retained, or archived somewhere else.",
  "Two honest caveats. This is done by a person reading mail rather than by a button you press, so it takes as long as it takes somebody to read it, and there is no way to do it yourself yet. And error reports already sent to Sentry cannot be pulled back, though they carry nothing that identifies you, which is why they are safe to leave.",
];

const RIGHTS_INTRO = [
  "If you are in the United Kingdom or the European Economic Area, the law gives you the following rights over your data. Every one of them is exercised the same way, by writing to the address below from the email address you signed in with.",
];

const RIGHTS = [
  "Access: ask for a copy of everything held about you, and it is sent to you.",
  "Correction: tell us anything that is wrong, and it is fixed. Most of it you can also edit yourself once you are signed in.",
  "Deletion: ask for your account to be removed, as described above.",
  "Portability: ask for your data in a machine readable file, and it is sent to you in one.",
  "Objection: object to processing based on legitimate interest, which here means the error monitoring.",
  "Restriction: ask for processing to be paused while a dispute about accuracy or lawfulness is worked out.",
];

const RIGHTS_CLOSING = [
  "None of these costs anything, and using one is never a reason to treat your account differently. If you think your data has been handled wrongly, you can also complain to your national data protection authority, which in the United Kingdom is the Information Commissioner's Office.",
];

const TRANSFERS = [
  `The person responsible for this service lives in ${RESPONSIBLE_PARTY_COUNTRY}, and the companies named above run infrastructure in several countries, so data about somebody in the United Kingdom or the European Economic Area is processed outside it. That is a transfer, and you should know it is happening.`,
  "One thing worth naming rather than glossing over: no representative has been appointed in the European Union or the United Kingdom. A larger operation would be required to appoint one. This is a free project run by one person, and that gap is a knowing choice rather than an oversight, recorded here so you can weigh it.",
];

const CHANGES = [
  "This notice is updated in place when it needs to change, and the effective date at the top is moved when the change is a real one rather than a wording fix. There is no mailing list to announce it on, because this service sends no email.",
  "So the version published here is the version that applies, and continuing to use the service after a change means the current version is the one you are accepting. If a change matters to you and you would rather leave, the deletion route above is how you go.",
];

/** The privacy notice's clauses, in reading order. */
export function PrivacyNotice() {
  return (
    <>
      <LegalClause heading="Who is responsible">
        <Paragraphs>{INTRODUCTION}</Paragraphs>
      </LegalClause>

      {/*
       * AC-2. Both halves are rendered from `stored-fields.ts`: the identity
       * fields that arrive from the provider, and every column of every table
       * that holds anything about a person. The row identifiers and the two
       * timestamps are included rather than dismissed as plumbing, because when
       * a record was made and last changed is itself personal data.
       */}
      <LegalClause heading="What is stored about you">
        <Paragraphs>{STORED_INTRO}</Paragraphs>

        <Text>{IDENTITY_INTRO}</Text>
        <BulletList>
          {IDENTITY_FIELDS.map((field) => field.describedAs)}
        </BulletList>

        {PERSONAL_DATA_TABLES.map(({ table, heading }) => (
          <div key={table} className="flex flex-col gap-4">
            <LegalSubheading>{heading}</LegalSubheading>
            <BulletList>
              {fieldsFor(table).map((field) => field.describedAs)}
            </BulletList>
          </div>
        ))}

        <Paragraphs>{STORED_CLOSING}</Paragraphs>
      </LegalClause>

      {/* AC-12: the basis is named WITH its purpose, never as the bare word. */}
      <LegalClause heading="Why it is stored, and on what basis">
        <Paragraphs>{PURPOSE_INTRO}</Paragraphs>
        <BulletList>{PURPOSES}</BulletList>
      </LegalClause>

      {/*
       * AC-3 and AC-6: rendered from the registry, never typed out here. The
       * `dl` is the right element for a term and its explanation, and `Text`
       * carries `dt` and `dd` in its element union for exactly this.
       */}
      <LegalClause heading="Who else sees it">
        <Paragraphs>{RECIPIENTS_INTRO}</Paragraphs>

        <dl className="flex flex-col gap-5">
          {DATA_RECIPIENTS.map((recipient) => (
            <div key={recipient.id} className="flex flex-col gap-1">
              <Text as="dt" className="font-medium">
                {recipient.name}
              </Text>
              <Text as="dd">
                Receives {recipient.receives}. {recipient.why}
              </Text>
            </div>
          ))}
        </dl>

        {/* AC-4: the claim, and `sentry-claim.test.ts` is what keeps it true. */}
        <Paragraphs>{SENTRY_CLAIM}</Paragraphs>
      </LegalClause>

      {/* AC-13, second half: the plain negatives. */}
      <LegalClause heading="What is never done with it">
        <Paragraphs>{NEVER_INTRO}</Paragraphs>
        <BulletList>{NEVER}</BulletList>
      </LegalClause>

      {/*
       * AC-13, first half: how data received from Google is accessed, used,
       * stored and shared.
       *
       * NO LIMITED USE AFFIRMATION HERE, AND ITS ABSENCE IS DELIBERATE (AC-13).
       * Google's Limited Use requirements govern apps that request restricted
       * scopes, which are the ones reaching mail, files, calendars and
       * contacts. This app requests none of them: it asks only for the basic
       * sign in profile. Affirming compliance with a policy that does not
       * govern this app would be a claim nobody could check, on a page whose
       * entire value is that every claim on it can be checked. Do not add it
       * back without a scope change that actually makes it apply.
       */}
      <LegalClause heading="Data received from Google">
        <Paragraphs>{GOOGLE_DISCLOSURE}</Paragraphs>
      </LegalClause>

      {/* AC-14: the cookie, and the absence a test enforces. */}
      <LegalClause heading="Cookies and tracking">
        <Paragraphs>{COOKIES}</Paragraphs>
      </LegalClause>

      {/* AC-7. */}
      <LegalClause heading="How long it is kept">
        <Paragraphs>{RETENTION}</Paragraphs>
      </LegalClause>

      {/*
       * AC-8 and AC-10. PHRASED AS A REQUEST, NEVER AS A CONTROL. Self serve
       * deletion is feature 27 and does not exist yet, so a sentence implying a
       * button would be the page's one false claim.
       */}
      <LegalClause heading="Having everything removed">
        <Paragraphs>{DELETION}</Paragraphs>
      </LegalClause>

      {/* AC-12: the rights, and how to exercise each. */}
      <LegalClause heading="Your rights">
        <Paragraphs>{RIGHTS_INTRO}</Paragraphs>
        <BulletList>{RIGHTS}</BulletList>
        <Paragraphs>{RIGHTS_CLOSING}</Paragraphs>
      </LegalClause>

      <LegalClause heading="Where your data goes">
        <Paragraphs>{TRANSFERS}</Paragraphs>
      </LegalClause>

      {/* AC-16. */}
      <LegalClause heading="Changes to this notice">
        <Paragraphs>{CHANGES}</Paragraphs>
      </LegalClause>

      {/* AC-8: the address, once more, where somebody looking for it will look. */}
      <LegalClause heading="Getting in touch">
        <Text>
          Every request above goes to the same place, and a person reads it:{" "}
          <InlineLink href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </InlineLink>
          .
        </Text>
      </LegalClause>
    </>
  );
}
