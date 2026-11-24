# [L] Reviewer rungs: a fresh cross-vendor reviewer every round

## Goal

Each `quest review` round draws its reviewers from a named rung of reviewer
configs of about equal cost and quality across vendors. Each draw takes a
model the PR has not had yet while the rung has one, and never the latest
writer's, so rounds bring reviewers the PR has not seen. Each round's reviewer starts a fresh
session. It gets the earlier rounds' findings and the author's responses,
judges those fixes and refutations, and reviews the branch anew. Rungs
replace the shadow reviewer. `quest usage` reports what each reviewer model
and effort finds, so rungs are retuned from evidence.

Non-goals: how many seats a round gets, which
[review seats](/quest/m0/review-seats.md) sets by risk tier on top of this
draw; the writer tables.

## Plan

Decided 2026-11-23 (maintainer, `/quest-run` on
[kixel-ai/quest#831](https://github.com/kixel-ai/quest/pull/831#issuecomment-7111249892),
which dropped its live Fable candidate seat for this quest):

- Where? ✅ A follow-up quest (rejected: build it in kixel-ai/quest#831).
- Rungs? ✅ One ranked list of named rungs. Each rung is a set of reviewer
  configs of roughly equal cost and quality across vendors, such as Opus
  high ≈ Sol xhigh ≈ Fable medium ≈ Astra high, and each size maps to a
  rung by name (rejected: neighboring size cells as the ladder). Place
  models on rungs by cost and quality from public benchmarks, keep each
  rung's costs close, and leave out models not worth their cost.
- Draw? ✅ Every round draws its rung: the size's rung half the time, one
  rung up or down a quarter each. It takes a model from that rung the PR
  has not had yet, never the latest writer's. The maintainer: "The entire
  point is to catch bugs early, not to repeat the same thing multiple times
  over" (rejected: one draw per PR).
- Refutations? ✅ No reviewer session resumes across rounds. Each round's
  reviewer gets the earlier rounds' findings and the author's responses,
  settles each as fixed, refuted, or still open, and reviews fresh
  (rejected: also resuming each earlier reviewer).
- Experiments? ✅ Rungs replace the shadow reviewer and the Fable candidate
  (rejected: keep the L shadow until its 12-20 sample; keep the shadow
  indefinitely). `quest usage` reports, per reviewer model and effort,
  findings by severity, fixed against refuted, and later `## Caused by`
  escapes.
- Review seats? ✅ The risk tier still sets 1, 2, or 3 seats per round, and
  each seat draws from the round's rung, on distinct vendors within a round
  (rejected: keep review seats' fixed Codex, Gemini, Claude order; one seat
  and drop review seats). Until review seats lands, the round's seat count
  stays as it is.

Decided 2026-11-23 (maintainer, `/quest-run`, recorded on kixel-ai/quest#831
[for the writer rule](https://github.com/kixel-ai/quest/pull/831#issuecomment-7118052876)
and [for eval](https://github.com/kixel-ai/quest/pull/831#issuecomment-7118011769)):

- Never weaker than the writer? ✅ Drop that rule under rungs: "each
  reviewer can be a random rung. drop it under rungs." A down-draw may
  seat a model weaker than the writer; only the writer's own model stays
  excluded (rejected: keep the never-weaker rule as a constraint on the
  draw). [kixel-ai/quest#819](https://github.com/kixel-ai/quest/pull/819)'s
  `weaker()` in `src/cli/models.ts`, its widening of `--exclude-model` to
  every model weaker than the one named, its help text on weaker models,
  and its never-weaker line in [review seats](/quest/m0/review-seats.md)
  are interim routing until rungs land: this quest deletes them, and
  `--exclude-model` again avoids only the models it names.
- Measure rungs how? ✅ From real PRs' stats in `quest usage`, with no
  `quest eval` run (rejected: score each rung change with `quest eval
  run`). The maintainer: "we don't want to waste tokens on throw-away
  reviews/code". This overrides `AGENTS.md`'s rule that a reviewer change
  runs `quest eval run`, which a separate PR deletes with `quest eval`.

Recommendations, the implementer's to revisit:

- Draw with an injected random source, so tests fix the draw rather than
  sampling it. The top and bottom rungs have no step past them: give that
  quarter to the size's rung.
- Once every model on the drawn rung has reviewed the PR, take the one
  whose last round is oldest, still never the writer's, rather than borrow
  another rung's, which mostly holds the same models at another cost. A model that cannot
  run passes the round to the next untried model on the same rung, then
  as today. That includes a login or gateway that does not serve the
  model, such as Codex's `The '<model>' model is not supported when using
  Codex with a ChatGPT account`, recorded as a skip as a usage limit is.
- Key tallies by model and effort, not by seat, so a round on a model
  the PR has not had starts its own tally. Today's tally keeps one per
  harness and role and takes its latest round's model, which would credit
  one model's findings to the next.
- Record the rung and which way it was drawn on each round's Reviewer line,
  so the readout can compare the size's rung with its neighbors.
- A fresh round reviews the whole branch, since it has no session to diff
  from. Today's handover, where a new pick's first session settles the open
  findings of the reviewer it replaces, already holds the settling half;
  extend it to every round.
- Delete the shadow end to end: its seat, its state and record fields,
  `quest usage`'s shadow rows and accuracy exclusion, the README, and the
  quests that read it, such as the model check's chart.
- Seat the initial rungs from public benchmarks and list prices, and
  retune them only from `quest usage`'s per-model tallies on real PRs.
- [kixel-ai/quest#838](https://github.com/kixel-ai/quest/pull/838)'s Gemini
  harness changes how `src/cli/models.ts` routes reviewers. If it lands
  first, carry Gemini into the rungs as a rung member.

## Related

- [Routing evidence](/quest/m0/routing-evidence/README.md) - reads the rungs' per-model tallies
- [Model check](/quest/m1/model-check.md) - audits the rungs each milestone
