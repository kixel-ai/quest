---
name: quest-merge
description: Queue a PR to land, running /quest-iterate first when it needs work.
---

Run `quest skill merge` and follow its output.
If `quest` is not on `PATH`, run `nix develop --command quest skill merge` instead, and prefix later `quest` commands with `nix develop --command`; if that fails too, follow https://github.com/kixel-ai/quest/blob/main/SETUP.md first.
