# [S] Harden the agy reviewer

## Goal

The opt-in `agy` reviewer that [kixel-ai/quest#838](https://github.com/kixel-ai/quest/pull/838)
added settles the eight CodeRabbit findings that PR deferred: it never runs on
an API key instead of the login, its diffs ignore every attribute source its
export does, and its tests and docs match what it does.

## Plan

Deferred 2026-11-24 by the `/quest-run` coordinator under the maintainer's
"afk merge" grant, so #838 could land without another review round: agy is
opt-in and on no rung yet, and none of these lets a head read outside its
export. Reviewable. Fix or refute each, citing it:

- [Keep `GEMINI_API_KEY` out of the agy reviewer environment](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849102),
  or refuse agy when it would use that key. The quest's Plan required
  stripping credential overrides, and Antigravity documents running on the
  key under a `gemini` model provider. Strip `GOOGLE_API_KEY` too.
- [Isolate diff attributes as well as export attributes](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849093):
  the diffs still read the user's `.git/info/attributes`, global, and system
  attributes. The classifier's diffs
  already pass `--text` and `--attr-source`, as agy's do.
- [Strip the actual export directory from finding paths](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849082).
- [Make the tracked-file list unambiguous](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849089).
- [Re-check the previous head after `prepare`, before the resume range is built](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849111).
- [Exclude unsupported reviewers from the documented quota rule](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849073).
- [Skip agy success tests when Git lacks `--attr-source`](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849127).
- [Assert that the refusal starts no agy process](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849137).

Tests: each fix carries the unit test its finding names; the `GEMINI_API_KEY`
case shows the reviewer's environment holds no Google key.

## Related

- [agy sandbox](/quest/m0/agy-sandbox.md) - the OS read sandbox, which may make the attribute items moot
