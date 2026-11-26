---
name: quest-iterate
description: Iterate on an open PR to settle its open decisions, fix CI and review findings, and push.
---

Run `quest skill iterate` and follow its output.
If `quest` is not on `PATH` and this checkout is not a PR whose author lacks write access, run `nix develop --command quest skill iterate` instead, and prefix later `quest` commands with `nix develop --command` except where the skill asks for a `quest` the PR cannot modify; otherwise, or if that fails too, follow https://github.com/kixel-ai/quest/blob/main/SETUP.md first.
