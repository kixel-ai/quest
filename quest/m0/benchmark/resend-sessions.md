# [M] Resend a session once its branch's PR opens

## Goal

A session whose last stop came before its branch's PR opened reaches Kixel
Code's store with that PR in its record's `pulls`, so the PR's cost and
time count it. Today the sender uploads such a session once with
`pulls: []` and settles its queued stop, so it is never rebuilt. `quest
start` opens the PR at claim time, so this mostly hits ad hoc sessions
outside quests.

Check: an ad hoc session on a fresh branch stops, then its PR opens; the
next session sent from the same checkout's repository resends the first,
and the store's copy names the PR, equal to what `quest usage --json`
prints for it.

## Plan

Found in [kixel-ai/kixel.quest#36](https://github.com/kixel-ai/kixel.quest/pull/36),
the record store; the maintainer decided there to fix it (✅ keep,
rejected: drop). The gap dates from
[moq-dev/quest#718](https://github.com/moq-dev/quest/pull/718), which
settles each queued stop after one upload: list it under `## Caused by`.

How it works today, in `src/cli/send.ts`: each pass rebuilds only queued
sessions and their sub-agents, then settles their stops. It reads the PRs
updated since the group's cursor (`read/`), so a PR opened after an
upload is always read by the group's next pass, with no gap. The store
keeps each session's latest upload, so a resend replaces, never doubles.

Decided 2026-11-14 (/quest-plan, unattended, so each is a recommendation
the PR's review can overturn):

- Which sessions does the sender remember after uploading?
  - ✅ Each emitted session (sub-agents included) whose latest branch
    headed no PR in the read, since `attribute` prefers the latest branch:
    this also catches a session that moved to a new branch whose PR opens
    later
  - Rejected: only records with `pulls: []`, which misses that case
- When is a remembered session resent?
  - ✅ On a pass for its group (endpoint, origin, prefix) whose PR read
    holds a PR it would be attributed to, by the same rule `attribute`
    uses, shared rather than copied: the sender queues it again, so it
    goes through the normal path and widens token-max's window only
    once, when it is due. Waiting for the group's next queued session is
    the "next `quest` run" the record store's PR recommended
  - Rejected: polling each remembered session's group on a timer, which
    spends GitHub quota every pass for a resend that can wait for the
    repository's next session
- When is a remembered session forgotten?
  - ✅ Once resent with a PR, or when token-max no longer lists it (its
    transcript was pruned), silently, since nothing was lost that the
    first upload did not already send. The harness's transcript retention
    bounds what is kept, with no constant of our own
  - Rejected: a fixed age; keeping it until its branch is deleted, which
    costs a git or GitHub read per session
- Milestone? ✅ m0 under the benchmark, whose end-to-end check needs every
  PR's cost to be whole (rejected: m1).

Keep what is remembered in the sender's state directory beside `pending/`,
one small file per session, holding what matching needs: its branches with
their times and the repositories token-max resolved for it.

## Related

- [Record endpoint](/quest/m0/benchmark/records-endpoint.md) - turns the
  sender on for each repository; this fixes what it sends
