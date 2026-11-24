# [M] Choice lists and action items in Waiting sections

## Goal

A `## Waiting` item says what kind of answer it needs, so a client such as
Kixel Quest's inbox renders real buttons instead of guessing from prose:

```markdown
## Waiting

- Maintainer: which runner builds the Windows suite? GitHub-hosted runners bill per minute, and a self-hosted one needs a machine.
  - GitHub-hosted (Recommended) - no machine to keep up
  - Self-hosted - free minutes, but a Windows host to maintain
- Maintainer (action): open a Hetzner account; `GET /server` on the Robot API answers 200
- Maintainer (PC): plug in the capture card; `v4l2-ctl --list-devices` lists it
- moq-dev/moq: a release carries the VA-API bindings
```

- A `Maintainer:` item whose nested list marks one bullet `(Recommended)` is a
  `decision`: each bullet is a choice, `label` or `label - description`.
- `Maintainer (action):` and `Maintainer (PC):` items are `action`s, steps only
  the maintainer can take; `(PC)` still marks the ones only at their computers.
- Every other item, legacy `Maintainer:` prose and outside parties alike, is
  `prose`, read exactly as today.

`quest check` rejects a malformed choice list, `quest waiting --json` reports
each item's `kind` and a decision's `choices`, and the guide and skills teach
agents to write and ask them.

## Plan

Decided 2026-11-24 (maintainer, approving this planning task, which kixel-ai/kixel.quest's
[structured prompts](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m0/ui/structured-prompts.md)
waits on): a `Maintainer:` item with indented choice bullets, one marked
`(Recommended)`, is a `decision`; a human step is an `action`; everything else
stays `prose`, backward compatible. The syntax follows the guide's Questions
section. The maintainer asked for the guide and skill edits this needs.

Decided by the planning agent, 2026-11-24, with the maintainer away:

- ✅ `Maintainer (action):` marks a step anywhere, and `Maintainer (PC):` stays
  the step only at their computers, both `kind: "action"` (rejected:
  `(PC)` as the only action marker, which leaves a step on a website, such as
  approving an App install from a phone, as prose with no Done button;
  `(step)`, a second word for the kind the JSON and Kixel Quest call
  `action`; reading every unmarked `Maintainer:` item as an action, which
  turns legacy prose decisions into Done buttons).
- ✅ A nested list is a choice list only when one of its bullets carries
  `(Recommended)`, matched case-insensitively and ending the label (rejected:
  any nested list, which would turn checklists such as moq-dev/moq's deploy
  steps into choices). An item may hold detail lists beside it.
- ✅ `quest check` rejects, by line: a choice list under anything but a plain
  `Maintainer:` item; fewer than two choices; other than exactly one
  `(Recommended)`; `(Recommended)` anywhere but the end of a label; an empty
  or repeated label; a second choice list in one item (rejected: reading a
  broken list as prose, which hides the decision's buttons without a word;
  capping the count, since only some question tools cap it). A choice list
  never names "Explain it first" or a free-text option: the client adds them.
- ✅ A draft's hand-back is not checked, so a broken choice list there reads as
  `prose` and `quest waiting` warns on stderr with the PR and line (rejected:
  failing the whole listing on one PR body).
- ✅ JSON: each wait keeps `line`, `party`, and `text`, and adds `kind`; a
  decision adds `choices: [{label, description, recommended}]`, `description`
  `null` when absent, and its `text` is the question alone; an action keeps
  `pc` (rejected: `options`, the name Kixel Quest's rows use, which collides
  with `WaitingOptions` and the CLI's options here; `choices` and `pc` on every
  kind, which lets a decision claim `pc`). Nothing is in production, so this
  breaks the shape without a shim; the PR reports it as `quest/core` and
  `quest waiting --json` impact.
- ✅ The line output keeps printing each item's whole text, its qualifier
  included, so a reader sees the choices.

Agent's recommendations, for the implementer to revisit:

- In `src/core`, make `Wait` a union on `kind` so a choice or `pc` cannot sit
  on the wrong kind, and give `Entry` (`doc.ts`) the item's lead text and its
  nested bullets with their lines, which `parseWait` and `handBackWaits`
  (`claim.ts`) both read, so quests and PR bodies parse one way. The
  `QUALIFIED` comment in `waiting.ts` and the `quest check` message name both
  qualifiers.
- Guide (`assets/AGENTS.md`): the Format example and the `Waiting` paragraph
  show a decision and both action markers, and say a decision item carries
  the context to answer it alone, never "above" or "listed there", since
  Kixel Quest found prompts that pointed at text it does not show. Questions:
  a `decision` item is asked as its choices plus "Explain it first", an
  `action` with the user-only step options in their order.
- Skills: `run.md`'s Waits asks each item by its kind and, when it touches a
  prose `Maintainer:` item, rewrites it as a decision or action. `start.md`,
  `review.md`'s logged-out reviewer, `assets/audit.md`, and
  `assets/audits/docs.md` write decisions as choice lists and steps with a
  marker. `quest waiting --help` and the README's "Find what waits on you"
  match.

Tests: a decision parses its question and choices, the recommended one
flagged, from a quest and from a draft; a choice list beside a detail list;
a detail list alone stays prose; each `quest check` rejection by line; a
broken hand-back list reads as prose with a warning; `(action)` and `(PC)`
are actions, only `(PC)` dropped by `--no-pc`; an unknown qualifier still
fails.

## Related

- [kixel-ai/kixel.quest's structured prompts](https://github.com/kixel-ai/kixel.quest/blob/main/quest/m0/ui/structured-prompts.md) - renders these kinds as buttons, waiting on the release carrying this
