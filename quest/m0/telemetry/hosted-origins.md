# [S] The record sender serves clones of repositories Kixel Quest hosts

## Goal

A session in a clone whose `origin` is a repository Kixel Quest hosts, `https://kixel.quest/<owner>/<repo>.git`, is queued by the stop hook and sent like a GitHub clone's, naming its PR, and shows up on Kixel Quest's `/records`.
Today `queue()` in `src/cli/send.ts` reads `origin` with `remoteRepository`, which parses only github.com URLs, so it queues nothing for such a clone and says nothing.
`quest records incident` (`reportIncident`, same file) fails the same way, with `origin is not on GitHub`.

## Plan

Found 2026-11-27 while planning kixel-ai/kixel.quest's move of its first repository onto its own forge (`quest/m0/forge/migrate/kixel-ai.md` there), which waits on this.

- Read `origin` with `remoteHost` in `src/cli/github.ts`, passing `hostedRepository` from `src/cli/forge.ts` as `originHost` does, at all three of `send.ts`'s `remoteRepository` reads, so the stop hook, the sender's sub-agent routing, and incident reports agree on the repository.
- A hosted repository has no fork parent and no GitHub rename, so its group skips `baseRepository` and `currentNamer`, and reads its PRs through Kixel Quest's forge (`hostedForge(...)`) rather than `updatedPulls` on GitHub.
- Read the hosted repository's PRs updated since the sender's cursor, merged and closed ones included, with each one's head branch and body, as `updatedPulls` reads GitHub's: the store derives a session's PRs from the record's `pulls`, and the sender's breakage scan reads merged bodies' `## Caused by`, so the open-PR read (`pulls`) would lose a PR that merged before the pass. No forge read lists that today, so it is a new read in `quest/core`'s forge calls, served by Kixel Quest.

Tests: against a local Worker hosting a repository, a session stopped in its clone is queued, sent, and names its open PR; one in a clone of a repository the Worker does not serve is dropped with the existing notice; a session whose PR merged before the pass still names it; an incident report from a hosted clone posts.

## Waiting

- kixel-ai/kixel.quest: its hosted forge answers a read of a repository's PRs updated since an instant, merged and closed ones included, with each one's number, head branch, state, and body; per the [telemetry epic](/quest/m0/telemetry/README.md)'s order its shape lands in `quest/core` first. Check that `FORGE_READS` in `src/core/forge.ts` names it and that Kixel Quest serves it for a hosted repository.

## Related

- [Sessions](/quest/m0/telemetry/sessions.md) - the record fields a hosted session's record also carries
- [Git credential helper](/quest/m0/git-credential.md) - lets the same hosts clone and push hosted repositories
