# [XS] Remove the gate's quick flag

## Goal

`quest gate` has no `--quick` flag and admission has no quick precedence.
Its help, README section, and tests go with it, and Quest's lifecycle
check runs `quest gate env`. The PR title carries `!`, since it removes a
flag.

## Plan

Decided 2026-11-15 (maintainer, `/quest-plan`): ✅ remove it (rejected:
keep it for cheap commands an agent still gates). `quest context` now
keeps quick tools such as formatters out of the gate, the flag's only
stated use, and in the 14 days to 2026-11-15 agents passed it mostly on
heavy commands, letting them start after 60 seconds whatever the load:
`just fix` 41 times, `just check` 18, and `cargo build` 18. No repository
script passes it outside Quest's own lifecycle check. Until this lands,
`quest gate --help` still offers it for formatters.

## Related

- [Gating records](/quest/m0/benchmark/gating.md) - audits what agents
  gate under the same rule
