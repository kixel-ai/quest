# [M] Reviewers: Sol 6.2, Astra on XL, and a Fable shadow on L

## Goal

`quest review` reviews on `gpt-6.2-sol` wherever the tables named
`gpt-6.1-sol`, picks `gpt-6.2-astra` high first for XL PRs, and seats Fable
5.2 medium on L PRs as a candidate seat. Like the shadow, that seat reviews
each branch beside the pick, and its findings are compared, not acted on
alone. `quest usage` tallies it as its own reviewer row, and `quest eval run`
seats it as `quest review` does. The PR's `## Validation` carries the base's
and head's `quest eval run` scores and cost, as `AGENTS.md` requires for a
reviewer change.

Non-goals: what risk tiers buy in review, which
[kixel-ai/quest#819](https://github.com/kixel-ai/quest/pull/819) changes; the
writer table, which [kixel-ai/quest#829](https://github.com/kixel-ai/quest/pull/829) set.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan`, the same audit as the writer
table):

- Fable as a reviewer? ✅ A Fable medium seat at L now, beside the pick and
  the step-down shadow the 11-22 readout kept until L reaches 116 first
  rounds (rejected: swap the shadow to Fable after 12-20; score Fable on the
  eval set alone, which has 3 L cases and no XL). It is paired: each PR gets
  both, so it decides with far fewer PRs than a writer A/B. When Fable wrote
  the branch, the seat stays empty, since a reviewer never shares the latest
  writer's model.
- XL? ✅ Astra high picks first, then Opus xhigh, then Sonnet high. Until
  [review seats](/quest/m0/review-seats.md) lands, this list orders XL's
  seats; after, it supplies the Codex and Claude seats' models and
  efforts, and the tier and eval decide how many seats run and in what
  order.
  (rejected: Astra xhigh, the maintainer's own correction; Sol xhigh). With
  Fable writing every XL quest, a Fable seat there could never run, so XL
  gets none. The step-down shadow stays at XL as at L, one effort below the
  new pick.
- Sol 6.2: codex-cli 0.171.0's `~/.codex/models_cache.json` lists
  `gpt-6.2-sol` first and `gpt-6.2-astra` as the frontier model, both with
  low through xhigh. The model check's rule replaces a stale ID with the
  vendor's newer one without a decision. Check the pinned CLIs accept both
  IDs and efforts, as the model check does.

## Related

- [Routing evidence](/quest/m0/routing-evidence/README.md) - reads the Fable seat's pairs
- [Model check](/quest/m1/model-check.md) - audits these lists each milestone
