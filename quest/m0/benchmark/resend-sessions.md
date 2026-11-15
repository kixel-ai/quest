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
  - ✅ Each queued session, as the root of the tree it emits, when any
    session in that tree has a latest branch that headed no PR in the
    read. `attribute` prefers the latest branch, so this catches a session
    that moved to a new branch whose PR opens later. The whole tree is
    remembered because `buildRecords` (`src/cli/records.ts`) passes PRs
    from parent to sub-agent and back, so a parent on `main` takes its
    PR from a sub-agent's fresh branch
  - Rejected: only records with `pulls: []`, which misses the moved
    session; only the session whose own branch lacks a PR, which leaves a
    parent that inherits it at `pulls: []`
- When is a remembered tree resent?
  - ✅ On a pass for its group (endpoint, origin, prefix) whose PR read
    holds a PR that some member's unresolved latest branch heads, by the
    rule `attribute` uses, shared rather than copied. A PR on an older
    branch triggers nothing, since `attribute` falling back to it is
    already what was sent. The sender queues the root again, so the tree
    goes through the normal path, rebuilding every member's record, and
    widens token-max's window only once, when it is due. Waiting for the
    group's next queued session is the "next `quest` run" the record
    store's PR recommended
  - Rejected: polling each remembered tree's group on a timer, which
    spends GitHub quota every pass for a resend that can wait for the
    repository's next session
- When is a remembered tree forgotten?
  - ✅ Each upload of a root decides afresh by the rule above, so a resend
    that still leaves a member's latest branch without a PR keeps the
    tree; it is dropped when token-max no longer lists the root (its
    transcript was pruned), silently, since the first upload already sent
    everything but the PR. The harness's transcript retention bounds what
    is kept, with no constant of our own
  - Rejected: forgetting after one resend, which loses a branch whose PR
    opens later still; a fixed age; keeping it until its branch is
    deleted, which costs a git or GitHub read per session
- Milestone? ✅ m0 under the benchmark, whose end-to-end check needs every
  PR's cost to be whole (rejected: m1).

Keep what is remembered in the sender's state directory beside `pending/`,
one small file per root, holding its `Pending` and, per unresolved member,
what matching needs: its latest branch with its times and the
repositories token-max resolved for it.

## Related

- [Record endpoint](/quest/m0/benchmark/records-endpoint.md) - turns the
  sender on for each repository; this fixes what it sends
