# Dependency audit

The goal is dependencies that are current, healthy, and worth their weight.
The scope is the repository's direct dependencies in every ecosystem it uses, such as package manifests, flake inputs, toolchains, CI actions, and container images, along with vendored code, forks, and pins.
For vendored code and forks, the dependency is the upstream they track.

Look for:

- New releases since the last run, or in the past year on the first: major and minor releases at 1.0 or later, minor and patch releases below 1.0. Skip commit-hash pins such as nixpkgs. Read each release's notes for features worth adopting, deprecations the repository uses, and workarounds in the code that the release makes unnecessary; search the code for comments and issue links naming the dependency.
- Upstream health: archived or unmaintained upstreams, judged from cheap signals such as the latest release and commit dates and whether the repository is archived. Research better alternatives only for those flagged.
- Held-back majors: major upgrades the repository cannot take yet, with what holds each back and its cost.
- Dead weight: dependencies nothing uses, and ones the standard library or an existing dependency can replace.

Adopting a feature, dropping a workaround, taking a held-back major, and replacing a dependency are each a follow-up, unless a few lines make it.
Record the date this run covered through as the next stub's baseline.
