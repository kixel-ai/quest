# [XL] Audit agent instructions

## Goal

Run the `instructions` audit: `quest audit instructions` prints what it checks, what each finding becomes, and how to plan its next run.

## Plan

The instructions under `assets/` reach every repository's agents, about 2k sessions a week, so they matter most here.

- Scope: everything under `assets/`, `CONTRIBUTING.md`, and `SETUP.md`, along with the other places rule text lives: `docs/context.md`, `src/cli/rules.ts`, and the instructions code plants or injects that `RISK.md`'s from-code bullet names.
- This audit is the ask `AGENTS.md` wants before editing `CONTRIBUTING.md`, `assets/CONTEXT.md`, `assets/AGENTS.md`, or `assets/skills/`.
- `assets/CONTEXT.md` stays within the 10,000 characters Claude Code shows of a hook's context.
- The model tables in `src/cli/models.ts` belong to the [model check](/quest/m1/model-check.md).
- Check first that the guide's Prompting links still resolve, as all twelve did on 2026-11-24.

## Audit

- instructions

## Required

- [m0](/quest/m0/README.md) - the audit runs after it
