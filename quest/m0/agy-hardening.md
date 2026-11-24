# [S] Harden the agy reviewer

## Goal

The opt-in `agy` reviewer that [kixel-ai/quest#838](https://github.com/kixel-ai/quest/pull/838)
added settles the six CodeRabbit findings that PR deferred and no later PR took: its diffs ignore every
attribute source its export does, and its tests and docs match what it does.

## Plan

Deferred 2026-11-24 by the `/quest-run` coordinator under the maintainer's
"afk merge" grant, so #838 could land without another review round: none of
these lets a head read outside its export. agy has since joined the standard
and deep rungs, so a draw may seat it, and
[kixel-ai/quest#858](https://github.com/kixel-ai/quest/pull/858) took the two
that mattered once it could: it keeps `GEMINI_API_KEY` and `GOOGLE_API_KEY`
from agy, and no round resumes another's range. Reviewable. Fix or refute each, citing it:

- [Isolate diff attributes as well as export attributes](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849093):
  the diffs still read the user's `.git/info/attributes`, global, and system
  attributes. Coordinate with [classifier attributes](/quest/m0/classifier-attributes.md),
  which passes `--text` and `--attr-source` to the classifier's diffs.
- [Strip the actual export directory from finding paths](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849082).
- [Make the tracked-file list unambiguous](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849089).
- [Exclude unsupported reviewers from the documented quota rule](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849073).
- [Skip agy success tests when Git lacks `--attr-source`](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849127).
- [Assert that the refusal starts no agy process](https://github.com/kixel-ai/quest/pull/838#discussion_r4676849137).

Tests: each fix carries the unit test its finding names.

## Related

- [agy sandbox](/quest/m0/agy-sandbox.md) - the OS read sandbox, which may make the attribute items moot
