# [S] Send records to Kixel Quest by repository name

## Goal

quest sends each session's record, and the breakages its PRs name, to Kixel
Quest's built-in URL, naming the repository by `owner/repo` from its remote,
for every repository Kixel Quest serves. No repository commits a config file.
The maintainer's hosts hold their Kixel Quest token, and one real session on
a moq-dev/quest PR shows in Kixel Quest's store, its record equal to what
`quest usage --json` prints for it.

## Plan

`quest` sends the records since
[moq-dev/quest#718](https://github.com/moq-dev/quest/pull/718): it posts
`{"records": [...]}`, each a `SessionRecord` from `quest/core`, with the
user's token as a bearer token, and takes a 401 or 403 as no access.

Decided 2026-11-15 (maintainer, `/quest-plan`, the
[GitHub quota](/quest/m0/github-quota/README.md) epic): ✅ a built-in Kixel
Quest URL, overridable by an environment variable for development, with the
repository named by its remote (rejected: a committed `.quest.json`, which
no repository had committed yet).

- Delete the `.quest.json` reader (`CHECKOUT_CONFIG` in `src/cli/send.ts`)
  and the help text naming it. The token file keeps one token for Kixel
  Quest, the same one the [forge reads](/quest/m0/github-quota/forge-reads.md)
  use.
- Kixel Quest refuses a whole upload naming a repository it does not index
  or the sender cannot read, so the sender sends only the repositories
  Kixel Quest says it serves, the same answer the forge reads use, and
  keeps the rest on the host as it does today for a checkout with no
  endpoint.
- Put the token on each host, and start its sender with `quest records
  install`, through kixel-ai/dotfiles, which owns the maintainer's host
  configuration, not by hand.

Tests: a session in a checkout whose remote Kixel Quest serves is sent with
its `owner/repo`; one it refuses stays queued on the host; and the override
variable redirects both records and breakages.

Decided 2026-11-15 (maintainer, `/quest-plan` of `/quest-run`'s
follow-ups): ✅ hold this quest until the forge reads land, and name the
deploy it waits on (rejected: only the Required link, leaving the deploy to
the Goal's end check; neither, relying on coordinators to know).

Decided 2026-11-15 (same interview): ✅ the record wire stays lockstep for
now, revisited if records sit queued for days (rejected: the parser
ignoring unknown keys, which silently drops new fields at an older store
and still leaves a newer store refusing older hosts; ignoring them and
making new fields optional, which leaves every field optional for good).
`parseRecord` keeps rejecting any key it does not know, so Kixel Quest's
store and the hosts must run quest versions with the same record format; a
refused upload stays queued and retries each pass, so a lagging side delays
records rather than losing them.

## Waiting

- kixel-ai/kixel.quest: deploy `main`, so the store serves the record
  endpoint. Check that `curl -s -A quest -X POST -H 'Authorization: Bearer
  bogus' -H 'Content-Type: application/json' -d '{}'
  https://kixel.quest/records -o /dev/null -w '%{http_code}'` prints `401`,
  not `404`; its `quest/m0/deploy.md` automates deploys, and the maintainer
  can run `just deploy` there meanwhile.

## Required

- [Forge reads](/quest/m0/github-quota/forge-reads.md) - `KixelQuest.serves()`
  and the shared Kixel Quest token this sends with
