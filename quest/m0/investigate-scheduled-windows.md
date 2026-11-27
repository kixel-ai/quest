# [M] Investigate scheduled Windows

## Goal

Kixel Quest measured what the Plan lists and filed it here on its own. For each finding:

1. Diagnose its cause, starting from the culprit's diff and sessions where it has them.
2. Have a second session, one that did not write the diagnosis, try to refute it, and diagnose again when it does.
3. Fix it, accept it with the reason recorded in this Plan, or improve on it further. A fix carries the measurement that shows it.

Then look past the finding: make the related improvements the diagnosis turns up where they fit here, and add the rest as follow-up quests.

## Plan

Each finding keeps the comment Kixel Quest finds it by, so a later run that sees it again adds its sighting here instead of filing it anew.

### `scheduled Windows`: failure

<!-- kixel.quest finding {"series":"scheduled Windows","culprit":null} -->

- Series: [`scheduled Windows`](https://github.com/kixel-ai/quest/actions/runs/46048386832/attempts/1), in jobs.
- 2026-11-27: 2 jobs against a baseline of 0 jobs, +2 jobs, at [`b930f58`](https://github.com/kixel-ai/quest/commit/b930f585006eacde2483784551877e9dc80427ec). Run 46048386832 attempt 1 failed, failing native Windows (windows-11-arm), native Windows (windows-2022).
