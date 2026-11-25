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

- The commands the prompts name, such as `git diff <range>` in `scope()`,
  and Claude's `/code-review <mergeBase>...HEAD`, follow
  `diff.ignoreSubmodules` and a `.gitmodules` `ignore = all` from the head.
  So a head that hides a gitlink bump this way, and is held high for it,
  reaches its reviewers with that bump left out.
- Those commands also read `.gitattributes` from the head, so a head that
  adds `src/** -diff` shows its reviewers "Binary files differ" in place of
  its code.
- They also run a `diff.external` helper or a textconv driver from the local
  config or `.git/info/attributes`, which can print an empty or rewritten
  patch.
- `agyTurn` writes Antigravity's diffs itself (`diff-<n>.diff`), since it
  has no shell. Those diffs already pass `--attr-source=<empty tree>`,
  `--no-ext-diff`, and `--no-textconv`, but not `--ignore-submodules=none`,
  so a hidden gitlink bump is left out there too.

Recommended: name every reviewer diff, and generate agy's, with
`--ignore-submodules=none --no-ext-diff --no-textconv`, plus the attribute
handling `classifier-attributes.md` settles for the classifier
(`--attr-source=<empty tree>` and `--text`), so all of them read diffs the
same way. Test each, agy's generated diff included, with a fixture head
that hides its change each way: a gitlink under `diff.ignoreSubmodules=all`,
a `-diff` attribute, and a `diff.external` helper that prints nothing.

## Required

- [The risk classifier sees every hunk](/quest/m0/classifier-attributes.md) - settles the attribute flags and adds the Git 2.41 check these diffs then need
