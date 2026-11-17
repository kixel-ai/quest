# [S] Record a day of GitHub quota use under the new reads

## Goal

Agents polling `quest status`, `quest wait`, and `quest unblocked` no longer
drain the GitHub quota of the person running them: every REST GET revalidates
with an ETag, reads use an App installation token from Kixel Quest, and a forge
interface reads pull request state from Kixel Quest's index. All three have
landed; what remains is the evidence. Record the person's REST `core` and
GraphQL use over a day of the maintainer's agents, from `gh api rate_limit`,
beside the outage day's, in this quest's PR, then delete this quest.

Non-goals: emulating GitHub's API in Kixel Quest, and anything new for
outside contributors, who keep reading GitHub with their own token.

## Plan

Decided 2026-11-15 (maintainer, `/quest-plan` in kixel-ai/kixel.quest,
[kixel-ai/kixel.quest#48](https://github.com/kixel-ai/kixel.quest/pull/48),
"we're rate limited by github"): all three of reads from Kixel Quest, ETags on
every GET, and reads on an installation token. That day REST `core` sat at 0 of
5,000 on the maintainer's token while about 20 agents checked PR status.

An installation token serves only reads that go to GitHub itself, such as `quest
pr view` and the verifying reads of `quest start`; where Kixel Quest serves the
repository, its index answers the rest. Compare the person's own `core` and
GraphQL `used` per hour, from `gh api rate_limit`, on a day the maintainer's
agents ran as usual.
