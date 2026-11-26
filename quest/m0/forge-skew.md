# [M] Read forge answers across quest versions, and stop agents pinning GitHub

## Goal

A `quest` client reads Kixel Quest's (https://kixel.quest) answers whether the server runs an
older or a newer quest than the client. A field the answer lacks takes a fail-closed default,
and a field the client doesn't know is ignored. Today either case fails the whole read, as on
2026-11-25, when the 556d816 client rejected every `quest status` answer from a server pinned to
82bdc69 with `malformed forge answer.value.reviewRecord.localReview: expected a value`, and agents
fell back to `QUEST_FORGE=github` for the rest of the session.

Agents also stop staying on GitHub after one Kixel Quest failure. Its failures say to rerun only
that command with `QUEST_FORGE=github`, and a run with the override set, for a repository Kixel
Quest serves, warns once that it spends the caller's GitHub quota.

Non-goals: a version handshake, and the server's own pin, which kixel-ai/kixel.quest's tree keeps
current.

## Plan

Decided 2026-11-25 (maintainer, /quest-plan in kixel-ai/crabx's /quest-run):

- ✅ A tolerant client plus a server that follows quest's main automatically (rejected: only
  bumping the server's pin; a version handshake where the server refuses or adapts, more
  machinery for the same result; drop).
- ✅ Each answer field added after the wire's first release gets a fail-closed default when
  absent. A missing `localReview` reads as no counting local review, never as approval.
  Recommended: give `maybe()` in `src/core/forge.ts` a default, so a field's default sits beside
  its parser, and add a test per defaulted field that an answer without it parses to the
  restrictive value.
- ✅ The client ignores answer fields it doesn't know (rejected: keep rejecting them, so the
  server can't add a field until every repository's pin catches up). Once the server follows
  main, it is usually newer than repositories' dev-shell pins. The server enforces landing,
  holds and review counting itself, and the client only reads and reports them.

- ✅ Fix the hint that keeps agents on GitHub (rejected: only landing the parser fixes). Measured
  2026-11-26 across the maintainer's five hosts: in two hours, about 90 sessions typed
  `QUEST_FORGE=github` some 2,700 times, after the `localReview` failure. Its remedy (`set
  QUEST_FORGE=github to read GitHub`, `src/cli/forge.ts` `KixelQuest`'s error) reads as a
  session setting. A `quest status` costs the caller's shared 5,000-an-hour REST quota 7 calls
  through GitHub and 0 through Kixel Quest, so those sessions drained it every hour until agents
  stalled.

Recommendations:

- Reword the remedy to name the one command, for example `rerun this command with
  QUEST_FORGE=github; leave it unset otherwise, since it spends your GitHub quota`.
- When `QUEST_FORGE=github` is set and Kixel Quest's `/forge` (already read once per run) lists
  the repository, print one stderr line per run saying that the override spends the caller's
  GitHub quota and Kixel Quest is serving reads. Skip the `/forge` read when it would be the only
  reason for one, so the warning costs no request.

- Keep requests strict about unknown fields: the server shares this parser through its pin, and
  a client newer than the server is the rare case once the server follows main. A request
  field the server doesn't know should fail loudly rather than be dropped, since it may carry
  intent such as a land SHA.
- Fields a client acts on to land or review (`reviewRecord`, `risk`, `autoMerge`,
  `landingStopped`, holds) are where a wrong default is unsafe. List each defaulted field and its
  default in the PR, so the reviewer can check every one fails closed.
- Test against a recorded answer from the 82bdc69 server, which today fails.
