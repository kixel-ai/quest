---
name: quest-afk
description: Keep this session's work going while the user is away, taking your recommendations and deferring merge picks until they return. Use when the user says afk, afk merge, or afk soon.
---

Run `quest skill afk` and follow its output.
If `quest` is not on `PATH` and this checkout is not a PR whose author lacks write access, run `nix develop --command quest skill afk` instead, and prefix later `quest` commands with `nix develop --command` except where the skill asks for a `quest` the PR cannot modify; otherwise, or if that fails too, follow https://github.com/kixel-ai/quest/blob/main/SETUP.md first.
