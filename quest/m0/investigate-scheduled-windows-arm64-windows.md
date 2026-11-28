# [M] Investigate scheduled Windows / arm64 / windows and scheduled Windows / x64 / windows

## Goal

Kixel Quest measured what the Plan lists and filed it here on its own. For each finding:

1. Diagnose its cause, starting from the culprit's diff and sessions where it has them.
2. Have a second session, one that did not write the diagnosis, try to refute it, and diagnose again when it does.
3. Fix it, accept it with the reason recorded in this Plan, or improve on it further. A fix carries the measurement that shows it.

Then look past the finding: make the related improvements the diagnosis turns up where they fit here, and add the rest as follow-up quests.

## Plan

Each finding keeps the comment Kixel Quest finds it by, so a later run that sees it again adds its sighting here instead of filing it anew.

### `scheduled Windows / arm64 / windows`: failure

<!-- kixel.quest finding {"series":"scheduled Windows / arm64 / windows","culprit":null} -->

- Series: [`scheduled Windows / arm64 / windows`](https://github.com/kixel-ai/quest/actions/runs/46168102110/attempts/1).
- 2026-11-28: 1 against a baseline of 0, +1, at [`33cbcb3`](https://github.com/kixel-ai/quest/commit/33cbcb30adeaf2c2dec47fe51a9254637a3c2e36). Failed in run 46168102110 attempt 1; no run in the window before passed it.

### `scheduled Windows / x64 / windows`: failure

<!-- kixel.quest finding {"series":"scheduled Windows / x64 / windows","culprit":null} -->

- Series: [`scheduled Windows / x64 / windows`](https://github.com/kixel-ai/quest/actions/runs/46168102110/attempts/1).
- 2026-11-28: 1 against a baseline of 0, +1, at [`33cbcb3`](https://github.com/kixel-ai/quest/commit/33cbcb30adeaf2c2dec47fe51a9254637a3c2e36). Failed in run 46168102110 attempt 1; no run in the window before passed it.
