---
name: quest-iterate
description: Iterate on an open PR to settle its open decisions, fix CI and review findings, and push.
allowed-tools: Bash(quest skill iterate) PowerShell(quest skill iterate)
---

!`quest skill iterate; echo "If quest skill iterate printed an error instead of instructions, then unless this checkout is a PR whose author lacks write access, run nix develop --command quest skill iterate and follow its output, prefixing later quest commands with nix develop --command except where the skill asks for a quest the PR cannot modify; otherwise, or if that fails too, install quest as https://github.com/kixel-ai/quest/blob/main/SETUP.md describes."`
