# [M] Investigate friction/iterates/iterate:idle (count), host/gate-cpu/command:just test (h), and 1 more

## Goal

Kixel Quest measured what the Plan lists and filed it here on its own. For each finding:

1. Diagnose its cause, starting from the culprit's diff and sessions where it has them.
2. Have a second session, one that did not write the diagnosis, try to refute it, and diagnose again when it does.
3. Fix it, accept it with the reason recorded in this Plan, or improve on it further. A fix carries the measurement that shows it.

Then look past the finding: make the related improvements the diagnosis turns up where they fit here, and add the rest as follow-up quests.

## Plan

Each finding keeps the comment Kixel Quest finds it by, so a later run that sees it again adds its sighting here instead of filing it anew.

### `friction/iterates/iterate:idle (count)`: bottleneck

<!-- kixel.quest finding {"series":"friction/iterates/iterate:idle (count)","culprit":null} -->

- Series: [`friction/iterates/iterate:idle (count)`](https://kixel.quest/factory#bottlenecks-1377544394).
- 2026-11-26: 0 against a baseline of 0, +0. The largest share of friction, 20.59% of its measure over the 30 days to 2026-11-26; too few measurements for a trend.

### `host/gate-cpu/command:just test (h)`: bottleneck

<!-- kixel.quest finding {"series":"host/gate\u002dcpu/command:just test (h)","culprit":null} -->

- Series: [`host/gate-cpu/command:just test (h)`](https://kixel.quest/factory#bottlenecks-1377544394), in h.
- 2026-11-26: 0.05301 h against a baseline of 0.05301 h, +0 h (+0%). The largest share of host time, 49.02% of its measure over the 30 days to 2026-11-26; too few measurements for a trend.

### `ship/pickup (h)`: bottleneck

<!-- kixel.quest finding {"series":"ship/pickup (h)","culprit":null} -->

- Series: [`ship/pickup (h)`](https://kixel.quest/factory#bottlenecks-1377544394), in h.
- 2026-11-26: 2.062 h against a baseline of 2.062 h, +0 h (+0%). The largest share of time to ship, 31.48% of its phases over the 30 days to 2026-11-26; too few measurements for a trend.
