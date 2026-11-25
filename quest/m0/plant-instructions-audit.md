# [M] Plant the instructions audit

## Goal

This repository runs the shipped `instructions` audit from its own stub, and `quest check` tells every repository with a quest tree when a shipped audit has no stub, so a repository that upgrades `quest` learns to plant `instructions` instead of losing the `docs` audit's coverage of its instruction files silently.

## Plan

Recommended by the agent that shipped the audit in [kixel-ai/quest#864](https://github.com/kixel-ai/quest/pull/864), where the stub could not land: the pinned and installed `quest` reject an `## Audit` name they do not ship, as [kixel-ai/quest#755](https://github.com/kixel-ai/quest/pull/755) and [kixel-ai/quest#775](https://github.com/kixel-ai/quest/pull/775) split the first pack.

- Advance `quest-pinned` in `flake.lock` past #864, then plant the stub with `quest init`, which puts it in m1 requiring m0.
- Give the stub this Plan:
  - The instructions under `assets/` reach every repository's agents, about 2k sessions a week, so they matter most here.
  - Beyond the files agents load here, the scope includes what this repository ships to others' agents: everything under `assets/`, `SETUP.md`, `docs/context.md`, `src/cli/rules.ts`, and the instructions code plants or injects that `RISK.md`'s from-code bullet names.
  - This audit is the ask `AGENTS.md` wants before editing `CONTRIBUTING.md`, `assets/CONTEXT.md`, `assets/AGENTS.md`, or `assets/skills/`.
  - `assets/CONTEXT.md` stays within the 10,000 characters Claude Code shows of a hook's context.
  - The model tables in `src/cli/models.ts` belong to the [model check](/quest/m1/model-check.md).
- Give `quest/m1/audit-docs.md` the matching exclusion: `SETUP.md` and `docs/context.md` belong to the `instructions` audit.
- Have `stubFindings` in `src/cli/setup.ts` also report each shipped audit `planAudits` would plant, so `quest check` and the SessionStart hook ask for the pinned `quest init`, and word the hook's line for audits as well as skills. It lands with the stub, since this repository's own check fails without it.

## Related

- [Model check](/quest/m1/model-check.md) - bumps model ids; the audit reads the guidance of the models it pins
