---
name: quest-merge
description: Queue a PR to land, running /quest-iterate first when it needs work.
allowed-tools: Bash(quest skill merge) PowerShell(quest skill merge)
---

!`quest skill merge; echo "If quest skill merge printed an error instead of instructions, run nix develop --command quest skill merge and follow its output, prefixing later quest commands with nix develop --command."`
