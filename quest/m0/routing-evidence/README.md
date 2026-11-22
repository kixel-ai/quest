# [L] Routing evidence

## Goal

`quest usage` counts each PR's full cost and every finding caught before
merge, by writer, reviewer, model, and effort. Controlled experiments then
measure what each writer and reviewer effort buys, so routing is retuned
from evidence rather than benchmarks alone. This epic's own work is the
experiments' readout: a recommendation for each table cell they cover, put
to the maintainer as a decision, and the end of the writer A/B.

Non-goal: catching runtime escapes, such as nightly-only lanes, platform
builds, and races, in each repository's gate. Each repository's quest tree
owns that work. [The mistake audit](/quest/m0/mistake-audit.md) files it
there.

## Plan

Decided 2026-11-11 (user, /quest-plan, from an audit of PRs merged
2026-11-01 to 11-11 in moq-dev/moq, moq-dev/moq.pro and moq-dev/quest):

- Scope?
  - ✅ Records, experiments, and runtime escapes, the last in the
    repositories that own them plus the mistake audit
  - Rejected: records and experiments only; routing changes only
- Review table? ✅ Restore the efforts in place before 2026-11-05 and raise
  XS: Sol medium, medium, high, xhigh, xhigh for XS to XL, A/B tested by
  `quest review`'s shadow reviewer, the size's pick one effort lower.
  Rejected: raising only XS and M; no change until measured.
- Experiments? ✅ Shadow reviews and a writer A/B (rejected: shadow reviews
  only; none).
- Records?
  - ✅ Cumulative review tallies and online reviewers in usage
  - ✅ Attribution through token-max,
    kept after the maintainer first left it out, because the writer A/B
    compares cost and `quest usage` crashes on this host
  - Rejected: a PR-body hook that validates `## Models` and `## Caused by`
- Milestone? ✅ m0 (rejected: m1).

Readout, the agent's choices for the implementer to revisit:

- Start one week after both experiments are live. From `quest usage --json`,
  compute each arm's variance and the number of PRs each arm needs to
  detect a difference worth acting on. If the arms have not reached it,
  rewrite the `Scheduled` date below for the date they will, and stop. XL
  quests are rare, so report how many each XL arm got rather than wait for
  a detectable difference there (user, 2026-11-13).
- Decide the writer arms on first-round findings, the difference worth
  acting on 0.25 per PR, and report cost beside them (2026-11-22 readout).
  Per-PR cost is too heavy-tailed to separate the arms: its log has a
  standard deviation of about 1.5, so a 25% difference in geometric mean
  needs about 380 merged PRs per arm at XS and 780 at S and M, months away.
  Leave out a PR whose first `Implementer:` line names an arm but not that
  arm's model, mostly quests resized after the arm was drawn; 13 did by
  11-21.
- `quest usage`'s `arms` rollup counts each sized PR whose every
  `Implementer:` line names the same arm, under its first line's writer,
  with every session's spend on it. Escapes are too rare to separate the
  arms (about 2% of PRs): report them alongside, not as the measure.
- For each writer arm, compare first-round findings from the fixed efforts in
  `src/cli/models.ts`, review rounds, hand-backs, later `## Caused by` culprits, and cost
  per merged PR. For each shadow pair, compare findings the routed reviewer
  raised that the shadow missed, and the reverse, along with fixed and
  refuted findings and cost per PR. A shadow finding that matches a routed
  finding on the same file, within a few lines, counts as found by both;
  check a sample of matches by hand before trusting the rule. The PR body's
  `## Review` record keeps only tallies and the latest findings, so read
  each finding's location from the branch's saved rounds under the clones'
  `.git/quest/review/`. Recommend each table change to the
  maintainer with its tally. End the writer A/B by deleting its arms from
  `src/cli/models.ts`, with `quest models --arm`, the `arm` field of
  `quest unblocked --json`, and the arm notes in the README, guide, and
  `/quest-run` and `/quest-iterate`. Keep the shadow reviewer only if the maintainer
  chooses to: once L's pairs reach 116 first rounds, about 2026-12-20, end
  its step down at L and XL, and read the step up at S and M below.
