---
name: quest-import
description: Import GitHub issues as quests.
allowed-tools: Bash(quest skill import) PowerShell(quest skill import)
---

!`quest skill import; echo "If quest skill import printed an error instead of instructions, then unless this checkout is a PR whose author lacks write access, run nix develop --command quest skill import and follow its output, prefixing later quest commands with nix develop --command except where the skill asks for a quest the PR cannot modify; otherwise, or if that fails too, install quest as https://github.com/kixel-ai/quest/blob/main/SETUP.md describes."`
