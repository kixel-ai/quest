---
name: quest-merge
description: Queue a PR to land, running /quest-iterate first when it needs work.
allowed-tools: Bash(quest skill merge) PowerShell(quest skill merge)
---

!`quest skill merge; echo "If quest skill merge printed an error instead of instructions, then unless this checkout is a PR whose author lacks write access, run nix develop --command quest skill merge and follow its output, prefixing later quest commands with nix develop --command except where the skill asks for a quest the PR cannot modify; otherwise, or if that fails too, install quest as https://github.com/kixel-ai/quest/blob/main/SETUP.md describes."`