- Carry the tallies into [the model check](/quest/m1/model-check.md)'s
  baseline.
- Chart the arms' cost against quality as
  [the model check](/quest/m1/model-check.md)'s chart procedure describes,
  one point per arm, and link the charts with the recommendations. Its
  `quest usage --json` rows give each arm's cost per merged PR and
  first-round findings, and each shadow pair's cost and findings per PR.
  Only tallies begun after
  [moq-dev/quest#721](https://github.com/moq-dev/quest/pull/721) merged
  record a first round, so count first rounds only over those.

Readout of 2026-11-22, from `quest usage --since 2026-11-14 --json` over
moq-dev/moq, moq-dev/moq.pro, and moq-dev/quest, with this host's, the CI
host's, and the Fedora host's sessions (the laptop was offline), and the
three hosts' saved review rounds:

- Shadow reviewer, Sol each time: first-round findings per PR on the PRs
  both seats reviewed, then findings matched by location on the first
  head both reviewed (same file, within 10 lines; 15 of 15 sampled matches
  were the same defect, and the counts barely move from an exact line to
  anywhere in the file). The routed seat's cost per PR covers all its
  rounds, the shadow's only the rounds it reran. The PR records and the
  saved rounds cover slightly different PRs.

  | Size | Routed / shadow | PRs | First-round findings | Routed only / both / shadow only | Cost per PR |
  |---|---|---|---|---|---|
  | XS | medium / low | 73 | 6 / 1 | 3 / 0 / 0 | $0.33 / $0.11 |
  | S | medium / low | 119 | 31 / 16 | 23 / 10 / 4 | $0.35 / $0.14 |
  | M | high / medium | 82 | 61 / 30 | 39 / 18 / 10 | $0.70 / $0.24 |
  | L | xhigh / high | 25 | 41 / 31 | 19 / 23 / 12 | $1.47 / $0.65 |
  | XL | xhigh / high | 1 | 3 / 2 | 1 / 2 / 0 | $2.22 / $1.06 |

  Each paired measure needs 9 PRs at XS, 23 at S, 65 at M, and 116 at L to
  detect 0.25 first-round findings per PR, so XS, S, and M have their
  answer and L is about 2026-12-20 away. The shadow found more of what the
  routed seat missed at L (0.46 per PR) than at M (0.11) or S (0.03), and
  on high-tier PRs more than medium. The shadow cost about $52 over the
  week. Both seats' findings were mostly fixed: refuted 9 of 103 routed and
  5 of 36 shadow at M, 5 of 78 and 2 of 47 at L.
- Decided 2026-11-22 (maintainer, `/quest-run`,
  [moq-dev/quest#801](https://github.com/moq-dev/quest/pull/801#issuecomment-7073966129)):
  - Review table? ✅ Keep every cell, Sol medium, medium, high, xhigh,
    xhigh for XS to XL (rejected: lower XS to low).
  - Shadow reviewer? ✅ Retarget it: none at XS, one effort above the
    routed pick at S and M, to measure whether raising them pays, and one
    below at L until L reaches its sample (rejected: unchanged until
    12-20, then end it; end it now; a permanent second reviewer at L and
    XL, left to [the guardrails](/quest/m0/benchmark/guardrails.md)). XL
    keeps its step down with L. Compare the step up's pairs as the step
    down's were, counting only rounds after the retarget merged.
- Writer A/B, PRs per arm, first-round findings over the PRs counted in
  parentheses, cost as the median merged PR with any attributed spend (5
  to 27% of each arm's merged PRs had none):

  | Size | Arm | PRs | First-round findings per PR | Rounds | Handed back | Caused by | Median cost |
  |---|---|---|---|---|---|---|---|
  | XS | A, Sonnet high | 26 | 0.05 (22) | 1.26 | 5 | 0 | $0.22 |
  | XS | B, Opus medium | 19 | 0.18 (17) | 1.65 | 2 | 0 | $0.41 |
  | S | A, Opus medium | 67 | 0.28 (54) | 2.25 | 7 | 3 | $0.53 |
  | S | B, Sonnet high | 59 | 0.38 (52) | 2.42 | 4 | 5 | $0.59 |
  | M | A, Opus medium | 65 | 0.77 (57) | 4.04 | 19 | 5 | $1.23 |
  | M | B, Opus high | 51 | 0.54 (46) | 2.76 | 15 | 4 | $4.10 |
  | XL | A, Opus xhigh | 1 | 3 | 4 | 1 | 0 | $2.85 |
  | XL | B, Fable medium | 2 | 2.5 | 6 | 2 | 1 | $20.66 |

  Detecting 0.25 first-round findings per PR needs 26 PRs per arm at XS,
  115 at S, and 292 at M. At the week's rate XS reaches it about 11-26, S
  about 12-01, and M about 2027-01-03, so the 12-01 readout decides XS and
  S and asks the maintainer whether M runs to January.

Baseline from the 2026-11-11 audit, at API list price:

- Host spend 2026-11-01 to 11-11: about $18.6k. Claude $15.7k, Codex
  $2.6k, Grok $0.2k (stopped 11-05), DeepSeek $14. `quest usage` traced
  only $5.2k (28%) to a PR. Sub-agent transcripts it does not read held
  about $1.5k of quest-branch work. Coordinator main sessions cost about
  $1.5k.
- Median writer cost per merged PR: XS $0.7, S $1.6, M $5.2, L $10.6, XL
  $21.7. Review cost per PR: Sol low $0.10, medium $0.20, high $0.67,
  xhigh $0.69. Local reviews were under 3% of spend.
- Sol findings per reviewed branch: low 0.03 (XS, 68 branches); S medium
  0.30 (176) against S high 0.67 (12); M medium 0.41 (177) against M high
  0.67 (3) and M xhigh 1.44 (9); L high 1.43 (35). Read from each branch's
  saved review rounds under the clones' `.git/quest/review/`, by the size
  and effort of its last round. About 90% of findings were fixed and 3-5%
  refuted.
- Escapes: 42 of 1,983 merged PRs (2.1%) were later named under
  `## Caused by`. That is a floor, since the convention began 11-04 to
  11-08. Of 30 sampled escapes, 6 were catchable from the diff, 17 maybe,
  and 7 needed runtime (nightly or platform lanes); 5 were races. Review
  scores are saturated: about 90% of PRs scored 9 or 10.
- Online reviewers:

  | Reviewer | Coverage of merged PRs | Findings accepted |
  |---|---|---|
  | CodeRabbit, moq | 44% (hourly cap) | 74%, 17% declined |
  | CodeRabbit, moq.pro | 0% (summaries only on the free plan) | none |
  | Pullfrog DeepSeek, moq | 88% | 89% |
  | Pullfrog GLM, moq.pro and quest | under 30% | mostly nits; removed |
  | The Dot (OpenAI, posts as the maintainer), moq | 95% | not measured |

  The Dot's model is undisclosed. About 11% of the PRs it reviews get
  `[P1]`-`[P3]` findings in its review body. About 40% of those PRs merged
  while its latest review still listed findings.

  The table predates Pullfrog's move to Claude (2026-11-12) and its review
  replacing the DeepSeek one in `quest review`
  (the token waste epic, 2026-11-13).

## Scheduled

- 2026-12-01 - the XS and S writer arms reach 26 and 115 first-round PRs each

## Related

- [Model check](/quest/m1/model-check.md) - retunes the tables each
  milestone from these tallies
- [Mistake audit](/quest/m0/mistake-audit.md) - files runtime escapes in
  their owning repositories
