# [S] Read on an installation token from Kixel Quest

## Goal

A person signed in to Kixel Quest reads GitHub on a short-lived, read-only
App installation token that Kixel Quest mints, so their reads draw on the
installation's own rate-limit bucket, not their personal 5,000 an hour.
Writes, such as comments, pushes, and merges, stay on the person's token,
so they are made in that person's name.

## Plan

Decided 2026-11-15 (maintainer, `/quest-plan`): ✅ Kixel Quest mints the token
(rejected: the App's private key on every host, which would put a key that
writes to every installation on every agent host).

- quest trades the person's Kixel Quest token for an installation token
  scoped to one repository with read permissions, and caches it on disk
  until shortly before it expires.
- The endpoint, from
  [kixel-ai/kixel.quest#51](https://github.com/kixel-ai/kixel.quest/pull/51):
  `POST /installation-token` with the person's Kixel Quest token as a bearer
  token and `{"repository": "owner/repo"}`. A 200 answers
  `{token, expiresAt, repository, login}`. A 404 means the repository is not
  indexed or the person cannot read it; 429, with `Retry-After`, means the
  person hit the per-person hourly cap; 502 and 503 mean GitHub or the App
  refused the mint.
- Cache each token by repository until shortly before `expiresAt`: a host
  then mints about once per repository an hour, and minting per command
  would hit the cap within a minute.
- Without a Kixel Quest token, or on a 404, reads use the person's token as
  today, since the answer says the repository is not served. Any other
  error fails the command naming the setting that forces the person's
  token, as the [epic](/quest/m0/github-quota/README.md) decided for the
  Kixel Quest backend; a 429 never quietly spends the person's quota.
- Split the client's dependencies so a read and a write each say which token
  they use; a write on the installation token must not compile.
- Keep the caller's identity apart from the read credential. `quest wait`
  reads `viewer { login }` in the same query as the PR's activity
  (`src/cli/wait.ts`) to ignore the person's own replies, reactions, labels,
  and edits; on an installation token `viewer` is the App, so the person's
  own activity would wake the waiter. Take the person from the mint
  response's `login` and pass it in.

Tests: with a fake Kixel Quest and a fake GitHub, a read goes out on the
minted token and a write on the person's; the token is minted once and
reused until near expiry; a 404 reads on the person's token and a 429
fails naming the override; the person's own reply, reaction, label, and
edit still do not wake `quest wait` when its reads use the minted token;
and a repository Kixel Quest does not serve reads on the person's token.

## Waiting

- kixel-ai/kixel.quest: the endpoint above, in
  [kixel-ai/kixel.quest#51](https://github.com/kixel-ai/kixel.quest/pull/51),
  merged and deployed. Check that #51 merged and that `curl -X POST
  https://kixel.quest/installation-token` without a token answers 401, not
  404.
