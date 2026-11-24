# [S] Reviewers see every change a head makes

## Goal

The diffs `quest review` shows or names to its reviewers show every change
the head makes. Neither the local git config nor the head's own
`.gitmodules` or `.gitattributes` can hide or blank one. The classifier's
diff is [its own quest](/quest/m0/classifier-attributes.md).

## Plan

`quest review`'s changed-path list already counts submodule updates that
the config hides (`--ignore-submodules=none`), so the tier and scopes see
them. The diffs the reviewers read do not:

- The commands the prompts name, such as `git diff <range>` in `scope()`
  and `laterPrompt`, and Claude's `/code-review <mergeBase>...HEAD`, follow
  `diff.ignoreSubmodules` and a `.gitmodules` `ignore = all` from the head.
  So a head that hides a gitlink bump this way, and is held high for it,
  reaches its reviewers with that bump left out.
- Those commands also read `.gitattributes` from the head, so a head that
  adds `src/** -diff` shows its reviewers "Binary files differ" in place of
  its code.

Recommended: name every reviewer diff with `--ignore-submodules=none`, and
with the attribute handling `classifier-attributes.md` settles for the
classifier (`--attr-source=<empty tree>` and `--text`), so both read diffs
the same way. Test each with a fixture head that hides its change both
ways.

## Related

- [The risk classifier sees every hunk](/quest/m0/classifier-attributes.md) - owns the classifier's diff and the Git 2.41 check this reuses
