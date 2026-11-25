# [M] Investigate bugs/escaped/found:person (count), conflicts/events (count), and 4 more

## Goal

Kixel Quest measured what the Plan lists and filed it here on its own. For each finding:

1. Diagnose its cause, starting from the culprit's diff and sessions where it has them.
2. Have a second session, one that did not write the diagnosis, try to refute it, and diagnose again when it does.
3. Fix it, accept it with the reason recorded in this Plan, or improve on it further. A fix carries the measurement that shows it.

Then look past the finding: make the related improvements the diagnosis turns up where they fit here, and add the rest as follow-up quests.

## Plan

Each finding keeps the comment Kixel Quest finds it by, so a later run that sees it again adds its sighting here instead of filing it anew.

### `bugs/escaped/found:person (count)`: bottleneck

<!-- kixel.quest finding {"series":"bugs/escaped/found:person (count)","culprit":null} -->

- Series: [`bugs/escaped/found:person (count)`](https://kixel.quest/factory#bottlenecks-1377544394).
- 2026-11-25: 0 against a baseline of 0, +0. Worsening: its last 7 days ran worse than the 30 before, median 0 over 7 days against 0 over 30, one-sided Mann-Whitney U, p = 0.004505, under 0.01 over the 2 series tested; 75% of its measure.

### `conflicts/events (count)`: bottleneck

<!-- kixel.quest finding {"series":"conflicts/events (count)","culprit":null} -->

- Series: [`conflicts/events (count)`](https://kixel.quest/factory#bottlenecks-1377544394).
- 2026-11-25: 0 against a baseline of 0, +0. The largest share of conflicts, 13.79% of PRs over the 30 days to 2026-11-25; too few measurements for a trend.

### `cost/by-model/model:claude-opus-5-5 (tokens)`: bottleneck

<!-- kixel.quest finding {"series":"cost/by\u002dmodel/model:claude\u002dopus\u002d5\u002d5 (tokens)","culprit":null} -->

- Series: [`cost/by-model/model:claude-opus-5-5 (tokens)`](https://kixel.quest/factory#bottlenecks-1377544394), in tokens.
- 2026-11-25: 23655337 tokens against a baseline of 23655337 tokens, +0 tokens (+0%). The largest share of cost, 90.83% of its measure over the 30 days to 2026-11-25; too few measurements for a trend.

### `friction/split/category:waiting (h)`: bottleneck

<!-- kixel.quest finding {"series":"friction/split/category:waiting (h)","culprit":null} -->

- Series: [`friction/split/category:waiting (h)`](https://kixel.quest/factory#bottlenecks-1377544394), in h.
- 2026-11-25: 1.04 h against a baseline of 1.04 h, +0 h (+0%). The largest share of friction, 31.77% of its measure over the 30 days to 2026-11-25; too few measurements for a trend.

### `host/gate-wait/command:bunx (h)`: bottleneck

<!-- kixel.quest finding {"series":"host/gate\u002dwait/command:bunx (h)","culprit":null} -->

- Series: [`host/gate-wait/command:bunx (h)`](https://kixel.quest/factory#bottlenecks-1377544394), in h.
- 2026-11-25: 0.04304 h against a baseline of 0.04304 h, +0 h (+0%). The largest share of host time, 48.86% of its measure over the 30 days to 2026-11-25; too few measurements for a trend.

### `reviews/fixed/reviewer:Claude Code, claude-fable-5-2, xhigh effort, second (count)`: bottleneck

<!-- kixel.quest finding {"series":"reviews/fixed/reviewer:Claude Code, claude\u002dfable\u002d5\u002d2, xhigh effort, second (count)","culprit":null} -->

- Series: [`reviews/fixed/reviewer:Claude Code, claude-fable-5-2, xhigh effort, second (count)`](https://kixel.quest/factory#bottlenecks-1377544394).
- 2026-11-25: 22.5 against a baseline of 22.5, +0 (+0%). The largest share of reviews, 57.14% of its measure over the 30 days to 2026-11-25; too few measurements for a trend.
