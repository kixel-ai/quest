import { expect, test } from "vitest";

import {
	type Doc,
	check,
	handBackWaits,
	handedBack,
	onMaintainer,
	parse,
	parseWait,
	unblocked,
	waiting,
	withoutHandBack,
} from "../src/core";
import { TODAY } from "./fixture";

/** A tree of two milestones and their quests. */
function tree(m0: Record<string, string>, m1: Record<string, string> = {}): Doc[] {
	const milestone = (name: string, quests: Record<string, string>) => [
		parse(`quest/${name}/README.md`, `# ${name}\n\n## Goal\n\nWork.\n`),
		...Object.entries(quests).map(([q, body]) =>
			parse(`quest/${name}/${q}`, `# [S] ${q}\n\n## Goal\n\nWork.\n${body}`),
		),
	];
	return [parse("quest/README.md", "# Quests\n\n## Goal\n\nAll.\n"), ...milestone("m0", m0), ...milestone("m1", m1)];
}

test("a wait opens with its party", () => {
	const doc = parse(
		"quest/m0/a.md",
		"# [S] A\n\n## Goal\n\nA.\n\n## Waiting\n\n- Maintainer: open the account,\n  then check `GET /server`.\n- moq-dev/moq: a release carries the fix.\n- No party is named here\n- This sentence runs on far too long before it reaches a colon: so it is prose\n",
	);
	const [account, release, none, prose] = doc.entries.map(parseWait);
	expect(account).toEqual({
		line: 9,
		party: "Maintainer",
		pc: false,
		text: "open the account, then check GET /server.",
	});
	expect(release).toMatchObject({ party: "moq-dev/moq", pc: false, text: "a release carries the fix." });
	expect(none).toBeNull();
	expect(prose).toBeNull();
});

test("Maintainer (PC) is the maintainer's step at their computer, and no other qualifier parses", () => {
	const doc = parse(
		"quest/m0/a.md",
		"# [S] A\n\n## Waiting\n\n- Maintainer (PC): unlock the vault.\n- maintainer(pc): plug in the camera.\n" +
			"- Maintainer (local): log in.\n- Maintainers: agree.\n",
	);
	const [vault, camera, local, plural] = doc.entries.map(parseWait);
	expect(vault).toEqual({ line: 5, party: "Maintainer", pc: true, text: "unlock the vault." });
	expect(camera).toMatchObject({ party: "Maintainer", pc: true });
	expect(local).toBeNull();
	expect(plural).toMatchObject({ party: "Maintainers", pc: false });
	expect(onMaintainer(vault!)).toBe(true);
	expect(onMaintainer(plural!)).toBe(false);
	expect(handBackWaits("## Waiting\n\n- Maintainer (PC): unlock.\n- Maintainer (home): log in.\n")).toEqual([
		{ line: 3, party: "Maintainer", pc: true, text: "unlock." },
		{ line: 4, party: "Maintainer", pc: false, text: "Maintainer (home): log in." },
	]);
});

test("waiting drops PC steps on request, and ranks by the items it keeps", () => {
	const docs = tree({
		"a.md": "\n## Waiting\n\n- Maintainer (PC): unlock the vault.\n- moq-dev/moq: a release.\n",
		"b.md": "\n## Waiting\n\n- Maintainer: pick a name.\n- Maintainer (PC): log in.\n",
		"c.md": "\n## Waiting\n\n- moq-dev/moq: another release.\n",
	});
	const shown = (options: Parameters<typeof waiting>[2]) =>
		waiting(docs, TODAY, options).map((quest) => [quest.path, quest.waits.map((wait) => wait.text)]);
	expect(shown({})).toEqual([
		["quest/m0/a.md", ["unlock the vault.", "a release."]],
		["quest/m0/b.md", ["pick a name.", "log in."]],
		["quest/m0/c.md", ["another release."]],
	]);
	// Without its PC step, a.md waits only on an outside party, so it ranks after b.md.
	expect(shown({ pc: false })).toEqual([
		["quest/m0/b.md", ["pick a name."]],
		["quest/m0/a.md", ["a release."]],
		["quest/m0/c.md", ["another release."]],
	]);
	expect(shown({ maintainer: true, pc: false })).toEqual([["quest/m0/b.md", ["pick a name."]]]);
	expect(shown({ maintainer: true })).toEqual([
		["quest/m0/a.md", ["unlock the vault."]],
		["quest/m0/b.md", ["pick a name.", "log in."]],
	]);
});

