import { expect, test } from "vitest";

import { ALWAYS_HIGH, matches, parseRiskFile, patternError, recordedRisk, riskier } from "../src/core";

test("a pattern is a path from the root whose * stays in a segment and whose ** spans segments", () => {
	const cases: [string, string, boolean][] = [
		// A plain path matches itself and everything under it, with or without a trailing slash.
		["src/billing", "src/billing", true],
		["src/billing", "src/billing/charge.ts", true],
		["src/billing/", "src/billing/charge.ts", true],
		["src/billing", "src/billing-old/charge.ts", false],
		["src/billing", "lib/src/billing/charge.ts", false],
		// `*` and `?` stay within one segment, from the root.
		["*.md", "RISK.md", true],
		["*.md", "docs/guide.md", false],
		["src/*/wire.ts", "src/moq/wire.ts", true],
		["src/*/wire.ts", "src/moq/lite/wire.ts", false],
		["v?.proto", "v2.proto", true],
		["v?.proto", "v10.proto", false],
		// `**` is any number of segments, none included.
		["**/*.proto", "wire.proto", true],
		["**/*.proto", "a/b/wire.proto", true],
		["src/**/wire.ts", "src/wire.ts", true],
		["src/**/wire.ts", "src/a/b/wire.ts", true],
		["src/**", "src", true],
		["src/**", "src/a/b", true],
		["**", "anything/at/all", true],
		// Adjacent `**` segments match what one does.
		["**/**/wire.proto", "wire.proto", true],
		["**/**/wire.proto", "a/b/wire.proto", true],
		["src/**/**/wire.ts", "src/wire.ts", true],
		["src/**/**/wire.ts", "src/a/wire.ts", true],
		["src/**/**", "src/a/b", true],
		["src/**/**", "lib/a", false],
		// A line break in a path is just another character, so it escapes no `**` or directory rule.
		["src/**", "src/a\nb/c.ts", true],
		["**", "a\nb", true],
		["src/**/wire.ts", "src/a\nb/wire.ts", true],
		["src/billing", "src/billing/a\nb.ts", true],
		["src/billing/", "src/billing/\n", true],
		["*.md", "a\nb.md", true],
		// Regular expression characters are literal.
		["a.b+c", "a.b+c", true],
		["a.b+c", "aXbbc", false],
	];
	for (const [pattern, path, expected] of cases) {
		expect(patternError(pattern), pattern).toBeNull();
		expect(matches(pattern, path), `${pattern} ${path}`).toBe(expected);
	}
	for (const [pattern, why] of [
		["", "empty"],
		["/etc", "starts with /"],
		["src//x", "empty, `.`, or `..` segment"],
		["../x", "`..` segment"],
		["src/**x", "whole segment"],
		["{a,b}", "do not support"],
		["src/[ab]", "do not support"],
		["has space", "do not support"],
	] as const)
		expect(patternError(pattern), pattern).toContain(why);
});

test("the built-in high paths hold the risk file and every workflow", () => {
	const held = (path: string) => ALWAYS_HIGH.some((rule) => matches(rule.pattern, path));
	expect(held("RISK.md")).toBe(true);
	expect(held(".github/workflows/ci.yml")).toBe(true);
	expect(held(".github/actions/setup/action.yml")).toBe(true);
	expect(held(".github/dependabot.yml")).toBe(false);
	expect(held("docs/RISK.md")).toBe(false);
});

test("a risk file's ## High list is each backticked pattern and its reason; the rest is prose", () => {
	const text = [
		"# Risk",
		"",
		"Customers run the relay; the CLI is for contributors.",
		"",
		"## High",
		"",
		"The paths below always need a person.",
		"",
		"- `src/billing/` - charges customers,",
		"  and refunds are manual",
		"* `**/*.proto` - peers on older releases read the wire format",
		"",
		"## Customer-facing",
		"",
		"- `not/a/rule` - prose under another heading is never a rule",
	].join("\r\n");
	expect(parseRiskFile(text)).toEqual({
		high: [
			{ pattern: "src/billing/", reason: "charges customers, and refunds are manual" },
			{ pattern: "**/*.proto", reason: "peers on older releases read the wire format" },
		],
		classes: [],
		suite: null,
		problems: [],
	});
	expect(parseRiskFile("# Risk\n\nNothing is always high here.\n")).toEqual({
		high: [],
		classes: [],
		suite: null,
		problems: [],
	});

	const broken = parseRiskFile(
		[
			"## High",
			"",
			"- `/etc` - absolute",
			"- `src/` without a dash",
			"- src/ - not backticked",
			"- `deploy/` - nested",
			"  - `deploy/prod` - inside",
			"",
			"## High",
		].join("\n"),
	);
	expect(broken.high).toEqual([]);
	expect(broken.problems).toEqual([
		"RISK.md has 2 ## High sections; merge them into one",
		"RISK.md:3: `/etc` is no pattern: it starts with /, but a pattern is a path from the repository root",
		"RISK.md:4: a `## High` item is a backticked pattern, ` - `, and why its change is high",
		"RISK.md:5: a `## High` item is a backticked pattern, ` - `, and why its change is high",
		"RISK.md:6: a `## High` item is a backticked pattern, ` - `, and why its change is high",
	]);
});

