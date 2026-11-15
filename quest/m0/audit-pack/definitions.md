# [M] Add the code, cost, docs, and tests audits

## Goal

The pack ships `code`, `cost`, `docs`, and `tests` definitions, each
repository-neutral and merged from the strongest parts of moq's and
moq.pro's audits of the same name, and this repository's tree carries their
stubs.

## Plan

Decided 2026-11-15 (user, the [epic's](/quest/m0/audit-pack/README.md)
interview): one definition per audit, no performance audit.

Sources, read at their current `main`:

- `code`: moq's `quest/m3/audit-code.md` and moq.pro's
  `quest/m1/audit-code.md`, the latter's dependency dimension excluded,
  since `deps` owns it.
- `cost`: moq's `quest/m3/audit-cost.md`, its dependency section excluded,
  and the gate-cost half of moq.pro's `quest/m1/audit-perf.md`.
- `docs`: moq's `quest/m3/audit-docs.md` and the docs half of moq.pro's
  `quest/m1/audit-trust.md`.
- `tests`: moq's `quest/m3/audit-test-coverage.md`.

Keep each definition about what to look for and what a finding becomes;
leave out the sources' baselines and repository names, which stay in each
repository's stub. moq.pro is private: carry over its method, not its
findings.
