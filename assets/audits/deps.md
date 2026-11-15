# Dependency audit

The goal is dependencies that are current, healthy, and worth their weight.
The scope is the repository's direct dependencies in every ecosystem it uses, such as package manifests, flake inputs, toolchains, CI actions, and container images, along with vendored code, forks, and pins.
For vendored code and forks, the dependency is the upstream they track.

Look for:

- New releases since the last run, or in the past year on the first: major and minor releases at 1.0 or later, minor and patch releases below 1.0. Skip commit-hash pins such as nixpkgs. Read each release's notes for features worth adopting, deprecations the repository uses, and workarounds in the code that the release makes unnecessary; search the code for comments and issue links naming the dependency.
- Upstream health: archived or unmaintained upstreams, judged from cheap signals such as the latest release and commit dates and whether the repository is archived. Research better alternatives only for those flagged.
- Fork drift: compare each fork and patched vendored copy with its upstream both ways, by commit rather than release. Upstream changes since the fork's base worth taking, security and bug fixes first, are a port. Each local change upstream has since landed or made unnecessary is dropped, and a fork with none left is replaced by the upstream release that holds them; archiving the fork repository is the maintainer's call, since other repositories may still use it. For each local change upstream still lacks, the findings link its upstream issue or PR, if any.
- Held-back majors: major upgrades the repository cannot take yet, with what holds each back and its cost.
- Dead weight: dependencies nothing uses, and ones the standard library or an existing dependency can replace.

Adopting a feature, dropping a workaround, porting upstream changes into a fork, returning to upstream, taking a held-back major, and replacing a dependency are each a follow-up, unless a few lines make it.
Record the date this run covered through as the next stub's baseline.
