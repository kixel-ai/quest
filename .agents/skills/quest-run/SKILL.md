---
name: quest-run
description: Run a project's quest work from one session, starting ready quests and taking open PRs to merge in a loop until only the user's decisions remain, then planning the follow-ups no quest owns yet.
---

Run `quest skill run` and follow its output.
If `quest` is not on `PATH`, run `nix develop --command quest skill run` instead, and prefix later `quest` commands with `nix develop --command` except where the skill asks for a `quest` the PR cannot modify; if that fails too, follow https://github.com/kixel-ai/quest/blob/main/SETUP.md first.
