# [L] Mistake audit

## Goal

Every week, the mistakes agents keep making in moq-dev's quest
repositories are grouped into classes, from the forge's records and the
maintainer's typed messages, and each class that recurred gets a follow-up
quest that fixes it at its source, for the maintainer's pick. Recurring;
nothing ends it.

## Plan

Decided 2026-11-09 (user, /quest-plan, from a comparison with
[pstack](https://github.com/cursor/plugins/tree/main/pstack)'s `/correct`
and `/reflect`):

- What does the plan cover?
  - ✅ The verification rule in `quest context` and this audit
  - Rejected: either alone
- A rule that agents settle by experiment what running something would
  answer, instead of asking?
  - ✅ Dropped: no typed message supported it. This audit measures the
    prompts first, below.
  - Rejected: planning it as stated; asking less by default, which
    reverses the guide's "block on user decisions"
- Which inputs?
  - ✅ The forge's records and the maintainer's typed messages, through
    `quest messages`
  - Rejected: forge records only; transcripts through a script each run
- What gates each run?
  - ✅ A week since the last run, the way
    the release cut waited. The decision named a
    `## Waiting` item because quests could not yet be held until a date;
    since `## Scheduled` exists, the run holds the date there (agent,
    2026-11-11).
  - Rejected: each milestone, as
    [the model check](/quest/m1/model-check.md) runs, since m0 has been
    open since 2026-09-26; each release cut
- Which milestone? ✅ m0 (rejected: m1)

Agent's choices, for the implementer to revisit. Each run:

- Read, since the last run's date: `quest usage --since <date> --json` in
  moq-dev/moq, moq-dev/moq.pro, and moq-dev/quest (each clone's root as
  `--root`), for each PR's review rounds, findings fixed and refuted,
  hand-backs, and the later PRs naming it under `## Caused by`; the diffs
  of those culprits and their fixes; and the typed messages from
  `quest messages --since <date> --json` on every host the maintainer
  types on, since `quest messages` reads only its own host. Where a host
  lacks `quest`, copy a `bun run compile` build of this checkout there,
  built for that host's OS and CPU (`bun build --compile --target`
  when they differ from this one's), and remove it afterwards. Keep one host's counts apart when comparing
  with a baseline that read only that host.
- Count a culprit pair once its fix merged since the last run, so a fix
  open across a run's start counts in exactly one run. 245 pairs whose fix
  opened since 2026-11-11 were read on 2026-11-18, too many for one session: split them by repository
  into sub-agents of about 50 pairs, each writing one JSON line per pair
  under `.tmp/`, and classify messages in another.
- Read each culprit pair's `## Caused by` line before counting it. On
  2026-11-11 only 7 of 20 pairs were escapes. `fixedBy` now counts only a
  merged fix's bullet that opens with the culprit's link, but a culprit
  can still name a PR that left the work to a planned follow-up or kept
  older behavior.
- Read both kinds of gating mistake from each record's `gated` and
  `shell` lists: gated runs ranked by least CPU, and unshared shell groups
  by most, with no threshold, judging each command's class rather than one
  cheap run of a usually heavy command. List `shared` groups apart, as CPU
  no command owns: their `cpu` also covers another session's calls in the
  cgroup, such as a sub-agent's build, so ranking them per command would
  make a cheap parent command look CPU-heavy. A `command` holds only program names and
  subcommands, such as `cd; cargo build`, so judge the class by those. Count
  `nix build` apart, since
  `nix-daemon` builds outside its gate's scope. A `shell` group's `cpu` is
  null outside a cgroup that holds the session alone, as in a terminal, so
  say how many groups were unmeasured. Records only hold calls from hosts
  whose hooks `quest setup` updated since that PR.
- `quest messages` returns every human turn as a `kind: "message"` entry,
  beside the `kind: "answer"` entries tallied below, so set aside machine-written
  ones yourself: bare skill invocations, pasted relays and logs, accepted
  suggested prompts, and `/compact`, `/clear`, and `/goal` commands.
- Group them into classes by the agent behavior behind them. A class is
  the same behavior in two or more PRs or messages; one failure is not a
  class.
- Classify each escape named under `## Caused by` as catchable from the
  culprit's diff, including one a reviewer might plausibly have caught, or
  as runtime: a nightly-only or platform lane, or a test the gate skipped.
  Tag races separately; a race is runtime only when the diff does not show
  it. Each runtime class's follow-up belongs to the repository that
  owns that gate, so it goes in the run PR's `## Follow-ups` for
  `/quest-plan` there, as the guide's Creation section says (user,
  2026-11-11, [routing evidence](/quest/m0/routing-evidence/README.md)).