test("check rejects an unknown host and an empty hosts section", () => {
	const docs = tree({ "a.md": "\n## Hosts\n\n- linux\n- macos - the camera.\n- freebsd\n", "b.md": "\n## Hosts\n" });
	expect(check(docs, () => true).map((f) => `${f.path}:${f.line}: ${f.message}`)).toEqual([
		"quest/m0/a.md:11: '## Hosts' item must open with one of linux, macos, windows, optionally followed by ' - why'",
		"quest/m0/b.md:7: '## Hosts' is empty; remove the heading with its last entry",
	]);
});

test("check rejects a wait without a party and an empty section", () => {
	const docs = tree({
		"a.md": "\n## Waiting\n\n- pick a name\n- Maintainer (local): log in.\n",
		"b.md": "\n## Waiting\n",
	});
	expect(check(docs, () => true).map((f) => `${f.path}:${f.line}: ${f.message}`)).toEqual([
		"quest/m0/a.md:9: '## Waiting' item must open with who acts, as 'Maintainer: ...', 'Maintainer (PC): ...' for a step only at their computer, or '<party>: ...'",
		"quest/m0/a.md:10: '## Waiting' item must open with who acts, as 'Maintainer: ...', 'Maintainer (PC): ...' for a step only at their computer, or '<party>: ...'",
		"quest/m0/b.md:7: '## Waiting' is empty; remove the heading with its last entry",
	]);
});

test("lists the maintainer's waits first, then by milestone and impact", () => {
	const docs = tree(
		{
			"upstream.md": "\n## Waiting\n\n- moq-dev/moq: a release.\n",
			"plain.md": "",
			"later.md": "\n## Required\n\n- [Upstream](/quest/m0/upstream.md)\n",
		},
		{ "decide.md": "\n## Waiting\n\n- Maintainer: pick a provider.\n- Hetzner: verify the account.\n" },
	);
	expect(waiting(docs, TODAY)).toEqual([
		{
			path: "quest/m1/decide.md",
			pr: null,
			dependents: 0,
			ready: true,
			waits: [
				{ line: 9, party: "Maintainer", pc: false, text: "pick a provider." },
				{ line: 10, party: "Hetzner", pc: false, text: "verify the account." },
			],
		},
		{
			path: "quest/m0/upstream.md",
			pr: null,
			dependents: 1,
			ready: true,
			waits: [{ line: 9, party: "moq-dev/moq", pc: false, text: "a release." }],
		},
	]);
});

test("ties keep path order, as unblocked does", () => {
	const docs = tree({
		"z.md": "\n## Waiting\n\n- Maintainer: pick one.\n",
		"a.md": "\n## Waiting\n\n- Maintainer: pick another.\n",
	});
	expect(unblocked(docs, TODAY).map((quest) => quest.path)).toEqual(["quest/m0/a.md", "quest/m0/z.md"]);
	expect(waiting(docs, TODAY).map((quest) => quest.path)).toEqual(["quest/m0/a.md", "quest/m0/z.md"]);
});

test("a draft hands back with Waiting, not the retired Decisions needed heading", () => {
	expect(handedBack("Work.\n\n## Waiting\n\n- Maintainer: pick one.\n")).toBe(true);
	expect(handedBack("Work.\r\n\r\n## Decisions needed\r\n\r\n1. Pick one.\r\n")).toBe(false);
	expect(handedBack("Work.\n\n### Waiting\n\nNot a hand-back.\n")).toBe(false);
	expect(handedBack("Waiting on CI.\n")).toBe(false);
});

