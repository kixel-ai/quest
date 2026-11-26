# [S] Read forge answers from a server on another quest commit

## Goal

A `quest` client reads Kixel Quest's (https://kixel.quest) answers whether the server runs an
older or a newer quest than the client. A field the answer lacks takes a fail-closed default,
and a field the client doesn't know is ignored. Today either case fails the whole read, as on
2026-11-25, when the 556d816 client rejected every `quest status` answer from a server pinned to
82bdc69 with `malformed forge answer.value.reviewRecord.localReview: expected a value`, and agents
fell back to `QUEST_FORGE=github` for the rest of the session.

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

Recommendations:

- Keep requests strict about unknown fields: the server shares this parser through its pin, and
  a client newer than the server is the rare case once the server follows main. A request
  field the server doesn't know should fail loudly rather than be dropped, since it may carry
  intent such as a land SHA.
- Fields a client acts on to land or review (`reviewRecord`, `risk`, `autoMerge`,
  `landingStopped`, holds) are where a wrong default is unsafe. List each defaulted field and its
  default in the PR, so the reviewer can check every one fails closed.
- Test against a recorded answer from the 82bdc69 server, which today fails.
