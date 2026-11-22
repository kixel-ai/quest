# [M] Cut the context a quest-start session re-sends

## Goal

A `/quest-start` session costs less per merged PR, because it carries less context through its later requests, with no loss in review quality or in what the PR validates. `quest usage` over a week of sessions shows the cut against the baseline below; no fixed target is set.

Non-goals: the writer's model and effort (owned by [Routing evidence](/quest/m0/routing-evidence/README.md)), and trimming the always-loaded rules and skills ([PR 796](https://github.com/moq-dev/quest/pull/796)'s `quest/m0/trim-skills.md`), which the baseline shows is not where start sessions spend.

## Plan

Decided 2026-11-22 (maintainer, `/quest-run`, on [moq-dev/quest#803](https://github.com/moq-dev/quest/pull/803)'s closing re-measure of the token waste epic): keep a follow-up on `quest-start` spend, scoped as this repository's rules size and place it (rejected: close the epic with no follow-up).

Baseline, 2026-11-14 to 11-21, this host, from `token-max sessions` and the sessions' transcripts (a session counts as `quest-start` when it, or the session that spawned it, ran `/quest-start` first; dollars are API list prices):

- 324 sessions (196 main, 128 sub-agents) cost $2.5k of the host's $5.3k Claude spend, 47%. The median session is $4.39, the 90th percentile $18.72, the most expensive $76.
- Where it sits: 66% of that cost is in sessions whose context peaked above 300k tokens, and 74% is spent after a session's 50th request. Only 4.5% falls in the first 10 requests, where the rules and skills load. Opus at high effort is 62% of it.
- What it re-sends: an estimate of tool results kept in context and re-read by every later request is $726, 29% of the start cost. About three quarters of it is files read through the shell (`sed`, `grep`, `cat`, `ls`), 8.7M tokens through `sed` alone; `quest skill` and `quest context` loads are 7%, `quest gate` output 2%.

Agent's choices, for the implementer to revisit:

- Start from the measurement, not from the prose: rank the 20 largest tool results in start sessions by tokens times the requests left after them, since a few outliers may dominate. Cut those at their source when a `quest` command's own output is the cause, such as a gate's, a review's, or a status's, by printing only what the next step needs.
- For files read through the shell, add a short rule to `assets/skills/start.md`: read the range a task needs (`Read` with an offset and limit, `rg -l` or `-m` before a full `grep`), never a whole large file twice. Rules a program can check belong in a hook, so first measure whether the guidance moves the share; only if it does not, propose a `PreToolUse` check that denies an unbounded `cat` or `sed` of a file over a line limit, as its own follow-up.
- Do not lower Claude's auto-compact window (400k for Opus) in this quest: it trades re-sent cost against context lost mid-quest, and the cut above should be measured first.
- Verify with `quest usage --since <date>` over a week after the change, reporting start-session cost per merged PR and the share above 300k, next to the baseline here and with the review findings per PR so a cheaper session that finds less is visible. Run `just check` and `just test`.
- This quest edits `assets/skills/start.md`, which the maintainer asked for by planning it.

## Waiting

- Maintainer: lower Claude's auto-compact window below 400k for Opus, in your user settings (`modelSettings.claude-opus-5-5.autoCompactWindow`)? 66% of start cost is in sessions above 300k tokens, so a smaller window would cut it, but each compaction drops detail the quest may still need. Options: keep 400k until this quest's cut is measured, then decide with its numbers (recommended: the cheaper fix comes first and costs no context), try 250k for a week and compare cost per merged PR and findings per PR, or lower it now. Check it is done by reading the setting.

## Related

- [Routing evidence](/quest/m0/routing-evidence/README.md) - the writer A/B that tunes the model and effort behind most of this cost
