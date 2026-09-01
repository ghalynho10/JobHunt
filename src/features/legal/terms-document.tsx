import { Text } from "@/components/ui/text";

import {
  BulletList,
  InlineLink,
  LegalClause,
  Paragraphs,
} from "./legal-document";
import { CONTACT_EMAIL, SERVICE_NAME } from "./publication";

/**
 * The body of the terms (spec 0009, AC-15, AC-16).
 *
 * FOUR CLAUSES THAT SPEC 0009 SETTLED RATHER THAN LEFT TO THE BUILD: acceptable
 * use, content ownership and the licence granted, warranty and liability, and
 * how these terms change. Each is written from AC-15 rather than from a
 * template, which matters most on the licence: the default template licence is
 * broad, perpetual and sublicensable, and every one of those words would be
 * false here.
 *
 * NO LAWYER HAS READ THIS. Drafting from the spec removes factual error, which
 * is the common defect in a small product's terms. It does not remove legal
 * risk, and spec 0009 records that deferral as a knowing choice.
 */

const WHAT_IT_IS = [
  `${SERVICE_NAME} takes the career history you enter, compares it against real job openings, and shows you which ones fit and why. You keep track of what you applied to in the same place.`,
  "These terms are the agreement between you and the person who runs it. Signing in means you accept them. If you would rather not, the service is not one you have to use, and nothing is held against you for walking away.",
];

const FREE = [
  `${SERVICE_NAME} is free. There is nothing to pay, no trial that expires, and no plan to upgrade to.`,
  "That cuts both ways, and it is fairer to say so than to imply otherwise. There is no guarantee that the service is available, no promised uptime, and no support commitment. It may change, features may be removed, and it may stop entirely. If it does stop, the intent is to say so on this site with enough notice for anyone to take their data out first, but that is an intention rather than a promise, because a service running on one person's time cannot honestly promise more.",
];

const ACCEPTABLE_USE_INTRO = [
  "Three things are not allowed. They are short because they are the whole list, and breaking one of them is what it means when an account is removed for abuse.",
];

const ACCEPTABLE_USE = [
  "Do not scrape the service automatically. Read it, use it, and apply to what it finds you; do not point a crawler or a script at it to pull the openings out in bulk.",
  "Do not use it to apply on somebody else's behalf. This is a tool for the person whose career history is in it, not a way to run applications for other people.",
  "Do not try to reach another person's data. Nobody's profile, applications or answers are yours to look at, and attempting it is the one thing here that is treated as deliberate rather than careless.",
];

const ACCEPTABLE_USE_CLOSING = [
  "An account that breaks one of these may be removed. Where it is a genuine misunderstanding you will get a chance to say so first; where it is not, it is not.",
];

const CONTENT_OWNERSHIP = [
  "Everything you write stays yours. Your profile, your work history, the summary you wrote about yourself, and every answer you typed on an application belong to you and nobody else. Nothing here transfers ownership of any of it.",
  "Running the service does need permission to handle that content, so you grant a licence to use it, and the licence is written narrowly on purpose:",
];

const LICENCE = [
  "It is non exclusive. Your content stays just as much yours to use anywhere else.",
  "It is limited to operating this service for you: storing what you wrote, showing it back to you, and comparing it against job openings on your behalf.",
  "It ends when your data is deleted. Ask for your account to be removed and the licence goes with it.",
  "It is not sublicensable. It cannot be passed on to anybody else.",
  "It does not extend to training machine learning models, on your content or on anything derived from it.",
];

const WARRANTY = [
  "The service is provided as is, with no warranty of any kind, express or implied. In particular there is no warranty that a ranking is accurate, that an opening it shows you is real, still open, or worth your time, or that the service is available when you need it. A ranking is one tool's opinion, and the decision about where to spend an application stays yours.",
  "To the fullest extent the law allows, the person who runs this service is not liable for any loss arising from using it, including a job you did not get, an opening you missed, time spent on an application that went nowhere, or data lost to a failure. Some of those exclusions are not permitted everywhere, and where the law where you live does not permit one, it does not apply to you and the rest still stands.",
  "No cap figure is written here, and the omission is deliberate rather than an oversight. The service is free, so there is no payment to anchor a cap against, and a number invented for the look of it would mean nothing.",
];

const GOVERNING_LAW = [
  "These terms are governed by the laws of the State of Georgia, United States of America, and any dispute belongs in the state or federal courts located in Georgia.",
  "The state is written out in full because Georgia is also a country, and the people reading this are explicitly from anywhere. If you are a consumer, this does not take away rights the law where you live gives you that cannot be signed away.",
];

const CHANGES = [
  "These terms are updated in place when they need to change, and the effective date at the top is moved when the change is a real one rather than a wording fix.",
  "There is no advance notice, because this service sends no email and has no way to give it. That means the version published here is the version that applies, and continuing to use the service after a change is how the current version is accepted. Reading this page again after a while is the only way to see what moved, which is a fair thing to know rather than a detail to bury.",
];

/** The terms of use, in reading order. */
export function TermsDocument() {
  return (
    <>
      <LegalClause heading="What this is">
        <Paragraphs>{WHAT_IT_IS}</Paragraphs>
      </LegalClause>

      {/* AC-15: free, no guarantee of availability, may change or stop. */}
      <LegalClause heading="It is free, and it may change or stop">
        <Paragraphs>{FREE}</Paragraphs>
      </LegalClause>

      {/* AC-15, clause one. */}
      <LegalClause heading="What you may not do with it">
        <Paragraphs>{ACCEPTABLE_USE_INTRO}</Paragraphs>
        <BulletList>{ACCEPTABLE_USE}</BulletList>
        <Paragraphs>{ACCEPTABLE_USE_CLOSING}</Paragraphs>
      </LegalClause>

      {/*
       * AC-15, clause two. THE FIVE LIMITS ARE THE CLAUSE, not decoration on
       * it: a template licence is perpetual, sublicensable and silent about
       * training, and all three of those would be false here.
       */}
      <LegalClause heading="Your content stays yours">
        <Paragraphs>{CONTENT_OWNERSHIP}</Paragraphs>
        <BulletList>{LICENCE}</BulletList>
      </LegalClause>

      {/* AC-15, clause three. */}
      <LegalClause heading="No warranty, and what we are liable for">
        <Paragraphs>{WARRANTY}</Paragraphs>
      </LegalClause>

      <LegalClause heading="Which law applies">
        <Paragraphs>{GOVERNING_LAW}</Paragraphs>
      </LegalClause>

      {/* AC-15, clause four, and AC-16. */}
      <LegalClause heading="How these terms change">
        <Paragraphs>{CHANGES}</Paragraphs>
      </LegalClause>

      <LegalClause heading="Getting in touch">
        <Text>
          Questions about any of this go to{" "}
          <InlineLink href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </InlineLink>
          , and a person reads it.
        </Text>
      </LegalClause>
    </>
  );
}
