# [M] A parked milestone or epic offers none of its quests

## Goal

A quest, epic, or milestone can declare itself parked: work set aside with its plans kept and nothing scheduled.
`quest unblocked` (with or without `--unclaimed`, and `--json`) lists no quest under parked work, `quest start` refuses one as blocked, and `quest unblocked <path>` names the parking as its blocker, so a coordinator never skips parked quests by hand.
`quest waiting` agrees: it lists no `## Waiting` item of a quest under parked work.
Unparking is deleting the declaration; nothing else changes.

## Plan

Decided 2026-11-24 (maintainer, kixel.ai /quest-run): ✅ plan this (rejected: plan only the forge and launcher quests). kixel-ai/kixel.ai's `quest/m3/README.md` reads "m3: parked … Nothing here is scheduled", yet `quest unblocked --unclaimed` there lists every m3 quest (link-quality, mesh-keys, teleop/proof, browser-mesh), and coordinators skip them by hand.

Recommended: a `## Parked` section, holding one item that says why and when to resume, as `- until the mesh ships - kept for the fleet demo`.
It blocks the document and everything under it the way a future `## Scheduled` date does today (`ready()` and `blockers()` in `src/core/ready.ts`), reported as `Parked: <item>`, and `quest check` accepts it on any quest, epic, or milestone, with exactly one item.
Alternatives, not recommended:

- A `## Scheduled` item with no date, such as `parked - why`: reuses the plumbing, but a Scheduled date clears on its own, and parked work never does.
- A `## Waiting` item, `Maintainer: unpark when …`: a waiting quest stays ready by design, so it would still be offered, and `quest waiting` would put the unpark in front of the maintainer on every `/quest-run`, the noise parking exists to remove.
- Reading "parked" from a README's title: prose, which no other tool reads.

Recommended for `quest waiting`: omit parked work's quest items entirely, rather than listing them as blocked (`ready: false`) as it does a Required or Scheduled block, since nobody acts on work that is not scheduled. A draft PR handed back for a parked quest is still listed: an open PR is live work whatever its quest says.

Dropped: a `quest check` finding for unparked work whose `Required` names parked work. `quest unblocked <path>` already names the parking in that chain, and a milestone cannot require a later one.

Document the section in the guide's Format and Model (`assets/AGENTS.md`), next to `Scheduled`. Once a release carries it, kixel-ai/kixel.ai adds `## Parked` to its `quest/m3/README.md` as part of its next quest pin bump; that is its tree's work, not this quest's.

Tests: a quest under a parked milestone, a parked epic, and a parked quest are each left out of `unblocked` and `ready`, and `blockers()` names `Parked: …` at the right level; `waiting` omits their items but keeps a handed-back draft for one; deleting the section makes each ready again; `quest check` rejects a `## Parked` with no item or two.
