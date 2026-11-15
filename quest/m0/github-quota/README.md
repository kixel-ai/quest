# Spend less of a person's GitHub quota

## Goal

Agents polling `quest status`, `quest wait`, and `quest unblocked` stop
draining the GitHub quota of the person running them. Three changes, each
useful alone: every REST GET revalidates with an ETag, reads use an App
installation token from Kixel Quest instead of the person's, and a forge
interface lets quest read pull request state from Kixel Quest's index.

Non-goals: emulating GitHub's API in Kixel Quest, and anything new for
outside contributors, who keep reading GitHub with their own token.

## Plan

Decided 2026-11-15 (maintainer, `/quest-plan` in kixel-ai/kixel.quest,
[kixel-ai/kixel.quest#48](https://github.com/kixel-ai/kixel.quest/pull/48),
"we're rate limited by github"): ✅ all three of reads from Kixel Quest,
ETags on every GET, and reads on an installation token (rejected: any one
alone). That day REST `core` sat at 0 of 5,000 on the maintainer's token
while about 20 agents checked PR status.

Decided 2026-11-15 (maintainer, `/quest-plan` here):

- ✅ quest has Kixel Quest's URL built in, overridable by an environment
  variable for development, and names a repository by `owner/repo` from its
  remote (rejected: a committed `.quest.json` naming the endpoint, which no
  repository had committed yet and which could drift from what Kixel Quest
  indexes). Kixel Quest says which repositories it serves; the rest use
  GitHub. Session records route the same way
  ([records endpoint](/quest/m0/benchmark/records-endpoint.md)).
- ✅ Kixel Quest is used only by a person holding a Kixel Quest token, which
  its admin-managed allow-list gives out; outside contributors stay a
  non-goal for now (rejected: a self-serve contributor role, picked and then
  withdrawn in the same interview).
- ✅ A chosen Kixel Quest backend that errors fails the command and names the
  setting that forces GitHub (rejected: falling back to GitHub, which hides
  a broken index and spends the quota this saves).

The epic's closing PR records the person's REST `core` and GraphQL use over a
day of the maintainer's agents, from `gh api rate_limit`, beside the outage
day's.