test("a hand-back heading inside a fence, list, or quote is an example, not a hand-back", () => {
	expect(handedBack("Docs.\n\n````markdown\n## Waiting\n\n- Maintainer: pick.\n````\n")).toBe(false);
	expect(handedBack("Docs.\n\n~~~\n## Waiting\n~~~\n")).toBe(false);
	expect(handedBack("- ## Waiting\n\n> ## Waiting\n")).toBe(false);
});

test("withoutHandBack keeps fenced examples and drops fenced text inside a hand-back", () => {
	const example = "Docs.\n\n```markdown\n## Waiting\n\n- Maintainer: pick.\n```\n\n## Validation\n\nPasses.";
	expect(withoutHandBack(example)).toBe(example);
	expect(withoutHandBack("Work.\n\n## Waiting\n\n```\n## Not a heading\n```\n\n## Validation\n\nPasses.")).toBe(
		"Work.\n\n## Validation\n\nPasses.",
	);
});

test("a draft's hand-back items are the maintainer's unless a Waiting item names its party, after any task checkbox", () => {
	expect(
		handBackWaits(
			"Work.\n\n## Waiting\n\n- Codex: out of quota until 15:00 UTC.\n- pick a name,\n  either one.\n" +
				"- [ ] Maintainer: approve the account.\n* [x] moq-dev/moq: a release.\n\n" +
				"## Validation\n\n- Passes.\n\n## Waiting\n\n1. Pick foo or bar.\n",
		),
	).toEqual([
		{ line: 5, party: "Codex", pc: false, text: "out of quota until 15:00 UTC." },
		{ line: 6, party: "Maintainer", pc: false, text: "pick a name, either one." },
		{ line: 8, party: "Maintainer", pc: false, text: "approve the account." },
		{ line: 9, party: "moq-dev/moq", pc: false, text: "a release." },
		{ line: 17, party: "Maintainer", pc: false, text: "Pick foo or bar." },
	]);
});

test("a draft's hand-back item keeps nested headings and the body's reference definitions, and drops raw HTML", () => {
	expect(
		handBackWaits(
			"[m]: https://example.com\n\n## Waiting\n\n- Maintainer: choose a provider.\n\n  ## Options\n\n  Hetzner or OVH.\n" +
				"- [Maintainer][m]: approve the **account**.\n- <strong>Codex</strong>: out of <!-- c -->quota.\n" +
				'- <span title="a > b">Maintainer</span>: approve.\n',
		),
	).toEqual([
		{ line: 5, party: "Maintainer", pc: false, text: "choose a provider. Options Hetzner or OVH." },
		{ line: 10, party: "Maintainer", pc: false, text: "approve the account." },
		{ line: 11, party: "Codex", pc: false, text: "out of quota." },
		{ line: 12, party: "Maintainer", pc: false, text: "approve." },
	]);
});

test("a draft's hand-back renders strikethrough and tables as GitHub does", () => {
	expect(handBackWaits("## Waiting\n\n- ~~Maintainer~~: pick.\n- Codex: ~~soon~~ later.\n")).toEqual([
		{ line: 3, party: "Maintainer", pc: false, text: "pick." },
		{ line: 4, party: "Codex", pc: false, text: "soon later." },
	]);
	expect(handBackWaits("## Waiting\n\n| when | check |\n| --- | --- |\n| 15:00 | quota |\n")).toEqual([
		{ line: 1, party: "Maintainer", pc: false, text: "when check 15:00 quota" },
	]);
});