test("the review record's risk reads back, and a record without one names none", () => {
	const record = (lines: string[]) =>
		["Summary.", "", "## Review", "", "Rewritten by `quest review` after each round.", "", ...lines].join("\r\n");
	const head = "a".repeat(40);
	expect(
		recordedRisk(
			record([
				`- Head: ${head}`,
				"- Base: origin/main at bbbbbbbbbbbb",
				"- Risk: high, ``` ``ships`` to peers ```",
				"- Classified: low by Codex, gpt-6.1-sol, low effort, session `thread-9`",
			]),
		),
	).toEqual({
		tier: "high",
		reason: "``ships`` to peers",
		classified: "low",
		by: "model",
		session: "thread-9",
		head,
		class: null,
		overridden: null,
	});
	expect(
		recordedRisk(
			record([
				"- Head: aaaaaaaaaaaa, named in full once no reviewer reports a finding",
				"- Risk: high, `it changes RISK.md, which is always high: it sets the tier of every later change`",
				"- Classified: high by the always-high paths",
			]),
		),
	).toMatchObject({ classified: "high", by: "paths", session: null, head: "aaaaaaaaaaaa" });
	expect(
		recordedRisk(record([`- Head: ${head}`, "- Risk: medium, `no file`", "- Classified: medium by default"])),
	).toMatchObject({ by: "default" });
	expect(recordedRisk(record([`- Head: ${head}`]))).toBeNull();
	expect(recordedRisk("Summary.\n\n## Models\n\n- Size: S\n")).toBeNull();
	// A risk line `quest review` did not write reads as malformed, never as no record.
	const malformed = (lines: string[]) => recordedRisk(record([`- Head: ${head}`, ...lines]));
	expect(malformed(["- Risk: severe, `x`", "- Classified: low by default"])).toEqual({
		malformed: "the ## Review record's risk is malformed: severe, `x`",
	});
	expect(malformed(["- Risk: low, `x`"])).toEqual({
		malformed: "the ## Review record's risk is malformed: low, `x`",
	});
	expect(malformed(["- Risk:dire"])).toEqual({ malformed: "the ## Review record's risk is malformed: dire" });
	expect(malformed(["- Risk:low, `x`", "- Classified: low by default"])).toMatchObject({
		malformed: expect.any(String),
	});
	expect(malformed(["- Classified: low by default"])).toEqual({
		malformed: "the ## Review record's risk is malformed: it has no - Risk: line",
	});
});

test("a risk file's ## Automatic list names each class and its rule, and ## Full suite one command", () => {
	const text = [
		"# Risk",
		"",
		"## Automatic",
		"",
		"Each class below lands without a pick once low.",
		"",
		"- `tests` - only tests and their fixtures",
		"- `internal-docs` - documentation no user reads,",
		"  such as plans",
		"",
		"## Full suite",
		"",
		"Run it for a high change.",
		"",
		"```sh",
		"just gate --all",
		"```",
	].join("\n");
	expect(parseRiskFile(text)).toEqual({
		high: [],
		classes: [
			{ name: "tests", rule: "only tests and their fixtures" },
			{ name: "internal-docs", rule: "documentation no user reads, such as plans" },
		],
		suite: "just gate --all",
		problems: [],
	});

	const broken = parseRiskFile(
		[
			"## Automatic",
			"",
			"- `Tests` - capitalized",
			"- tests - not backticked",
			"- `docs` - one",
			"- `docs` - twice",
			"",
			"## Full suite",
			"",
			"just gate",
		].join("\n"),
	);
	expect(broken.classes).toEqual([
		{ name: "docs", rule: "one" },
		{ name: "docs", rule: "twice" },
	]);
	expect(broken.suite).toBeNull();
	expect(broken.problems).toEqual([
		"RISK.md:3: `Tests` is no class name: use lowercase words joined by hyphens",
		"RISK.md:4: an `## Automatic` item is a backticked class name, ` - `, and the rule over the diff",
		"RISK.md lists the class `docs` twice",
		"RISK.md's ## Full suite must hold one fenced code block with the command",
	]);
	expect(parseRiskFile("## Full suite\n\n```\na\n```\n\n```\nb\n```\n").problems).toEqual([
		"RISK.md's ## Full suite must hold one fenced code block with the command",
	]);
});

test("the review record's class and override read back", () => {
	const record = (lines: string[]) =>
		["## Review", "", `- Head: ${"a".repeat(40)}`, "- Risk: low, `the maintainer says so`", ...lines].join("\n");
	expect(
		recordedRisk(
			record(["- Overridden: from medium by the maintainer", "- Classified: low by default", "- Class: `tests`"]),
		),
	).toMatchObject({ tier: "low", class: "tests", overridden: "medium" });
	const malformed = { malformed: "the ## Review record's class or override is malformed" };
	expect(recordedRisk(record(["- Classified: low by default", "- Class: tests"]))).toEqual(malformed);
	expect(recordedRisk(record(["- Classified: low by default", "- Overridden: by someone"]))).toEqual(malformed);
});

test("tiers order from low to high", () => {
	expect(riskier("high", "medium")).toBe(true);
	expect(riskier("medium", "medium")).toBe(false);
	expect(riskier("low", "medium")).toBe(false);
});
