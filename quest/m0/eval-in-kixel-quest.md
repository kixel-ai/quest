# [S] quest eval keeps each set in Kixel Quest

## Goal

`quest eval add` writes a case to Kixel Quest and `quest eval run` reads the
repository's set from it; `review-eval.json` and `EVAL_FILE` are gone, and so
are the audits' baselines in this tree, which move to Kixel Quest too. The
[mistake audit](/quest/m0/mistake-audit.md) and
[review-dependents](/quest/m0/review-dependents.md) add their cases there,
for every repository, instead of to a repository's own set.

Non-goals: changing how a case is found, located, or scored.

## Plan

Decided 2026-11-19 (maintainer, pick round of
[moq-dev/moq#9207](https://github.com/moq-dev/moq/pull/9207)): "Kixel quest
for any historical information. Git is for current agents." ✅ Apply it here
too, once Kixel Quest stores eval sets (rejected: moq only; drop the
follow-up). Confirmed 2026-11-20 (maintainer, `/quest-plan` after a
`/quest-run` in moq-dev/moq).

- Talk to Kixel Quest as `quest records` does, with its record token; a
  missing token fails `eval` with how to get one. No local-file fallback: this
  tree's Goal allows depending on Kixel Quest.
- Key each set by the repository whose escape a case records, and tag each
  case with what added it: the audit's name and run date, or `manual` for a
  plain `quest eval add`. The mistake audit and review-dependents add each
  case to its own repository's set, so "for every repository" means each
  repository's set, not one shared pool. `quest eval run` runs the current
  repository's set, every tag included; `--repo <owner/repo>` runs another
  that the token can read, and `--source <tag>` narrows a run to one audit's
  cases, so each audit reads and scores its own apart from another's.
- Import this repository's `review-eval.json` before deleting it, and check
  that `quest eval run` scores the same before and after. It is the only
  one: on 2026-11-21 no other repository Quest serves kept a
  `review-eval.json`.
- Move each audit's baseline (such as the mistake audit's "Baseline from the
  2026-11-18 run") into Kixel Quest's records the same way, and have each
  audit read its baseline from there.
- [review-dependents](/quest/m0/review-dependents.md) keeps its 14-case set
  in a clone until this lands, then adds it here.

## Waiting

- kixel-ai/kixel.quest: its quest `quest/m1/eval-sets.md` lands, so Kixel
  Quest stores and serves eval sets. Check that the file is gone from that
  repository's tree.
