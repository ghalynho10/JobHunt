# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Sign in with a Google or GitHub account, on the deployed site (see spec 0007). There is no password anywhere in the product and no email to verify. Signing in with one provider and later with the other, on the same verified email address, reaches the same account rather than a second empty one.
- Sign out, from the signed in area, returning to the entry page with the session actually cleared rather than only appearing to be.
- A plain sentence for every way sign in can fail, written for this product rather than passed through from the provider. Cancelling at the provider, an expired or reused link, a provider that cannot be reached, and a refused signup each say what happened and what to do next.
- A database level rule that refuses to create a second account for an email address that already signs in with the other provider, and names which provider owns it. It refuses on its own internal error too, rather than letting a signup through when the check itself is broken.
- `/sign-in` is now a real page in every environment. It previously answered with a 404 outside development.

### Changed

- The entry page's Google and GitHub controls now start a real sign in. They were inert labels with a "coming soon" status chip, which stopped being true the moment sign in shipped, so both the chips and the placeholder sentence are gone. The apply control in the hero card is deliberately still inert; nothing behind it exists yet.

### Removed

- The development only password sign in, deleted outright rather than switched off, along with the browser side Supabase client that existed only to serve it. No environment is one setting away from accepting a password.

### Security

- Sign in runs entirely on the server. No session check and no database call happens in the browser, and the pages that carry the sign in controls ship no client JavaScript.
- Nothing a provider sends can reach a rendered page. The failure code on the return URL is parsed against a closed set of five, an unrecognised value falls back to one generic sentence rather than being echoed, and the provider's own error text goes to error reporting only.
- The account rule runs as a `security definer` function with an empty `search_path` and fully qualified names, and its execute permission is revoked from everyone except the authentication service, so it cannot be called through the public data API.
