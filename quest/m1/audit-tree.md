# [M] Audit the quest tree

## Goal

Run the `tree` audit: `quest audit tree` prints what it checks, what each finding becomes, and how to plan its next run.

## Plan

Check first: m1's public-release quests, which predate the 2026-11-13
decision in [the root README](/quest/README.md) that drops serving
repositories outside moq-dev's and Kixel's.

## Audit

- tree

## Required

- [m0](/quest/m0/README.md) - the audit runs after it
