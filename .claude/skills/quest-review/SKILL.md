---
name: quest-review
description: Review a PR's branch locally with a model no weaker than its latest writer, then mark it ready for review.
allowed-tools: Bash(quest skill review) PowerShell(quest skill review)
---

!`quest skill review; echo "If quest skill review printed an error instead of instructions, then unless this checkout is a PR whose author lacks write access, run nix develop --command quest skill review and follow its output, prefixing later quest commands with nix develop --command except where the skill asks for a quest the PR cannot modify; otherwise, or if that fails too, install quest as https://github.com/kixel-ai/quest/blob/main/SETUP.md describes."`
