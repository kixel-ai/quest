---
name: quest-start
description: Start work on a quest.
---

Run `quest skill start` and follow its output.
If `quest` is not on `PATH` and this checkout is not a PR whose author lacks write access, run `nix develop --command quest skill start` instead, and prefix later `quest` commands with `nix develop --command` except where the skill asks for a `quest` the PR cannot modify; otherwise, or if that fails too, follow https://github.com/kixel-ai/quest/blob/main/SETUP.md first.
