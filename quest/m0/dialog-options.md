# [M] Mold common maintainer answers into dialog rules

## Goal

Update `assets/AGENTS.md` (`## Questions`) and `assets/skills/` so blocking question dialogs reflect the maintainer's most common free-text answers and stop offering contradictory or unused options:

1. Every non-trivial decision, plan, or follow-up dialog reserves an option for `"Explain it first"` (preferring 2 to 3 concrete choices plus `"Explain it first"` within the 4-option limit), and `/quest-plan` Goal prompts include a `"Drop"` option.
2. `Maintainer:` wait and manual-action dialogs (a step only the maintainer can do, with no choice to make) standardize on: Agent handles or drives the browser (when plausible), Done / I'll do it now, `"Not at my PC (defer)"`, and Drop wait.
3. `assets/skills/review.md` removes its stale option list (`- /quest-iterate`, `- skip`, `- delete`) so merge picks follow `#768`'s option set in `assets/skills/merge.md` everywhere.

Non-goal: enforcing `(Recommended)`, which `quest hook`'s `PreToolUse` check on question dialogs already does, or changing follow-ups from one question per follow-up (`#636`).

## Plan

Decided 2026-11-21 (maintainer, `/quest-plan`, from a 22-day transcript audit across three of the maintainer's hosts: 10,733 dialog answers, 1,356 true free-text custom answers after filtering multi-selects):

- Which dialog option rules should be added to `assets/AGENTS.md` and the merge/review skills?
  - ✅ Adopt all three dialog rules: universal `"Explain it first"` + `"Drop"` on plan goals, standardized `Maintainer:` wait options, and `review.md`/`merge.md` alignment (recommended)
  - Rejected: universal Explain + merge/review cleanup only (skip Wait and Drop rules); also adding a `"Defer to later milestone"` option on follow-up prompts

Evidence from the 2026-11-21 audit:

- Requests for context or explanation (`idk`, lacking context, asking to explain, or a clarifying question) appeared in 538 custom answers over 22 days (256 since 2026-11-11, and 192 on dialogs that offered no Explain option). PR `#768` added `"Explain it first"` only to merge picks, whereas most confusion occurred in `/quest-plan`, coordinator decisions, and follow-up prompts.
- Dropping, skipping, or rejecting work appeared in 136 custom answers (56 since 2026-11-11), often on `/quest-plan` Goal prompts that only offered `Yes` / `Adjust`.
- Asking the agent to do a manual step or drive the browser appeared in 62 custom answers (28 since 2026-11-11), and deferring because the maintainer was away from their PC appeared 13+ times during travel.
- Since 2026-11-15, 94.2% of 558 merge picks chose `/quest-merge`. Both `#768` options (`"Explain it first"` and `"Rethink it"`) were already used in their first 4 days, while `assets/skills/review.md` still listed `- /quest-iterate`, `- skip`, and `- /quest-delete` (picked 1 to 2% when recommending merge), causing agents to keep offering them.

This quest edits `assets/AGENTS.md` and `assets/skills/`, which the maintainer asked for by planning it.

Agent's choices, for the implementer to revisit:

- `"Explain it first"` does not apply to those wait and manual-action dialogs: their four fixed options already fill the 4-option limit, and a manual step needs no explanation of trade-offs. A `Maintainer:` item that is a decision (it gives options and a recommendation) is a decision dialog and follows rule 1 instead: 2 to 3 concrete choices plus `"Explain it first"`.
- Keep the additions in `assets/AGENTS.md` (`## Questions`) and `assets/skills/plan.md` concise per `quest guide prompting`, and define `"Explain it first"` once in `## Questions` (walk through the problem, current behavior, and concrete trade-offs, then re-ask without it) so `merge.md` does not repeat it.
- Keep `"Rethink it"` on merge picks in `assets/skills/merge.md`, and update `assets/skills/review.md` so it delegates its pick options wholly to `/quest-merge` without restating a conflicting bullet list.
- For `Maintainer:` wait dialogs, note that `"Not at my PC (defer)"` leaves the `## Waiting` item in place and skips it for the current session without re-asking.
- Check `test/skills.test.ts` and `INLINE_LIMIT` after edits so every composed skill stays well under 30,000 characters.