- Add each escape classified catchable or maybe to its repository's eval
  set with `quest eval add`, its defect located at the culprit's head from
  the fix's diff and confirmed against the culprit's own diff, so `quest
  eval run` scores reviewers on it. A private repository's set stays in
  that repository. Another repository's cases go in its run-PR follow-up
  for `/quest-plan` there; moq-dev/moq and moq-dev/moq.pro had no set on
  2026-11-18.
- Before proposing a fix, find the quest, check, or rule that already owns
  the class, and report whether its count fell since that landed. A rule
  whose class still recurs is the case for moving it up a level.
- Fix each class at the highest level that holds: a design change that
  removes the mistake, then a check whose message names the fix (a type,
  a lint, a hook, a command's refusal), then a test, and a prose rule
  last, only for a judgment call. A check's quest names a past PR or
  message it would have caught.
- Each fix is a follow-up quest in the run's PR, as the guide's Creation
  section describes, for the repository that owns it. The audit itself
  edits no `AGENTS.md`, `CONTRIBUTING.md`, or skill.
- Tally the decision prompts per skill: how often the answer was the
  agent's own recommendation. Propose a change only where that is nearly
  always. `quest messages --json` prints each answer as a `kind: "answer"`
  entry with the skill, the `recommended` options, and the `picked` ones.
- moq-dev/quest is public, and typed messages can name customers and
  private repositories. The PR and its quests give counts and classes in
  the agent's words, never a message's text, and name no moq-dev/moq.pro
  PR or path; quotes stay in `.tmp/`.
- Leave model and effort tallies to
  [the model check](/quest/m1/model-check.md).
- The run's PR rewrites this quest at this path, or at the same path in
  the lowest open milestone once m0 completes: the new baseline, what to
  check first, and a `## Scheduled` date one week after the run's date,
  checked with `date`.

Check first next run:

- The 15 culprit pairs (11 in moq-dev/moq, 4 in moq-dev/moq.pro) whose fix
  opened before 2026-11-11 and merged after it: the 2026-11-18 run keyed
  pairs by when the fix opened, so neither run read them. Read them with
  this run's.
- Contract changes that left a dependent on the old contract, the largest
  escape class: about 41 of 204 real escapes, 26 catchable or maybe, all
  past a local review. [Review dependents](/quest/m0/review-dependents.md)
  takes it, if kept.
- Gating mistakes, after [the gate's cheap commands](/quest/m1/gate-cheap-commands.md)
  lands, if kept: 887 of 3,048 gated runs (29%) used under 5 CPU-seconds,
  together 0.16% of gated CPU, against 20% to 22% before the 2026-11-15
  rule. They queued 46,000 agent-seconds, a median 5 each. `bun test` in
  moq-dev/moq made 347 of the gated runs at a median 0.5 CPU-seconds.
  `quest review` was gated 16 times in 2.3 days, against 591 in the 14
  days before the rule. These records began with
  [moq-dev/quest#747](https://github.com/moq-dev/quest/pull/747) on
  2026-11-17, so this is 2.3 days, on this host only.
- Ungated shell CPU: unmeasured. No host had a shell-call log on
  2026-11-18, so every `shell` list was empty; the hooks
  [moq-dev/quest#747](https://github.com/moq-dev/quest/pull/747) added
  were not installed. Planned in kixel-ai/dotfiles, if kept.
- Stalls after the stop hook of
  [moq-dev/quest#600](https://github.com/moq-dev/quest/pull/600): 5.0 per
  100 typed messages on all hosts (4.3 on the audit's host), against 3.8
  before.
  Without the 12 asks for new work after a `/quest-run` ended, 2.4.
- Output handed back unchecked, after the verification rule of
  [moq-dev/quest#625](https://github.com/moq-dev/quest/pull/625): 5, 1.1
  per 100, all on the two hosts the earlier baseline did not read; 0 on
  the audit's host.
- Heads that landed past a related finding or decision after
  [moq-dev/quest#652](https://github.com/moq-dev/quest/pull/652) landed
  (2026-11-13T22:12Z): 2 in moq-dev/moq, each a finding the agent answered
  by deferring it to a follow-up, which `quest merge` accepts as answered.
  A class if it recurs.
- Hand-run `/quest-complete` after `/quest-run`
  ([moq-dev/quest#608](https://github.com/moq-dev/quest/pull/608)): 1.7 a
  day bare, none after 2026-11-15, against 6.6 in its first day.
  `/quest-run` ran 3.6 a day; `/quest-spawn` was never run bare.
- Whether moq-dev/moq and moq-dev/moq.pro planned the runtime follow-ups
  of both runs: none of 2026-11-11's had a quest there on 2026-11-18.
- `## Review` records edited by hand: 96 skip records in the window, 3 of
  which stopped `quest usage` for a whole repository until this run's PR
  reported them per PR instead.

Baseline from the 2026-11-18 run (PRs updated 2026-11-11 to 11-19; culprit
pairs whose fix opened since 2026-11-11; typed messages since 2026-11-11 on
the maintainer's three hosts, of which "the audit's host" below is the
one the 2026-11-11 baseline read alone; each class from sub-agents' hand labels, so
approximate):

- PRs: moq-dev/moq 700 (635 merged), moq-dev/moq.pro 492 (431), and
  moq-dev/quest 165 (151). `quest usage` attributed sessions from this
  host only, as the others had neither `quest` nor `token-max`.
- Escapes: 204 real of 245 pairs. moq-dev/moq 141 of 164 (catchable 24,
  maybe 61, runtime 56; races 24, 10 runtime); moq-dev/moq.pro 48 of 64
  (8, 27, 13; races 17, 8 runtime); moq-dev/quest 15 of 17 (4, 10, 1;
  races 3). 83 of the 170 distinct culprits merged before 2026-11-04.
  Not escapes: 41, mostly kept older behavior (11), deferred (6), or a
  design the maintainer later reversed.
- Classes: a contract changed without its dependents, about 41; races,
  44; Linux behavior assumed in portable code or platform-gated code with
  no off-platform build, 12 runtime (10 in moq-dev/moq, caught only by
  nightly macOS and Windows lanes or by none); unbounded or super-linear
  growth, 9.
- Merged past an open signal, any escape: 30 in moq-dev/moq, 3 in
  moq-dev/moq.pro, 2 in moq-dev/quest, most of them red checks or findings
  unrelated to the defect.
- Eval set: moq-dev/quest's grew from 26 to 32 cases with this run's
  escapes.
- Typed messages: 577, 118 set aside as machine-written, 459 left (230 on
  the audit's host). Per 100, all hosts then the audit's host: stalls until nudged 5.0 then
  4.3; waited on a blocked dependency instead of removing it 4.1 then 5.7
  (8 behind Pullfrog); routine choices asked 4.1 then 2.6 (7 asked to plan
  follow-ups a session had found); resumed after a rate limit or API
  error 3.5 then 4.8; reported instead of fixed 2.6 then 3.5; UI and copy
  rejected 2.6 then 2.6, all in moq-dev/moq.pro; proposals steered simpler
  2.0 then 0.9; searched only its own host 1.5 then 1.7; followed a plan
  past findings that undercut it 1.3 then 1.3; output handed back
  unchecked 1.1 then 0; misread intent 0.7 then 0.4.
- Decision prompts: 1,592 answers, 1,517 with a recommendation, 80% of
  which picked it. Merge picks 94% (220 of 234), follow-up keep-or-drop
  79%, other questions 73%. By skill: `/quest-merge` 90%,
  `/quest-complete` 88%, `/quest-run` 85%, `/quest-afk` 79%,
  `/quest-spawn` 75%, `/quest-plan` 68%.

## Scheduled

- 2026-11-25 - one week after the 2026-11-18 run

## Related

- [Routing evidence](/quest/m0/routing-evidence/README.md) - the escape
  baseline and the runtime-escape split
- [Model check](/quest/m1/model-check.md) - tallies the same PR records by
  model and effort
