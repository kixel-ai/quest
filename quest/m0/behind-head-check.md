# [S] Judge a behind head's quest findings from its merge base

## Goal

`quest merge --land` refuses a head for a `quest check` finding only when the head's own changes introduced it: a finding its merge base with the base already had is not the head's, so a head that is only behind the base is never refused for a finding the base fixed after it branched.
Every other refusal stays, including the one for a head that does not contain the base on a base with neither GitHub's merge queue nor the `quest land` check.

## Plan

Planned 2026-11-24 (agent, `/quest-plan`, maintainer away; every choice below is the agent's, for review).
A `/quest-run` on kixel-ai/kixel.quest spent most of a night merging main into each picked PR, rerunning its checks, and renumbering migrations, because `quest merge` refused every head that did not contain main ([kixel-ai/kixel.quest#112](https://github.com/kixel-ai/kixel.quest/pull/112), [#114](https://github.com/kixel-ai/kixel.quest/pull/114), [#120](https://github.com/kixel-ai/kixel.quest/pull/120), [#128](https://github.com/kixel-ai/kixel.quest/pull/128), [#129](https://github.com/kixel-ai/kixel.quest/pull/129), [#130](https://github.com/kixel-ai/kixel.quest/pull/130), [#132](https://github.com/kixel-ai/kixel.quest/pull/132)).
The maintainer approved landing a head that is only behind by testing it merged onto the current base, as GitHub's merge queue does.
kixel-ai/kixel.quest's `quest/m0/self-queue.md` puts that repository behind such a gate; this quest is Quest's side.

What the research found:

- The refusal comes from [#253](https://github.com/kixel-ai/quest/pull/253), after [kixelated/quest#213](https://github.com/kixelated/quest/pull/213) was reported clean but would have broken a test [#205](https://github.com/kixelated/quest/pull/205) had just added. It fires only on a base with neither a merge queue nor the `quest land` check, where GitHub's auto-merge lands the head with no build of the merged tree. GitHub's merge queue, moq-bot's `quest land watch` queue, and Kixel Quest's queue each build the head merged onto the current base, and `quest merge` already enqueues a behind head for all three.
- kixel-ai/kixel.quest's `main` requires only `check`, with no merge queue (a private repository on GitHub Team cannot have one) and no `quest land`, so it took the refusing path.
- The landing check's accuracy half, `landed()`, already compares from the merge base, so it is right on a behind head.
- Its structural half, `landingCheck` in `src/cli/landed.ts`, drops a finding only when the base tip has it. Reproduced 2026-11-24 in a scratch `test/landed.test.ts` case: a head branched while main had a dangling link, then main fixed it; the head, which never touched the link, is refused for it, though its merge takes the fix. A quest format change hits every behind head this way once a pin bump's `quest check --fix` lands.

Decisions:

- ✅ Keep the refusal on a base no gate tests (rejected: dropping it and trusting the head's own CI, which built a merge with an older base; GitHub's "require branches to be up to date", which reruns every other PR's CI after each landing and, under a ruleset that dismisses stale approvals, drops theirs). A repository paying for the refusal needs a merge-testing gate in its rulesets, not a looser `quest merge`.
- ✅ Screen the head's findings against its merge base's findings (rejected: the base tip, as today; the merge result, since the gate already builds that tree and the queues and the land fixer repair what a merge result adds, links to quests the base finished and quest-file conflicts, so refusing those at the pick would send an agent to do the queue's work). A head that contains the base has the base as its merge base, so the ungated path behaves as before.
- ✅ m0 (rejected: m1): a behind head is the norm on m0's merge-queue repositories.

Update the README's and `quest merge --help`'s "findings the base already has" to name the merge base.

Tests in `test/landed.test.ts`: a head behind a base that fixed a finding present when it branched passes; a behind head that adds a finding still fails; one more of a finding the merge base had still fails.
