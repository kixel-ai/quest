# [M] Cut the context a quest-start session re-sends

## Goal

A `/quest-start` session costs less per merged PR, because it carries less context through its later requests, with no loss in review quality or in what the PR validates. `quest usage` over a week of sessions shows the cut against the baseline below; no fixed target is set.

Non-goals: the writer's model and effort (owned by [Routing evidence](/quest/m0/routing-evidence/README.md)), and trimming the always-loaded rules and skills, done in [moq-dev/quest#807](https://github.com/moq-dev/quest/pull/807), which the baseline shows is not where start sessions spend.

## Plan

Decided 2026-11-22 (maintainer, `/quest-run`, on [moq-dev/quest#803](https://github.com/moq-dev/quest/pull/803)'s closing re-measure of the token waste epic): keep a follow-up on `quest-start` spend, scoped as this repository's rules size and place it (rejected: close the epic with no follow-up).

Kept 2026-11-22 (maintainer, `/quest-run` pick round on [moq-dev/quest#803](https://github.com/moq-dev/quest/pull/803)): ✅ keep this quest (rejected: drop it). The auto-compact window question went to kixel-ai/dotfiles' quest tree: ✅ keep it, holding at 400k until this quest's cut is measured (rejected: drop it).

Baseline, 2026-11-14 to 11-21, this host, from `token-max sessions` and the sessions' transcripts (a session counts as `quest-start` when it, or the session that spawned it, ran `/quest-start` first; dollars are API list prices):

- 324 sessions (196 main, 128 sub-agents) cost $2.5k of the host's $5.3k Claude spend, 47%. The median session is $4.39, the 90th percentile $18.72, the most expensive $76.
- Per merged PR: $2,504 over the 1,352 PRs merged in the window across the 7 repositories the epic measured, $1.85 each. `quest usage --since 2026-11-14` on moq-dev/quest alone, whose `implementing` role is the closest it reports, shows $89.7 over its 68 merged PRs, $1.32 each.
- Where it sits: 66% of that cost is in sessions whose context peaked above 300k tokens, and 74% is spent after a session's 50th request. Only 4.5% falls in the first 10 requests, where the rules and skills load. Opus at high effort is 62% of it.
- What it re-sends: an estimate of tool results kept in context and re-read by every later request is $726, 29% of the start cost. About three quarters of it is files read through the shell (`sed`, `grep`, `cat`, `ls`), 8.7M tokens through `sed` alone; `quest skill` and `quest context` loads are 7%, `quest gate` output 2%.

Agent's choices, for the implementer to revisit:

- Start from the measurement, not from the prose: rank the 20 largest tool results in start sessions by tokens times the requests left after them, since a few outliers may dominate. Cut those at their source when a `quest` command's own output is the cause, such as a gate's, a review's, or a status's, by printing only what the next step needs.
- For files read through the shell, add a short rule to `assets/skills/start.md`: read the range a task needs (`Read` with an offset and limit, `rg -l` or `-m` before a full `grep`), never a whole large file twice. Rules a program can check belong in a hook, so first measure whether the guidance moves the share; only if it does not, propose a `PreToolUse` check that denies an unbounded `cat` or `sed` of a file over a line limit, as its own follow-up.
- Do not lower Claude's auto-compact window (400k for Opus) in this quest: it is a setting on the maintainer's host, planned in kixel-ai/dotfiles' quest tree, and it trades re-sent cost against context lost mid-quest. Recommendation for that tree: keep 400k until this quest's cut is measured, then decide with its numbers, since 66% of start cost is in sessions above 300k tokens.
- Verify a week after the change with both measures, next to the baseline here, and with review findings per PR so a cheaper session that finds less is visible: `quest usage --since <date>`'s `implementing` role cost per merged PR on moq-dev/quest, which has no skill, parent, or peak-context field and so stands in for the start-session set; and the host-wide figures, repeated from `token-max sessions` and the transcripts as the baseline was (a session's skill from its first quest skill, a sub-agent under its parent's, peak context the largest input plus cache tokens of any request), which gives cost per merged PR and the share above 300k tokens. Run `just check` and `just test`.
- This quest edits `assets/skills/start.md`, which the maintainer asked for by planning it.

## Related

- [Routing evidence](/quest/m0/routing-evidence/README.md) - the writer A/B that tunes the model and effort behind most of this cost
