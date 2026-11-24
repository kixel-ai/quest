# [S] Reviewers see every change a head makes

## Goal

The diffs `quest review` shows or names to its classifier and reviewers
show every change the head makes. Neither the local git config nor the
head's own `.gitmodules` or `.gitattributes` can hide or blank one.

## Plan

`quest review`'s changed-path list already counts submodule updates that
the config hides (`--ignore-submodules=none`), so the tier and scopes see
them. The diffs the models read do not:

- The commands the prompts name, such as `git diff <range>` in `scope()`
  and `laterPrompt`, and Claude's `/code-review <mergeBase>...HEAD`, follow
  `diff.ignoreSubmodules` and a `.gitmodules` `ignore = all` from the head.
  So a head that hides a gitlink bump this way, and is held high for it,
  reaches its reviewers with that bump left out.
- The classifier's diff passes `--no-textconv` and `--no-ext-diff`, but it
  reads attributes from the checkout, which is the head. A head that adds
  `src/** -diff` to `.gitattributes` shows "Binary files differ" in place
  of its code.

Recommended: run every diff the models read with `--ignore-submodules=none`
and with attributes from the base (`git --attr-source=<base> diff`, or
`--text`). Where a prompt names a command for the model to run, name it
with the same flags. Test each with a fixture head that hides its change
both ways.