test("a draft's hand-back without items is one maintainer item holding its prose", () => {
	expect(handBackWaits("Work.\r\n\r\nWaiting\r\n-------\r\n\r\nPick a name\r\nfor it.\r\n")).toEqual([
		{ line: 3, party: "Maintainer", pc: false, text: "Pick a name for it." },
	]);
	expect(handBackWaits("## Waiting\n\n<details>\n<summary>Why</summary>\nPick one.\n</details>\n")).toEqual([
		{ line: 1, party: "Maintainer", pc: false, text: "the draft hands back without saying what it waits on" },
	]);
	expect(handBackWaits("## Waiting\n\n<details>\n<summary>Why</summary>\n</details>\n\nThen merge.\n")).toEqual([
		{ line: 1, party: "Maintainer", pc: false, text: "Then merge." },
	]);
	expect(handBackWaits("## Waiting\n")).toEqual([
		{ line: 1, party: "Maintainer", pc: false, text: "the draft hands back without saying what it waits on" },
	]);
	expect(handBackWaits("Work.\n\n```\n## Waiting\n\n- Maintainer: pick.\n```\n")).toEqual([]);
});

test("drafts rank as the quest they carry, after quests on a tie, and last when they carry none", () => {
	const docs = tree(
		{ "a.md": "\n## Waiting\n\n- Maintainer: pick one.\n", "b.md": "" },
		{ "c.md": "\n## Required\n\n- [B](/quest/m0/b.md)\n" },
	);
	const draft = (url: string, branch: string, body: string) => ({ url, branch, body });
	const found = waiting(docs, TODAY, {
		drafts: [
			draft("https://example.com/pull/1", "quest-plan/x", "## Waiting\n\n- Maintainer: plan it.\n"),
			draft("https://example.com/pull/2", "quest/m0/b", "## Waiting\n\n- Maintainer: pick b.\n"),
			draft("https://example.com/pull/3", "quest/m0/a", "## Waiting\n\n- moq-dev/moq: a release.\n"),
			draft("https://example.com/pull/4", "quest/m0/a", "Ready soon.\n"),
			draft("https://example.com/pull/5", "quest/m9/gone", "## Waiting\n\n- Keep it?\n"),
		],
	});
	expect(found.map((quest) => [quest.pr ?? quest.path, quest.path, quest.dependents, quest.ready])).toEqual([
		["https://example.com/pull/2", "quest/m0/b.md", 1, true],
		["quest/m0/a.md", "quest/m0/a.md", 0, true],
		["https://example.com/pull/1", null, 0, true],
		["https://example.com/pull/5", null, 0, true],
		["https://example.com/pull/3", "quest/m0/a.md", 0, true],
	]);
});

test("waiting omits parked work's items but keeps a draft handed back for it", () => {
	const docs = (parkedReadme: boolean) => {
		const found = tree(
			{
				"parked.md": "\n## Waiting\n\n- Maintainer: pick one.\n\n## Parked\n\n- until spring\n",
				"live.md": "\n## Waiting\n\n- Maintainer: pick another.\n",
			},
			{ "later.md": "\n## Waiting\n\n- moq-dev/moq: a release.\n" },
		);
		return parkedReadme
			? found.map((doc) =>
					doc.path === "quest/m1/README.md"
						? parse(doc.path, "# m1\n\n## Goal\n\nWork.\n\n## Parked\n\n- until spring\n")
						: doc,
				)
			: found;
	};
	const draft = {
		url: "https://example.com/pull/1",
		branch: "quest/m0/parked",
		body: "## Waiting\n\n- Maintainer: plan it.\n",
	};
	for (const [milestone, listed] of [
		[false, ["quest/m0/live.md", "https://example.com/pull/1", "quest/m1/later.md"]],
		[true, ["quest/m0/live.md", "https://example.com/pull/1"]],
	] as const) {
		const found = waiting(docs(milestone), TODAY, { drafts: [draft] });
		expect(found.map((quest) => quest.pr ?? quest.path)).toEqual(listed);
		expect(found.find((quest) => quest.pr !== null)?.ready).toBe(false);
	}
	// Unparking is deleting the section: the quest's own item is listed again.
	const unparked = tree({ "parked.md": "\n## Waiting\n\n- Maintainer: pick one.\n" });
	expect(waiting(unparked, TODAY).map((quest) => quest.path)).toEqual(["quest/m0/parked.md"]);
});
