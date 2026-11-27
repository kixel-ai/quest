# [S] The record sender serves clones of repositories Kixel Quest hosts

## Goal

A session in a clone whose `origin` is a repository Kixel Quest hosts, `https://kixel.quest/<owner>/<repo>.git`, is queued by the stop hook and sent like a GitHub clone's, naming its PR, and shows up on Kixel Quest's `/records`.
Today `queue()` in `src/cli/send.ts` reads `origin` with `remoteRepository`, which parses only github.com URLs, so it queues nothing for such a clone and says nothing.
`quest records incident` (`reportIncident`, same file) fails the same way, with `origin is not on GitHub`.

## Plan

Found 2026-11-27 while planning kixel-ai/kixel.quest's move of its first repository onto its own forge (`quest/m0/forge/migrate/kixel-ai.md` there), which waits on this.

- Read `origin` with `remoteHost` in `src/cli/github.ts`, passing `hostedRepository` from `src/cli/forge.ts` as `originHost` does, at all three of `send.ts`'s `remoteRepository` reads, so the stop hook, the sender's sub-agent routing, and incident reports agree on the repository.
- A hosted repository has no fork parent and no GitHub rename, so its group skips `baseRepository` and `currentNamer`, and reads its PRs through Kixel Quest's forge (`hostedForge(...)`) rather than `updatedPulls` on GitHub.
- Recommended: name a hosted session's PRs from the forge's existing open-PR read (`pulls`) and rely on the record's `branch`, which Kixel Quest joins to a PR opened after the session. If a session whose PR merged before the pass then loses its PR, add a `since` read to `quest/core`'s forge calls instead, and a `Waiting` item for its server side.

Tests: against a local Worker hosting a repository, a session stopped in its clone is queued, sent, and names its open PR; one in a clone of a repository the Worker does not serve is dropped with the existing notice; an incident report from a hosted clone posts.

## Related

- [Sessions](/quest/m0/telemetry/sessions.md) - the record fields a hosted session's record also carries
- [Git credential helper](/quest/m0/git-credential.md) - lets the same hosts clone and push hosted repositories
