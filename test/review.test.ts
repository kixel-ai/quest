import { execFileSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	linkSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

import type { ReviewHarness } from "../src/cli/agent";
import { RUNGS, type ReviewModel, type Rung, drawRung, drawnFrom, rungOrder } from "../src/cli/models";
import { SIZES, type Size, recordedRisk } from "../src/core";
import {
	type Draw,
	type Finding,
	type Round,
	type Settled,
	type Tally,
	UnansweredError,
	agyTurn,
	ask,
	authored,
	baseInstructions,
	beside,
	claudeFlags,
	codexFlags,
	nextStep,
	drawSeat,
	drawing,
	namedReviewer,
	review,
	reviewPrompt,
	runningHarness,
	parseState,
	sessionFile,
	tallied,
	verdict,
} from "../src/cli/review";
import { withReview } from "../src/cli/review-record";
import { implementer, recorded, sameModel } from "../src/cli/models-record";
import { tempDir } from "./fixture";
import {
	CLAUDE_LOGGED_OUT,
	CODEX_LOGGED_OUT,
	FINDING,
	type Call,
	at,
	effortOf,
	agyFakes,
	caseInsensitive,
	fakes,
	git,
	quest,
	setup,
	write,
} from "./review-fakes";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

test("the reviewer is the harness this command is not running under", () => {
	expect(runningHarness({ CLAUDECODE: "1" })).toBe("claude");
	expect(runningHarness({ CODEX_THREAD_ID: "t" })).toBe("codex");
	expect(runningHarness({ ANTIGRAVITY_CONVERSATION_ID: "c" })).toBe("agy");
	expect(() => runningHarness({})).toThrow("pass --harness");
	expect(() => runningHarness({ CLAUDECODE: "1", CODEX_THREAD_ID: "t" })).toThrow(
		"Claude Code and Codex variables are set",
	);
	expect(() => runningHarness({ CODEX_THREAD_ID: "t", ANTIGRAVITY_CONVERSATION_ID: "c" })).toThrow(
		"Codex and Antigravity variables are set",
	);
});

type Avoided = (entry: ReviewModel) => boolean;
const shown = ({ harness, model, effort }: ReviewModel) => `${harness} ${model} ${effort}`;
/** A draw for `size` whose rung is `roll`'s and whose rungs keep their order, on a branch that has had `had`. */
const drawOf = (size: Size, wrote: Avoided, had: Record<string, number> = {}, roll = 0): Draw => {
	const rolls = [roll];
	return {
		...drawing(size, () => rolls.shift() ?? 0),
		had: (model) => had[model],
		usable: (entry) => !wrote(entry),
	};
};

test("a round draws its size's rung half the time, and a neighbor a quarter each", () => {
	const rolls = [0, 0.49, 0.5, 0.74, 0.75, 0.99];
	expect(rolls.map((roll) => drawRung("M", roll))).toEqual([
		"standard",
		"standard",
		"deep",
		"deep",
		"light",
		"light",
	]);
	// The top and bottom rungs have no step past them, so that quarter goes to the size's.
	expect([0.5, 0.75].map((roll) => drawRung("XL", roll))).toEqual(["frontier", "deep"]);
	expect([0.5, 0.75].map((roll) => drawRung("XS", roll))).toEqual(["standard", "light"]);
	expect(SIZES.map((size) => drawRung(size, 0))).toEqual(["light", "light", "standard", "deep", "frontier"]);
	expect(["standard", "deep", "light"].map((rung) => drawnFrom("M", rung as Rung))).toEqual(["size", "up", "down"]);
	// A seat looks through the drawn rung, the size's, then each rung outward, the stronger first.
	expect(rungOrder("M", "light")).toEqual(["light", "standard", "deep", "frontier"]);
	expect(rungOrder("M", "standard")).toEqual(["standard", "deep", "light", "frontier"]);
	expect(rungOrder("XL", "deep")).toEqual(["deep", "frontier", "standard", "light"]);
	// The same source orders each rung's models, drawn once: its first number is the rung's.
	const last = drawing("M", () => 0.99);
	expect(last.rung).toBe("light");
	expect(last.order.standard.map((entry) => entry.model)).toEqual([
		"gemini-4-neon",
		"claude-opus-5-5",
		"gpt-6.2-sol",
	]);
	expect(drawing("M", () => 0).order).toEqual(RUNGS);
	// Each model sits on a rung at one effort, and Sonnet reviews nothing.
	for (const rung of Object.values(RUNGS)) {
		const models = rung.map((entry) => entry.model);
		expect(new Set(models).size).toBe(models.length);
		expect(models).not.toContain("claude-sonnet-5-5");
		expect(rung.map((entry) => entry.effort)).not.toContain("max");
	}
});

test("each seat takes a model of the round's rung the branch has not had, never the latest writer's", () => {
	const claude = authored({}, { CLAUDECODE: "1" });
	const codex = authored({}, { CODEX_THREAD_ID: "t" });
	const at = (size: Size, wrote: Avoided, had: Record<string, number> = {}, taken: ReviewHarness[] = []) => {
		const seat = drawSeat(drawOf(size, wrote, had), taken);
		return seat && `${seat.rung} ${shown(seat.reviewer)}`;
	};
	expect(at("XS", claude)).toBe("light codex gpt-6.2-sol medium");
	expect(at("S", claude)).toBe("light codex gpt-6.2-sol medium");
	expect(at("M", claude)).toBe("standard codex gpt-6.2-sol high");
	expect(at("L", claude)).toBe("deep codex gpt-6.2-sol xhigh");
	expect(at("XL", claude)).toBe("frontier codex gpt-6.2-astra high");
	// Claude reviews what Sol wrote.
	expect(at("XS", codex)).toBe("light claude claude-opus-5-5 low");
	expect(at("M", codex)).toBe("standard claude claude-opus-5-5 medium");
	expect(at("L", codex)).toBe("deep claude claude-opus-5-5 high");
	expect(at("XL", codex)).toBe("frontier claude claude-opus-5-5 xhigh");

	// The PR's latest recorded implementer replaces the running harness, and only its model is avoided.
	expect(at("S", authored({}, { CLAUDECODE: "1" }, "claude-opus-5-5"))).toBe("light codex gpt-6.2-sol medium");
	expect(at("S", authored({}, { CLAUDECODE: "1" }, "gpt-6.2-sol"))).toBe("light claude claude-opus-5-5 low");
	// An unknown latest writer is taken to be the running harness, usually the session that just pushed.
	expect(at("M", authored({}, { CODEX_THREAD_ID: "t" }, "unknown"))).toBe("standard claude claude-opus-5-5 medium");
	// A draw may seat a model weaker than the writer: Sol reviews what Fable wrote.
	const byFable = authored({}, {}, "claude-fable-5-2");
	expect(at("M", byFable)).toBe("standard codex gpt-6.2-sol high");
	// --exclude-model avoids only the models it names, in any spelling, with no harness to detect.
	expect(at("S", authored({ exclude: ["gpt-6.2-sol"] }, { CLAUDECODE: "1" }))).toBe(
		"light claude claude-opus-5-5 low",
	);
	expect(at("S", authored({}, {}, "openai/gpt-6.2-sol"))).toBe("light claude claude-opus-5-5 low");
	expect(at("S", authored({ exclude: ["openai/gpt-6.2-sol"] }, {}))).toBe("light claude claude-opus-5-5 low");
	expect(at("M", authored({ exclude: ["gpt-6.2-astra"] }, {}))).toBe("standard codex gpt-6.2-sol high");
	expect(at("M", authored({ exclude: ["other-model"] }, {}))).toBe("standard codex gpt-6.2-sol high");
	expect(
		authored({}, {}, "gpt-6.2-astra")({ harness: "codex", model: "openai/gpt-6.2-astra", effort: "medium" }),
	).toBe(true);

	// A model the branch has not had comes first, then the one whose last round is the oldest.
	expect(at("M", byFable, { "gpt-6.2-sol": 1 })).toBe("standard claude claude-opus-5-5 medium");
	expect(at("M", byFable, { "gpt-6.2-sol": 1, "claude-opus-5-5": 2 })).toBe("standard agy gemini-4-neon medium");
	expect(at("M", byFable, { "gpt-6.2-sol": 2, "claude-opus-5-5": 1, "gemini-4-neon": 3 })).toBe(
		"standard claude claude-opus-5-5 medium",
	);
	// A seat takes no vendor another seat of the round has.
	expect(at("M", byFable, {}, ["codex"])).toBe("standard claude claude-opus-5-5 medium");
	expect(at("M", byFable, {}, ["codex", "claude"])).toBe("standard agy gemini-4-neon medium");
	// Only a rung with no model left for the seat passes it on: to the size's, then each rung outward.
	const byOpus = authored({}, {}, "claude-opus-5-5");
	expect(at("S", byOpus, { "gpt-6.2-sol": 1 })).toBe("light codex gpt-6.2-sol medium");
	expect(at("S", byOpus, {}, ["codex"])).toBe("standard agy gemini-4-neon medium");
	expect(at("S", byOpus, {}, ["codex", "agy"])).toBe("deep claude claude-fable-5-2 medium");
	const frontier = authored({ exclude: ["gpt-6.2-astra", "claude-opus-5-5", "claude-fable-5-2"] }, {});
	expect(at("XL", frontier)).toBe("deep codex gpt-6.2-sol xhigh");
	const up = drawSeat(drawOf("M", byFable, {}, 0.5), []);
	expect(up && `${up.rung} ${shown(up.reviewer)}`).toBe("deep codex gpt-6.2-sol xhigh");
	const every = ["gpt-6.2-sol", "claude-opus-5-5", "gpt-6.2-astra", "claude-fable-5-2", "gemini-4-neon"];
	const all = authored({ exclude: every }, {});
	expect(at("M", all)).toBeUndefined();

	const pick = (size: Size, choice: Parameters<typeof namedReviewer>[0], wrote: Avoided) =>
		namedReviewer(choice, drawOf(size, wrote), wrote);
	// A model a flag pins runs at its effort on the size's rung, whichever rung the run drew.
	for (const roll of [0, 0.6, 0.9])
		expect(
			namedReviewer(
				{ model: "gpt-6.2-sol" },
				drawOf("M", () => false, {}, roll),
				() => false,
			).effort,
		).toBe("high");
	// --harness takes that CLI's own draw, passing to the next rung that lists one it may seat.
	expect(pick("L", { harness: "claude" }, authored({ harness: "claude" }, { CLAUDECODE: "1" }))).toEqual({
		harness: "claude",
		model: "claude-opus-5-5",
		effort: "high",
	});
	expect(shown(pick("M", { harness: "claude" }, byOpus))).toBe("claude claude-fable-5-2 medium");
	expect(shown(pick("S", { harness: "agy" }, () => false))).toBe("agy gemini-4-neon medium");
	const sol = authored({ harness: "codex", exclude: ["gpt-6.2-sol"] }, {});
	expect(shown(pick("M", { harness: "codex" }, sol))).toBe("codex gpt-6.2-astra medium");
	const bothCodex = authored({ harness: "codex", exclude: ["gpt-6.2-sol", "gpt-6.2-astra"] }, {});
	expect(() => pick("M", { harness: "codex" }, bothCodex)).toThrow(
		"gpt-6.2-sol is avoided, as the latest writer's; pass --model",
	);
	// A --model a rung lists runs on its entry's harness and effort, in the spelling given.
	expect(shown(pick("M", { model: "claude-fable-5-2" }, byOpus))).toBe("claude claude-fable-5-2 medium");
	expect(pick("XL", { harness: "codex", model: "openai/gpt-6.2-sol" }, () => false)).toEqual({
		harness: "codex",
		model: "openai/gpt-6.2-sol",
		effort: "xhigh",
	});
	// One no rung lists runs at --harness's first entry, or without it in place of the round's draw.
	expect(shown(pick("M", { harness: "claude", model: "claude-opus-4-7" }, byOpus))).toBe(
		"claude claude-opus-4-7 medium",
	);
	expect(shown(pick("M", { harness: "codex", model: "gpt-6-astra" }, sol))).toBe("codex gpt-6-astra high");
	expect(shown(pick("M", { model: "gpt-6-astra" }, byOpus))).toBe("codex gpt-6-astra high");
	// Nor does --model bring back an avoided model.
	expect(() => pick("M", { harness: "codex", model: "gpt-6.2-sol" }, sol)).toThrow("gpt-6.2-sol is avoided");
	expect(() => pick("M", { model: "claude-opus-5-5" }, byOpus)).toThrow("claude-opus-5-5 is avoided");
	// --effort alone overrides the draw's.
	expect(shown(pick("XS", { effort: "high" }, claude))).toBe("codex gpt-6.2-sol high");
	expect(() => pick("M", { effort: "high" }, all)).toThrow("every reviewer is avoided");
});

test("over many draws, rounds bring models a branch has not had, at the rung shares the draw promises", () => {
	// A fixed linear congruential source, so the sample is the same on every run.
	let seed = 42;
	const random = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
	const writers = ["claude-opus-5-5", "claude-fable-5-2", "gpt-6.2-sol"];
	const drawn = { size: 0, up: 0, down: 0 };
	for (let branch = 0; branch < 400; branch++) {
		const writer = writers[branch % writers.length]!;
		const size = SIZES[branch % SIZES.length]!;
		const wrote = authored({}, {}, writer);
		const had: Record<string, number> = {};
		for (let run = 1; run <= 6; run++) {
			const draw: Draw = {
				...drawing(size, random),
				had: (model) => had[model],
				usable: (entry) => !wrote(entry),
			};
			if (size === "M") drawn[drawnFrom(size, draw.rung)]++;
			const first = drawSeat(draw, [])!;
			const second = drawSeat(draw, [first.reviewer.harness])!;
			expect(first.reviewer.model).not.toBe(writer);
			expect(second.reviewer.model).not.toBe(writer);
			expect(second.reviewer.harness).not.toBe(first.reviewer.harness);
			// The first seat comes from the drawn rung, and repeats a model only once the rung has no new one left,
			// then the one the branch had longest ago.
			expect(first.rung).toBe(draw.rung);
			const open = RUNGS[draw.rung].filter((entry) => entry.model !== writer);
			if (had[first.reviewer.model] !== undefined) {
				expect(open.every((entry) => had[entry.model] !== undefined)).toBe(true);
				expect(had[first.reviewer.model]).toBe(Math.min(...open.map((entry) => had[entry.model]!)));
			}
			had[first.reviewer.model] = run;
			had[second.reviewer.model] = run;
		}
	}
	const total = drawn.size + drawn.up + drawn.down;
	expect(drawn.size / total).toBeCloseTo(0.5, 1);
	expect(drawn.up / total).toBeCloseTo(0.25, 1);
	expect(drawn.down / total).toBeCloseTo(0.25, 1);
});

fakes("a quest branch is reviewed at its quest's size on the base, which its own change cannot lower", async () => {
	const s = setup();
	git(s.repo, "checkout", "-q", "main");
	write(s.repo, "quest/m0/big.md", "# [L] Big\n\n## Goal\n\nBig.\n");
	git(s.repo, "add", ".");
	git(s.repo, "commit", "-qm", "plan");
	git(s.repo, "push", "-q", "origin", "main");
	git(s.repo, "checkout", "-qb", "quest/m0/big");
	write(s.repo, "quest/m0/big.md", "# [XS] Big\n\n## Goal\n\nBig.\n");
	git(s.repo, "commit", "-qam", "shrink");

	const result = await quest("--root", s.repo, "review");
	expect(result.stderr).toBe("");
	expect(result.stdout).toMatch(/^size L quest\/m0\/big.md\n/);
	expect(result.stdout).toContain("\nreviewer codex gpt-6.2-sol xhigh\n");

	// --size overrides the quest's.
	const sized = await quest("--root", s.repo, "review", "--size", "S", "--new");
	expect(sized.stdout).toMatch(/^size S --size\n/);
	expect(sized.stdout).toContain("\nreviewer codex gpt-6.2-sol medium\n");
	// A checkout on another branch, as the runner's review checkout is, takes the size of the branch it names.
	git(s.repo, "checkout", "-qb", "kix-review/job1");
	const {
		rounds: [runner],
	} = await review(
		{ root: s.repo, base: "origin/main", sizeBranch: "quest/m0/big" },
		{ env: { ...process.env, CLAUDECODE: "1" } },
	);
	expect([runner!.size, runner!.sizeFrom, runner!.effort]).toEqual(["L", "quest/m0/big.md", "xhigh"]);
	git(s.repo, "checkout", "-q", "quest/m0/big");
	const invalid = await quest("--root", s.repo, "review", "--size", "XXL", "--new");
	expect(invalid.code).not.toBe(0);
	expect(invalid.stderr).toContain("Allowed choices are XS, S, M, L, XL");

	// A quest branch whose quest the base lacks, such as one planned on the branch, takes the default.
	git(s.repo, "checkout", "-qb", "quest/m0/new", "main");
	write(s.repo, "quest/m0/new.md", "# [XS] New\n\n## Goal\n\nNew.\n");
	git(s.repo, "add", ".");
	git(s.repo, "commit", "-qm", "new");
	expect((await quest("--root", s.repo, "review")).stdout).toContain("size M default\n");
});

fakes("--exclude-model picks the reviewer from the PR's implementers instead of the running harness", async () => {
	const s = setup(null);
	const result = await quest("--root", s.repo, "review", "--exclude-model", "gpt-6.2-sol", "--json");
	expect(result.stderr).toBe("");
	const [round] = JSON.parse(result.stdout).rounds;
	expect([round.reviewer, round.model, round.effort, round.size, round.sizeFrom]).toEqual([
		"claude",
		"claude-opus-5-5",
		"medium",
		"M",
		"default",
	]);

	// Qualified flags compare as the listed model, Astra on its own rung's effort with Opus avoided, and the CLI
	// still gets the spelling given.
	const qualified = await quest(
		"--root",
		s.repo,
		"review",
		"--exclude-model",
		"anthropic/claude-opus-5-5",
		"--model",
		"openai/gpt-6.2-astra",
		"--json",
		"--new",
	);
	expect(qualified.stderr).toBe("");
	const [astra] = JSON.parse(qualified.stdout).rounds;
	expect([astra.reviewer, astra.model, astra.effort]).toEqual(["codex", "openai/gpt-6.2-astra", "medium"]);
	// A reviewer a flag named records no rung, since no draw seated it.
	expect(astra.rung).toBeUndefined();
	expect(round.rung).toEqual({ name: "standard", drawn: "size" });

	const all = ["gpt-6.2-sol", "claude-opus-5-5", "gpt-6.2-astra", "claude-fable-5-2", "gemini-4-neon"].flatMap(
		(m) => ["--exclude-model", m],
	);
	const none = await quest("--root", s.repo, "review", ...all, "--new");
	expect(none.code).toBe(2);
	expect(none.stderr).toContain("every reviewer is avoided, as the latest writer's; pass --harness and --model");
});

fakes("an unknown harness is an error, never a same-model review", async () => {
	const s = setup(null);
	const result = await quest("--root", s.repo, "review");
	expect(result.code).toBe(2);
	expect(result.stderr).toContain("pass --harness");
	expect(s.calls()).toEqual([]);
});

fakes("a missing or logged-out reviewer CLI with no reviewer after it is an outage", async () => {
	const s = setup();
	// Only git is on PATH, so no codex install outside the fakes is found either.
	const only = join(s.bin, "..", "git-only");
	mkdirSync(only);
	symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(only, "git"));
	vi.stubEnv("PATH", only);
	const missing = await quest("--root", s.repo, "review");
	expect(missing.code).toBe(3);
	expect(missing.stderr).toContain("codex is not installed");

	const t = setup();
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	const out = await quest("--root", t.repo, "review");
	expect(out.code).toBe(3);
	expect(out.stderr).toContain(CODEX_LOGGED_OUT);
	// Codex's seat passes to Gemini, the only other vendor Claude Code's session leaves, whose login is checked
	// too where quest runs agy at all; no turn runs.
	expect(t.calls().map((call) => call.argv[0])).toEqual(caseInsensitive ? ["login"] : ["login", "models"]);
});

const CODEX_PROFILE = "codex is not logged in to the profile CODEX_HOME=/work; run `codex login`";
const CLAUDE_PROFILE = "claude is not logged in to the profile CLAUDE_CONFIG_DIR=/work; run `claude auth login`";

// Signed out at the status check, and rejected by the API after it passed.
fakes.each([
	["CLAUDECODE", "CODEX_HOME", "FAKE_LOGGED_OUT", "1", CODEX_PROFILE],
	["CLAUDECODE", "CODEX_HOME", "FAKE_REJECTED", "turn", CODEX_PROFILE],
	["CODEX_THREAD_ID", "CLAUDE_CONFIG_DIR", "FAKE_LOGGED_OUT", "1", CLAUDE_PROFILE],
	["CODEX_THREAD_ID", "CLAUDE_CONFIG_DIR", "FAKE_REJECTED", "status", CLAUDE_PROFILE],
] as const)(
	"a logged-out error names the profile its status check read (host %s, %s, %s=%s)",
	async (host, variable, flag, value, message) => {
		const s = setup(host);
		vi.stubEnv(variable, "/work");
		vi.stubEnv(flag, value);
		const result = await quest("--root", s.repo, "review");
		expect(result.code, result.stderr).toBe(3);
		expect(result.stderr).toContain(message);
	},
);

fakes.each([
	["CLAUDECODE", "turn", CODEX_LOGGED_OUT],
	["CLAUDECODE", "stderr", CODEX_LOGGED_OUT],
	["CODEX_THREAD_ID", "status", CLAUDE_LOGGED_OUT],
	["CODEX_THREAD_ID", "text", CLAUDE_LOGGED_OUT],
	["CODEX_THREAD_ID", "stderr", CLAUDE_LOGGED_OUT],
] as const)(
	"a login the API rejects fails as logged out, whatever the status check said (host %s, rejected in %s)",
	async (host, variant, message) => {
		const s = setup(host);
		vi.stubEnv("FAKE_REJECTED", variant);
		const result = await quest("--root", s.repo, "review");
		expect(result.stderr).toContain(message);
		expect(result.code).toBe(3);
		// A rejected login rules out every model of its CLI, so Claude's later reviewer never runs. The failing seat's
		// status check passed, and the first turn to fail stopped the other seat before it
		// resumed. That seat runs its own status check concurrently, so the abort may stop it before its CLI
		// logs, or before it spawns at all.
		const calls = s.calls();
		const checks = calls.filter((c) => effortOf(c) === null).length;
		expect(checks).toBeGreaterThanOrEqual(1);
		expect(checks).toBeLessThanOrEqual(2);
		const turns = calls.filter((c) => effortOf(c) !== null);
		expect(turns.length).toBeGreaterThanOrEqual(1);
		expect(turns.every((c) => !c.argv.includes("--resume") && !c.argv.includes("resume"))).toBe(true);
	},
);

// Codex prints its reset in the local time zone, which this process shares.
const codexReset = new Date(2026, 10, 5, 15, 15).toISOString().replace(".000Z", "Z");

// One test per case: each runs two full reviews, and all four in one test outran its timeout on loaded runners.
fakes.for([
	// Sol's limit passes its seat to Gemini, then to the next rung's Astra, which hits Codex's limit too.
	[
		"CLAUDECODE",
		"reset",
		`no eligible standard reviewer could run: gpt-6.2-sol high and gpt-6.2-astra medium (codex hit its usage limit; resets ${codexReset})`,
	],
	[
		"CLAUDECODE",
		"unknown",
		"no eligible standard reviewer could run: gpt-6.2-sol high and gpt-6.2-astra medium (codex hit its usage limit; resets unknown)",
	],
	// Opus's limit passes to the next rung's Fable, which hits Claude's limit too.
	[
		"CODEX_THREAD_ID",
		"reset",
		"no eligible standard reviewer could run: claude-opus-5-5 medium and claude-fable-5-2 medium (claude hit its usage limit; resets 2030-03-17T17:46:40Z)",
	],
	[
		"CODEX_THREAD_ID",
		"unknown",
		"no eligible standard reviewer could run: claude-opus-5-5 medium and claude-fable-5-2 medium (claude hit its usage limit; resets unknown)",
	],
] as const)(
	"a usage limit with no reviewer left exits 3 with its reset, and records no round (%s, %s)",
	async ([host, variant, message]) => {
		const s = setup(host);
		vi.stubEnv("FAKE_LIMITED", variant);
		const result = await quest("--root", s.repo, "review");
		// Gemini's seat is out too, at its own limit or where quest refuses agy, as the message goes on to say.
		expect(result.stderr).toContain(`error: ${message}, gemini-4-neon medium (agy `);
		expect(result.code).toBe(3);
		expect(result.stdout).toBe("");
		vi.stubEnv("FAKE_LIMITED", undefined);
		// No round was recorded, so the next one needs no responses.
		expect((await quest("--root", s.repo, "review")).code).toBe(0);
	},
);

// Gemini is left out with the writer, since quest refuses agy on a volume that matches names case-insensitively,
// where a seat it would take reads as a skip instead.
const OPUS_WROTE = ["--exclude-model", "claude-opus-5-5", "--exclude-model", "gemini-4-neon"];

fakes("a reviewer at its usage limit passes the round to the next eligible one, and the record names it", async () => {
	const s = setup(null);
	vi.stubEnv("FAKE_FAILS", "gpt-6.2-sol");
	vi.stubEnv("FAKE_LIMITED", "reset");
	const plain = await quest("--root", s.repo, "review", ...OPUS_WROTE);
	expect(plain.code, plain.stderr).toBe(0);
	expect(plain.stdout).toContain(`\nskipped codex gpt-6.2-sol high usage limit, resets ${codexReset}\n`);
	// The standard rung has no other model left, so the seat passes to the next rung outward.
	expect(plain.stdout).toContain("\nreviewer codex gpt-6.2-astra medium\nrung deep up\nsession ");
	// Only Astra ran turns after Sol's limit, and Opus, the writer, never ran.
	const turns = s.calls().filter((c) => effortOf(c) !== null);
	expect(turns.filter((c) => c.argv.join(" ").includes("claude-opus-5-5"))).toEqual([]);
	expect(turns.filter((c) => c.argv.join(" ").includes("gpt-6.2-astra"))).toHaveLength(2);

	// The responses answer Astra's finding, which Sol, a model the branch has not had, settles once it is back.
	vi.stubEnv("FAKE_LIMITED", undefined);
	const responses = join(s.bin, "..", "responses.md");
	writeFileSync(responses, "1. Fixed: the average divides by the count.\n");
	write(s.repo, "src/lib.ts", "export const x = 3;\n");
	git(s.repo, "commit", "-qam", "fix");
	const back = await quest("--root", s.repo, "review", ...OPUS_WROTE, "--responses", responses, "--json");
	expect(back.code, back.stderr).toBe(0);
	const { rounds, skipped, tallies } = JSON.parse(back.stdout);
	expect(skipped).toEqual([]);
	expect(rounds.map((r: Round) => `${r.reviewer} ${r.model} ${r.effort} ${r.rung?.name}`)).toEqual([
		"codex gpt-6.2-sol high standard",
	]);
	expect(rounds.map((r: Round) => r.earlier?.findings.map((f) => f.disposition))).toEqual([["fixed"]]);
	// The fix is Astra's, whose finding it was, and Sol's own round starts its own tally.
	expect(tallies.map((t: Tally) => [t.model, t.rounds, t.fixed, t.last])).toEqual([
		["gpt-6.2-sol", 1, 0, 2],
		["gpt-6.2-astra", 1, 1, 1],
	]);
});

fakes("a model its login does not serve passes the round on, recorded as a skip", async () => {
	const s = setup(null);
	vi.stubEnv("FAKE_FAILS", "gpt-6.2-sol");
	vi.stubEnv("FAKE_LIMITED", "unserved");
	const result = await quest("--root", s.repo, "review", ...OPUS_WROTE, "--json");
	expect(result.code, result.stderr).toBe(0);
	const { rounds, skipped } = JSON.parse(result.stdout);
	// Only Sol is out, so Codex's other model still takes the seat.
	expect(skipped).toEqual([{ harness: "codex", model: "gpt-6.2-sol", effort: "high", reason: "model not served" }]);
	expect(rounds.map((r: Round) => `${r.model} ${r.effort}`)).toEqual(["gpt-6.2-astra medium"]);
	// So does one whose CLI says so only on stderr.
	vi.stubEnv("FAKE_LIMITED", "unserved-stderr");
	const quiet = JSON.parse((await quest("--root", s.repo, "review", ...OPUS_WROTE, "--new", "--json")).stdout);
	expect(quiet.skipped.map((skip: { reason: string }) => skip.reason)).toEqual(["model not served"]);
	vi.stubEnv("FAKE_LIMITED", "unserved");
	// Named, it fails as itself.
	const named = await quest("--root", s.repo, "review", ...OPUS_WROTE, "--model", "gpt-6.2-sol", "--new");
	expect(named.code).toBe(3);
	expect(named.stderr).toBe("error: codex does not serve gpt-6.2-sol on this login or gateway\n");
});

fakes("a model at its usage limit passes the round to the next model of its rung", async () => {
	const s = setup(null);
	vi.stubEnv("FAKE_FAILS", "claude-opus-5-5");
	vi.stubEnv("FAKE_LIMITED", "reset");
	const args = ["--exclude-model", "gpt-6.2-sol", "--size", "L", "--json"];
	const result = await quest("--root", s.repo, "review", ...args);
	expect(result.code, result.stderr).toBe(0);
	const { rounds, skipped } = JSON.parse(result.stdout);
	expect(skipped).toEqual([
		{
			harness: "claude",
			model: "claude-opus-5-5",
			effort: "high",
			reason: "usage limit, resets 2030-03-17T17:46:40Z",
		},
	]);
	expect(rounds.map((r: Round) => `${r.model} ${r.effort} ${r.rung?.name} ${r.rung?.drawn}`)).toEqual([
		"gpt-6.2-astra medium deep size",
	]);
});

fakes("a reviewer CLI that is not installed passes the round to the next eligible one", async () => {
	const s = setup(null);
	// Only git and Codex are on PATH, so no claude install outside the fakes is found either.
	const only = join(s.bin, "..", "codex-only");
	mkdirSync(only);
	symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(only, "git"));
	symlinkSync(join(s.bin, "codex"), join(only, "codex"));
	vi.stubEnv("PATH", only);
	const result = await quest("--root", s.repo, "review", "--exclude-model", "gpt-6.2-sol");
	expect(result.code, result.stderr).toBe(0);
	expect(result.stdout).toContain("\nskipped claude claude-opus-5-5 medium not installed\n");
	// Gemini's CLI is missing too, so the seat passes to the next rung outward.
	expect(result.stdout).toContain("\nskipped agy gemini-4-neon medium not installed\n");
	expect(result.stdout).toContain("\nreviewer codex gpt-6.2-astra medium\nrung deep up\n");
});

fakes.each([
	["--harness", "codex"],
	["--model", "gpt-6.2-sol"],
	["--effort", "high"],
])("a reviewer named with %s %s never falls through", async (flag, value) => {
	const s = setup(null);
	vi.stubEnv("FAKE_FAILS", "codex");
	vi.stubEnv("FAKE_LIMITED", "reset");
	const result = await quest("--root", s.repo, "review", ...OPUS_WROTE, flag, value);
	expect(result.stderr).toBe(`error: codex hit its usage limit; resets ${codexReset}\n`);
	expect(result.code).toBe(3);
	expect(s.calls().filter((c) => c.argv[0] !== "exec" && c.argv[0] !== "login")).toEqual([]);
});

fakes("a failed turn whose reply only quotes a usage limit is no limit, so no other reviewer runs", async () => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("FAKE_QUOTED", "1");
	const result = await quest("--root", s.repo, "review");
	expect(result.code).toBe(1);
	expect(result.stderr).toContain("claude failed with exit status 1");
	expect(s.calls().filter((c) => effortOf(c) !== null && !c.argv.includes("claude-opus-5-5"))).toEqual([]);
});

fakes("Codex reaches a gateway at OPENAI_BASE_URL, whose persistent 429 is the pool's usage limit", async () => {
	const s = setup();
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	vi.stubEnv("CODEX_API_KEY", "proxy-key");
	vi.stubEnv("FAKE_LIMITED", "retried");
	// From the provider itself, giving up on a 429 may be a brief throttle, so it is no limit.
	const direct = await quest("--root", s.repo, "review");
	expect(direct.code).toBe(1);
	expect(direct.stderr).toContain("exceeded retry limit, last status: 429");
	vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:4000/v1");
	const pooled = await quest("--root", s.repo, "review");
	// Gemini's seat is out too, logged out or where quest refuses agy.
	expect(pooled.stderr).toContain(
		"error: no eligible standard reviewer could run: gpt-6.2-sol high and gpt-6.2-astra medium (codex hit its usage limit; resets unknown), gemini-4-neon medium (agy ",
	);
	expect(pooled.code).toBe(3);
	vi.stubEnv("FAKE_LIMITED", undefined);
	expect((await quest("--root", s.repo, "review")).code).toBe(0);
	// Codex reads no OPENAI_BASE_URL itself, so the review sets its openai_base_url.
	for (const call of s
		.calls()
		.filter((c) => c.argv[0] === "exec")
		.slice(-2))
		expect(call.argv.join(" ")).toContain('-c openai_base_url="http://127.0.0.1:4000/v1"');
});

// Codex trims a credential and reads a blank one as unset, so it would send its stored login.
fakes.each([
	["", undefined],
	["1", undefined],
	["", " \t"],
])(
	"Codex sent to a gateway with no credential never gets the stored login (logged out: %j, credentials: %j)",
	async (loggedOut, blank) => {
		const s = setup();
		vi.stubEnv("FAKE_LOGGED_OUT", loggedOut);
		vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:4000/v1");
		vi.stubEnv("CODEX_API_KEY", blank);
		vi.stubEnv("CODEX_ACCESS_TOKEN", blank);
		// OpenAI's own key is no credential Codex reads.
		vi.stubEnv("OPENAI_API_KEY", "openai-key");
		const result = await quest("--root", s.repo, "review", "--harness", "codex");
		expect(result.code).toBe(3);
		expect(result.stderr).toContain(
			"codex would send its stored login to the gateway OPENAI_BASE_URL names, which has no credential; " +
				"set CODEX_API_KEY (any value, for a gateway that needs none) or CODEX_ACCESS_TOKEN for the gateway, " +
				"or unset OPENAI_BASE_URL",
		);
		// Refused before Codex runs at all, not even its status check.
		expect(s.calls()).toEqual([]);
	},
);

fakes.each([
	["CODEX_API_KEY", "gateway-key"],
	["CODEX_ACCESS_TOKEN", "gateway-token"],
])("a gateway's %s wins over Codex's stored login, which its status check never needs", async (name, value) => {
	const s = setup();
	vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:4000/v1");
	vi.stubEnv(name, value);
	const result = await quest("--root", s.repo, "review");
	expect(result.code, result.stderr).toBe(0);
	const calls = s.calls();
	expect(calls.length).toBeGreaterThan(1);
	for (const call of calls) {
		expect(call.argv[0]).toBe("exec");
		expect(call.env[name]).toBe(value);
	}
});

fakes("a gateway that rejects Codex's key names the key and the gateway", async () => {
	const s = setup();
	vi.stubEnv("OPENAI_BASE_URL", "http://127.0.0.1:4000/v1");
	vi.stubEnv("CODEX_API_KEY", "gateway-key");
	vi.stubEnv("FAKE_REJECTED", "turn");
	const result = await quest("--root", s.repo, "review");
	expect(result.code).toBe(3);
	expect(result.stderr).toContain(
		"codex rejected CODEX_API_KEY through OPENAI_BASE_URL; replace it, or run `codex login`",
	);
});

fakes("a reviewer with no stored login reviews with the credential its CLI reads from the environment", async () => {
	const s = setup();
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	vi.stubEnv("CODEX_API_KEY", "codex-key");
	vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "session-token");
	const codex = await quest("--root", s.repo, "review");
	expect(codex.stderr).toBe("");
	expect(codex.code).toBe(0);
	for (const call of s.calls().filter((c) => effortOf(c) !== null)) {
		expect(call.env.CODEX_API_KEY).toBe("codex-key");
		// The other harness's credentials and the session's own variables still never reach it.
		expect(call.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
		expect(call.env.CLAUDECODE).toBeUndefined();
	}

	const t = setup("CODEX_THREAD_ID");
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key");
	vi.stubEnv("CODEX_API_KEY", "codex-key");
	vi.stubEnv("CLAUDE_CODE_ENTRYPOINT", "sdk-ts");
	const claude = await quest("--root", t.repo, "review");
	expect(claude.stderr).toBe("");
	expect(claude.code).toBe(0);
	for (const call of t.calls().filter((c) => effortOf(c) !== null)) {
		expect(call.env.ANTHROPIC_API_KEY).toBe("anthropic-key");
		expect(call.env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
		expect(call.env.CODEX_API_KEY).toBeUndefined();
		expect(call.env.CODEX_THREAD_ID).toBeUndefined();
	}
});

fakes("an abort stops the reviewer's turn and records no round", async () => {
	const s = setup();
	const pid = join(s.bin, "..", "codex.pid");
	vi.stubEnv("FAKE_HANG", pid);
	const controller = new AbortController();
	const round = review({ root: s.repo, signal: controller.signal }, { env: process.env });
	while (!existsSync(pid)) await new Promise((resolve) => setTimeout(resolve, 20));
	controller.abort();
	await expect(round).rejects.toThrow(/abort/i);
	// The round fails only once the CLI exited, so nothing outlives it in the checkout.
	expect(() => process.kill(Number(readFileSync(pid, "utf8")), 0)).toThrow();
	expect(existsSync(sessionFile(join(s.repo, ".git"), "feature"))).toBe(false);
});

fakes("a stored login wins over an environment credential, so a shell's key never changes the billing", async () => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key");
	expect((await quest("--root", s.repo, "review")).code).toBe(0);
	for (const call of s.calls()) expect(call.env.ANTHROPIC_API_KEY).toBeUndefined();
});

fakes("an environment credential the API rejects is named in the error", async () => {
	const s = setup();
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	vi.stubEnv("CODEX_API_KEY", "codex-key");
	vi.stubEnv("FAKE_REJECTED", "turn");
	const result = await quest("--root", s.repo, "review");
	expect(result.code).toBe(3);
	expect(result.stderr).toContain("codex rejected CODEX_API_KEY; replace it, or run `codex login`");
});

fakes("a stored login the API rejects names the credential quest review strips beside it", async () => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key");
	vi.stubEnv("FAKE_REJECTED", "status");
	const result = await quest("--root", s.repo, "review");
	expect(result.code).toBe(3);
	expect(result.stderr).toContain(
		`${CLAUDE_LOGGED_OUT}; quest review strips ANTHROPIC_API_KEY while a stored login exists`,
	);
});

fakes.each([
	["without a stored login", "1"],
	["over a stored login", undefined],
])("Claude keeps a gateway's URL, token, and headers %s, in every round", async (_, loggedOut) => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("FAKE_LOGGED_OUT", loggedOut);
	vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "gateway-token");
	vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:8317");
	vi.stubEnv("ANTHROPIC_CUSTOM_HEADERS", "X-Gateway-Tenant: review");
	// Neither routes anything, nor changes the reviewer's plugins, model, or account.
	vi.stubEnv("CLAUDE_CODE_USE_BEDROCK", "");
	vi.stubEnv("CLAUDE_CODE_PLUGIN_DIRS", "/untrusted/plugins");
	vi.stubEnv("CLAUDE_CODE_EFFORT_LEVEL", "max");
	vi.stubEnv("ANTHROPIC_MODEL", "parent-model");
	vi.stubEnv("CODEX_API_KEY", "other-provider-key");
	vi.stubEnv("OPENAI_API_KEY", "other-provider-key");
	vi.stubEnv("OP_SERVICE_ACCOUNT_TOKEN", "secret-manager-token");
	vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
	// Claude is named, so each round draws among its models alone: Opus again, once the rung has no new one.
	const first = await quest("--root", s.repo, "review", "--harness", "claude", "--json");
	expect(first.code, first.stderr).toBe(0);
	write(s.repo, "src/lib.ts", "export const x = 4;\n");
	git(s.repo, "commit", "-qam", "more");
	const again = await quest("--root", s.repo, "review", "--harness", "claude", "--json");
	expect(again.code, again.stderr).toBe(0);
	const [round] = JSON.parse(again.stdout).rounds;
	expect(round).toMatchObject({ round: 2, model: "claude-opus-5-5", effort: "medium" });
	// No round resumes another's session.
	expect(round.session).not.toBe(JSON.parse(first.stdout).rounds[0].session);
	const calls = s.calls();
	expect(at(calls, "medium").map((c) => c.argv[0])).toEqual(["-p", "-p", "-p", "-p"]);
	expect(calls.filter((c) => effortOf(c) === null)).toHaveLength(2);
	for (const call of calls) {
		expect(call.env).toMatchObject({
			ANTHROPIC_AUTH_TOKEN: "gateway-token",
			ANTHROPIC_BASE_URL: "http://127.0.0.1:8317",
			ANTHROPIC_CUSTOM_HEADERS: "X-Gateway-Tenant: review",
			CLAUDE_CODE_USE_BEDROCK: "",
		});
		for (const name of [
			"CODEX_THREAD_ID",
			"CODEX_API_KEY",
			"CLAUDE_CODE_PLUGIN_DIRS",
			"CLAUDE_CODE_EFFORT_LEVEL",
			"ANTHROPIC_MODEL",
		]) {
			expect(call.env[name], name).toBeUndefined();
		}
	}
});

fakes.each([
	["", undefined],
	["1", undefined],
	["", " \t"],
])(
	"a gateway with no credential never gets the stored login (logged out: %j, credentials: %j)",
	async (loggedOut, blank) => {
		const s = setup("CODEX_THREAD_ID");
		vi.stubEnv("FAKE_LOGGED_OUT", loggedOut);
		vi.stubEnv("ANTHROPIC_BASE_URL", "https://gateway.example");
		vi.stubEnv("ANTHROPIC_API_KEY", blank);
		vi.stubEnv("ANTHROPIC_AUTH_TOKEN", blank);
		// A tenant header and a login token give the gateway no credential of its own.
		vi.stubEnv("ANTHROPIC_CUSTOM_HEADERS", "X-Gateway-Tenant: review\nX-Authorization: no");
		vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-login");
		const result = await quest("--root", s.repo, "review", "--harness", "claude");
		expect(result.code).toBe(3);
		expect(result.stderr).toContain(
			"claude would send its stored login to the gateway ANTHROPIC_BASE_URL names, which has no credential; " +
				"set ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an Authorization header in ANTHROPIC_CUSTOM_HEADERS " +
				"for the gateway (any value, for one that needs none), or unset ANTHROPIC_BASE_URL",
		);
		// Refused before Claude runs at all, not even its status check.
		expect(s.calls()).toEqual([]);
	},
);

fakes("an Authorization header in ANTHROPIC_CUSTOM_HEADERS is the gateway's credential", async () => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("ANTHROPIC_BASE_URL", "https://gateway.example");
	vi.stubEnv("ANTHROPIC_CUSTOM_HEADERS", "X-Gateway-Tenant: review\r\n  authorization :  Bearer gateway");
	const result = await quest("--root", s.repo, "review");
	expect(result.code, result.stderr).toBe(0);
	expect(s.calls().length).toBeGreaterThan(1);
	for (const call of s.calls()) {
		expect(call.env.ANTHROPIC_BASE_URL).toBe("https://gateway.example");
		expect(call.env.ANTHROPIC_CUSTOM_HEADERS).toContain("Bearer gateway");
	}
});

fakes("a cloud provider ignores ANTHROPIC_BASE_URL, so it needs no gateway credential", async () => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("ANTHROPIC_BASE_URL", "https://gateway.example");
	vi.stubEnv("CLAUDE_CODE_USE_BEDROCK", "1");
	const result = await quest("--root", s.repo, "review");
	expect(result.code, result.stderr).toBe(0);
	for (const call of s.calls()) expect(call.env.CLAUDE_CODE_USE_BEDROCK).toBe("1");
});

fakes("a host-managed provider is dropped, and the review runs on the stored login", async () => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST", "1");
	vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:8317");
	vi.stubEnv("ANTHROPIC_CUSTOM_HEADERS", "X-Host: t3");
	vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "host-token");
	vi.stubEnv("CLAUDE_CODE_USE_BEDROCK", "1");
	const result = await quest("--root", s.repo, "review");
	expect(result.code, result.stderr).toBe(0);
	expect(s.calls().length).toBeGreaterThan(1);
	for (const call of s.calls()) {
		for (const name of [
			"CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
			"ANTHROPIC_BASE_URL",
			"ANTHROPIC_CUSTOM_HEADERS",
			"ANTHROPIC_AUTH_TOKEN",
			"CLAUDE_CODE_USE_BEDROCK",
		]) {
			expect(call.env[name], name).toBeUndefined();
		}
	}
});

fakes("a host-managed provider with no stored login fails as logged out", async () => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	vi.stubEnv("CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST", "true");
	vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:8317");
	vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "host-token");
	const result = await quest("--root", s.repo, "review", "--harness", "claude");
	expect(result.code).toBe(3);
	expect(result.stderr).toContain(
		"claude is not logged in to its default profile (CLAUDE_CONFIG_DIR is unset), ignoring the host-managed " +
			"provider's route; run `claude auth login`",
	);
	expect(s.calls().length).toBeGreaterThanOrEqual(1);
	for (const call of s.calls()) expect(call.argv).toEqual(["auth", "status"]);
});

fakes("a gateway credential the API rejects is named with the gateway", async () => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "gateway-token");
	vi.stubEnv("ANTHROPIC_BASE_URL", "https://gateway.example");
	vi.stubEnv("FAKE_REJECTED", "status");
	const result = await quest("--root", s.repo, "review");
	expect(result.code).toBe(3);
	expect(result.stderr).toContain(
		"claude rejected ANTHROPIC_AUTH_TOKEN through ANTHROPIC_BASE_URL; replace it, or run `claude auth login`",
	);
});

fakes.each(["0", "false", ""])("a provider switch set to %j routes nothing", async (value) => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key");
	vi.stubEnv("CLAUDE_CODE_USE_BEDROCK", value);
	vi.stubEnv("CLAUDE_CODE_USE_VERTEX", value);
	const result = await quest("--root", s.repo, "review");
	expect(result.code, result.stderr).toBe(0);
	expect(s.calls().length).toBeGreaterThan(1);
	for (const call of s.calls()) {
		// The stored login still wins over the key, and the switch reaches the CLI as set.
		expect(call.env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(call.env.CLAUDE_CODE_USE_BEDROCK).toBe(value);
	}
});

fakes.each([
	["BEDROCK", "ANTHROPIC_BEDROCK_BASE_URL"],
	["VERTEX", "ANTHROPIC_VERTEX_BASE_URL"],
	["FOUNDRY", "ANTHROPIC_FOUNDRY_BASE_URL"],
	["MANTLE", "ANTHROPIC_BEDROCK_MANTLE_BASE_URL"],
	["ANTHROPIC_AWS", "ANTHROPIC_AWS_BASE_URL"],
	["ANTHROPIC_GOOGLE_CLOUD", "ANTHROPIC_GOOGLE_CLOUD_BASE_URL"],
	["ANTHROPIC_GOOGLE_CLOUD", "ANTHROPIC_GOOGLE_CLOUD_LOCATION"],
])("Claude keeps the %s provider switch with its %s and skip-auth setting", async (provider, endpoint) => {
	const s = setup("CODEX_THREAD_ID");
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	vi.stubEnv(`CLAUDE_CODE_USE_${provider}`, "1");
	vi.stubEnv(`CLAUDE_CODE_SKIP_${provider}_AUTH`, "1");
	vi.stubEnv(endpoint, "https://provider.example");
	vi.stubEnv("ANTHROPIC_MODEL", "parent-model");
	const result = await quest("--root", s.repo, "review");
	expect(result.code, result.stderr).toBe(0);
	expect(s.calls().length).toBeGreaterThan(1);
	for (const call of s.calls()) {
		expect(call.env[`CLAUDE_CODE_USE_${provider}`]).toBe("1");
		expect(call.env[`CLAUDE_CODE_SKIP_${provider}_AUTH`]).toBe("1");
		expect(call.env[endpoint]).toBe("https://provider.example");
		expect(call.env.ANTHROPIC_MODEL).toBeUndefined();
	}
});

const PROVIDER_KEYS = ["ANTHROPIC_AWS_API_KEY", "ANTHROPIC_FOUNDRY_API_KEY", "ANTHROPIC_FOUNDRY_AUTH_TOKEN"];

fakes("Claude gets no provider key over a stored login with no gateway or provider set", async () => {
	const s = setup("CODEX_THREAD_ID");
	for (const key of PROVIDER_KEYS) vi.stubEnv(key, "provider-key");
	expect((await quest("--root", s.repo, "review")).code).toBe(0);
	expect(s.calls().length).toBeGreaterThan(1);
	for (const call of s.calls()) for (const key of PROVIDER_KEYS) expect(call.env[key], key).toBeUndefined();
});

fakes("a provider's keys alone are no login, so the review stops before it starts", async () => {
	const s = setup("CODEX_THREAD_ID");
	for (const key of PROVIDER_KEYS) vi.stubEnv(key, "provider-key");
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	const result = await quest("--root", s.repo, "review", "--harness", "claude");
	expect(result.code).toBe(3);
	expect(result.stderr).toContain("claude is not logged in");
	// No turn runs.
	expect(s.calls().length).toBeGreaterThanOrEqual(1);
	for (const call of s.calls()) expect(call.argv).toEqual(["auth", "status"]);
});

fakes("Claude gets a provider's keys while the provider is set", async () => {
	const s = setup("CODEX_THREAD_ID");
	for (const key of PROVIDER_KEYS) vi.stubEnv(key, "provider-key");
	vi.stubEnv("CLAUDE_CODE_USE_FOUNDRY", "1");
	const result = await quest("--root", s.repo, "review");
	expect(result.code, result.stderr).toBe(0);
	for (const call of s.calls()) for (const key of PROVIDER_KEYS) expect(call.env[key], key).toBe("provider-key");
});

fakes("Codex keeps CODEX_CA_CERTIFICATE always, and CODEX_ACCESS_TOKEN without a stored login", async () => {
	const s = setup();
	vi.stubEnv("CODEX_CA_CERTIFICATE", "/etc/gateway-ca.pem");
	vi.stubEnv("CODEX_ACCESS_TOKEN", "agent-identity");
	expect((await quest("--root", s.repo, "review")).code).toBe(0);
	for (const call of s.calls()) {
		expect(call.env.CODEX_CA_CERTIFICATE).toBe("/etc/gateway-ca.pem");
		expect(call.env.CODEX_ACCESS_TOKEN).toBeUndefined();
	}

	const t = setup();
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	vi.stubEnv("CODEX_CA_CERTIFICATE", "/etc/gateway-ca.pem");
	vi.stubEnv("CODEX_ACCESS_TOKEN", "agent-identity");
	vi.stubEnv("ANTHROPIC_BASE_URL", "https://gateway.example");
	const result = await quest("--root", t.repo, "review");
	expect(result.code, result.stderr).toBe(0);
	expect(t.calls().length).toBeGreaterThan(1);
	for (const call of t.calls().filter((c) => effortOf(c) !== null)) {
		expect(call.env.CODEX_CA_CERTIFICATE).toBe("/etc/gateway-ca.pem");
		expect(call.env.CODEX_ACCESS_TOKEN).toBe("agent-identity");
		expect(call.env.ANTHROPIC_BASE_URL).toBeUndefined();
	}
});

fakes("the reviewer CLI is found on PATH, never in the checkout it reviews", async () => {
	for (const host of ["CLAUDECODE", "CODEX_THREAD_ID"] as const) {
		const s = setup(host);
		// The change under review supplies its own CLIs, and PATH names the checkout relatively.
		const planted = join(s.bin, "..", "planted.log");
		for (const name of ["claude", "codex"]) {
			write(s.repo, name, `#!/bin/sh\necho "$0" >> "${planted}"\nexit 1\n`);
			chmodSync(join(s.repo, name), 0o755);
		}
		git(s.repo, "add", ".");
		git(s.repo, "commit", "-qm", "plant");
		vi.stubEnv("PATH", `.::relative:${s.bin}:${process.env.PATH}:`);
		const result = await quest("--root", s.repo, "review");
		expect(result.stderr).toBe("");
		expect(result.code).toBe(0);
		expect(existsSync(planted)).toBe(false);
		// Nor can the reviewer's own commands find one there.
		for (const call of s.calls())
			expect(call.env.PATH.split(":").every((entry) => entry.startsWith("/"))).toBe(true);
	}
});

fakes("only a clean checkout is reviewed, and a detached one only for a named branch", async () => {
	const s = setup();
	write(s.repo, "src/lib.ts", "export const x = 3;\n");
	expect((await quest("--root", s.repo, "review")).stderr).toContain("uncommitted changes");
	git(s.repo, "checkout", "-q", "--", ".");
	git(s.repo, "checkout", "-q", "--detach");
	const detached = await quest("--root", s.repo, "review");
	expect(detached.code).toBe(2);
	expect(detached.stderr).toContain("HEAD is detached; pass --branch");
	const invalid = await quest("--root", s.repo, "review", "--branch", "a..b");
	expect(invalid.code).toBe(2);
	expect(invalid.stderr).toContain("--branch is not a valid branch name: a..b");
	expect(s.calls()).toEqual([]);
});

// An S PR that Claude Code's session wrote draws the light rung's one other model each round, so these runs stay
// on Codex whatever the host runs of Gemini.
const SMALL = ["--size", "S"];

fakes("a detached checkout continues the rounds of the branch --branch names", async () => {
	const s = setup();
	expect((await quest("--root", s.repo, "review", ...SMALL)).stdout).toContain("round 1\n");
	// Another worktree holds the branch, so its fix is reviewed from a detached checkout of its head.
	git(s.repo, "checkout", "-q", "--detach");
	write(s.repo, "src/lib.ts", "export const x = 4;\n");
	git(s.repo, "commit", "-qam", "fix");
	write(s.repo, ".tmp/responses.md", "Fixed at src/lib.ts:1.\n");
	const responses = join(s.repo, ".tmp", "responses.md");
	const round = await quest("--root", s.repo, "review", ...SMALL, "--branch", "feature", "--responses", responses);
	expect(round.stderr).toBe("");
	expect(round.stdout).toContain("round 2\n");
	// Each round reviews the whole change in a session of its own.
	expect(at(s.calls(), "medium").filter((c) => c.argv[1] === "review")).toHaveLength(2);
});

fakes("a differently named branch continues the rounds --branch names, and without it has its own", async () => {
	const s = setup();
	expect((await quest("--root", s.repo, "review", ...SMALL)).stdout).toContain("round 1\n");
	git(s.repo, "checkout", "-qb", "merge-fix");
	write(s.repo, ".tmp/responses.md", "Fixed at src/lib.ts:1.\n");
	const responses = join(s.repo, ".tmp", "responses.md");
	const named = await quest("--root", s.repo, "review", ...SMALL, "--branch", "feature", "--responses", responses);
	expect(named.stdout).toContain("round 2\n");
	const own = await quest("--root", s.repo, "review", ...SMALL, "--responses", responses);
	expect(own.code).toBe(2);
	expect(own.stderr).toContain("this branch has none to settle");
});

fakes("a branch tracking the PR's branch continues its rounds, and one tracking the base has its own", async () => {
	const s = setup();
	expect((await quest("--root", s.repo, "review", ...SMALL)).stdout).toContain("round 1\n");
	write(s.repo, ".tmp/responses.md", "Fixed at src/lib.ts:1.\n");
	const responses = join(s.repo, ".tmp", "responses.md");
	git(s.repo, "checkout", "-qb", "temp");
	git(s.repo, "config", "branch.temp.remote", "origin");
	git(s.repo, "config", "branch.temp.merge", "refs/heads/feature");
	const tracking = await quest("--root", s.repo, "review", ...SMALL, "--responses", responses);
	expect(tracking.stderr).toBe("");
	expect(tracking.stdout).toContain("round 2\n");
	git(s.repo, "checkout", "-qb", "other");
	git(s.repo, "config", "branch.other.remote", "origin");
	git(s.repo, "config", "branch.other.merge", "refs/heads/main");
	const base = await quest("--root", s.repo, "review", ...SMALL, "--responses", responses);
	expect(base.code).toBe(2);
	expect(base.stderr).toContain("this branch has none to settle");
});

fakes("a detached checkout names the branches at its head to pass as --branch", async () => {
	const s = setup();
	git(s.repo, "checkout", "-q", "--detach");
	const detached = await quest("--root", s.repo, "review");
	expect(detached.code).toBe(2);
	expect(detached.stderr).toContain(
		"pass --branch to name the branch whose review rounds this continues, such as --branch feature",
	);
});

fakes.each(["CLAUDECODE", "CODEX_THREAD_ID"] as const)(
	"a branch behind its base is reviewed from its merge base (host %s)",
	async (host) => {
		const s = setup(host);
		const mergeBase = git(s.repo, "rev-parse", "origin/main");
		// The base gains a docs change the branch lacks, which a diff against its tip shows as reverted.
		const tip = moveBase(s.repo, (dir) => write(dir, "docs/guide.md", "new\n"));
		const head = git(s.repo, "rev-parse", "HEAD");
		const result = await quest("--root", s.repo, "review");
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain(`base ${tip} origin/main\n`);

		const [first, second] = at(s.calls(), host === "CLAUDECODE" ? "high" : "medium");
		if (host === "CLAUDECODE") {
			expect(first.argv.slice(0, 3)).toEqual(["exec", "review", "--json"]);
			expect(first.argv.at(-1)).toBe("-");
		} else {
			expect(first.stdin.startsWith(`/code-review medium ${mergeBase}...HEAD "`)).toBe(true);
			expect(first.argv[first.argv.indexOf("--effort") + 1]).toBe("medium");
		}
		// The review turn names the range itself, and the report turn only shapes its result.
		expect(first.stdin).toContain(`\`git diff ${mergeBase}..${head}\``);
		expect(second.stdin).toContain("Read no files and run no commands");
		// Only the change's own directories bring their instructions.
		for (const call of [first, second]) expect(JSON.stringify(call.argv)).not.toContain("BASE-DOCS rule");
	},
);

fakes("codex reviews read-only with the base's instructions, then reports in the schema", async () => {
	const s = setup();
	const result = await quest("--root", s.repo, "review");
	expect(result.stderr).toBe("");
	expect(result.code).toBe(0);
	const head = git(s.repo, "rev-parse", "HEAD");
	const base = git(s.repo, "rev-parse", "origin/main");
	expect(result.stdout).toBe(
		[
			"size M default",
			`base ${base} origin/main`,
			`head ${head}`,
			// The fixture's base has no RISK.md, so no model classifies the change.
			"risk medium the base has no RISK.md to name what is always high or customer-facing, so every change is medium",
			"classified medium default the base has no RISK.md to name what is always high or customer-facing, so every change is medium",
			"",
			"reviewer codex gpt-6.2-sol high",
			// The run drew the size's own rung.
			"rung standard size",
			"session thread-1",
			"round 1",
			"usage findings input 100 cached 80 output 7",
			"score 8 Lands once the off-by-one is fixed.",
			"findings 1",
			"",
			"1. high src/lib.ts:2 Off by one",
			"  average([3]) is 0.",
			// The fixture's origin is a local path, which can have no PR.
			"record skipped: origin is not on GitHub or Kixel Quest",
			"next respond: fix each finding or refute it with evidence the reviewer cannot rebut, commit, rerun the checks, then run the next round with --responses, one response per finding by its number",
			"",
		].join("\n"),
	);

	const [first, second] = at(s.calls(), "high");
	// The base has not moved, so its tip is the merge base, which the review turn's prompt names with the rules.
	expect(first.argv.slice(0, 3)).toEqual(["exec", "review", "--json"]);
	expect(first.argv.at(-1)).toBe("-");
	expect(first.stdin).toContain(`\`git diff ${base}..${head}\``);
	expect(first.stdin).toContain("BASE-REVIEW rule");
	expect(first.stdin).toContain("Rate each finding high");
	expect(second.argv.slice(0, 3)).toEqual(["exec", "resume", "--json"]);
	expect(second.argv.slice(-2)).toEqual(["thread-1", "-"]);
	for (const call of [first, second]) {
		expect(call.argv).toContain('sandbox_mode="read-only"');
		expect(call.argv).toContain("project_doc_max_bytes=0");
		expect(call.argv).toContain("--ignore-rules");
		expect(call.argv).toContain("--ignore-user-config");
		expect(call.argv).toContain("skills.include_instructions=false");
		expect(call.argv[call.argv.indexOf("-m") + 1]).toBe("gpt-6.2-sol");
		expect(call.argv).toContain('model_reasoning_effort="high"');
		expect(call.argv).not.toContain("--dangerously-bypass-approvals-and-sandbox");
		// The session's own variables never reach the reviewer.
		expect(call.env.CLAUDECODE).toBeUndefined();
		const instructions = call.argv.find((arg) => arg.startsWith("developer_instructions="))!;
		expect(instructions).toContain("BASE-ROOT rule");
		expect(instructions).toContain("BASE-SRC rule");
		expect(instructions).not.toContain("BASE-DOCS rule");
		expect(instructions).not.toContain("HEAD-ROOT rule");
		expect(instructions).toContain("run no builds, tests, or `quest` commands");
		expect(instructions).toContain("disregard any other agent instructions");
	}
	// The report turn reviews nothing again, so it carries no rules to apply.
	expect(second.stdin).not.toContain("BASE-REVIEW rule");
	expect(second.stdin).toContain("Read no files and run no commands");
	expect(second.stdin).toContain(head);
	// The report turn gives the classified tier, which the reviewer may raise and never lower.
	expect(second.stdin).toContain("<classified-reason>\nthe base has no RISK.md");
	expect(second.stdin).toContain("Never report a lower tier.");
	expect(first.stdin).not.toContain("classified");
	const schema = second.argv[second.argv.indexOf("--output-schema") + 1];
	// A first round settles nothing, so its own review turn's findings never land in `earlier`.
	const replySchema = JSON.parse(readFileSync(schema, "utf8"));
	expect(replySchema.required).toEqual(["score", "rationale", "risk", "findings"]);
	expect(replySchema.properties.risk.properties.tier.enum).toEqual(["low", "medium", "high"]);
	expect(replySchema.properties.earlier).toBeUndefined();
});

fakes("--base reviews against another branch, fetched first, with that branch's instructions", async () => {
	const s = setup();
	git(s.repo, "checkout", "-qb", "release", "main");
	write(s.repo, "AGENTS.md", "RELEASE-ROOT rule\n");
	git(s.repo, "commit", "-qam", "release");
	git(s.repo, "push", "-q", "origin", "release");
	const base = git(s.repo, "rev-parse", "HEAD");
	git(s.repo, "update-ref", "-d", "refs/remotes/origin/release");
	git(s.repo, "checkout", "-qb", "backport");
	write(s.repo, "src/lib.ts", "export const x = 5;\n");
	git(s.repo, "commit", "-qam", "backport");

	const result = await quest("--root", s.repo, "review", "--base", "origin/release");
	expect(result.code).toBe(0);
	expect(result.stdout).toContain(`base ${base} origin/release\n`);
	const [first] = at(s.calls(), "high");
	expect(first.stdin).toContain(`\`git diff ${base}..`);
	const instructions = first.argv.find((arg) => arg.startsWith("developer_instructions="))!;
	expect(instructions).toContain("RELEASE-ROOT rule");
	expect(instructions).not.toContain("BASE-ROOT rule");

	const unknown = await quest("--root", s.repo, "review", "--base", "upstream/release", "--new");
	expect(unknown.code).toBe(2);
	expect(unknown.stderr).toContain("--base must be <remote>/<branch>");
});

test.skipIf(caseInsensitive)(
	"agy's read rules leave every path outside the turn's directory under a denied one, and none inside",
	() => {
		const dir = realpathSync(tempDir());
		for (const path of ["a/x/in.txt", "a/y/out.txt", "a/x-sibling/out.txt", "c/out.txt", "top.txt"])
			write(dir, path, "");
		symlinkSync(join(dir, "c"), join(dir, "a", "x", "link"));
		// Paths that may appear during a turn: one beside the root, one its parent, and one inside it.
		const later = ["d/login.json", "a", "a/x/new.txt"].map((path) => join(dir, path));
		const denied = beside(join(dir, "a", "x"), later);
		expect(denied).toContain(join(dir, "d/login.json"));
		expect(denied).not.toContain(join(dir, "a"));
		expect(denied).not.toContain(join(dir, "a/x/new.txt"));
		// Antigravity matches a rule by whole components, so `a/x` never covers `a/x-sibling`.
		const blocked = (path: string) => denied.some((rule) => path === rule || path.startsWith(`${rule}/`));
		expect(blocked(join(dir, "a/x/in.txt"))).toBe(false);
		for (const path of ["a/y/out.txt", "a/x-sibling/out.txt", "c/out.txt", "top.txt"])
			expect(blocked(join(dir, path)), path).toBe(true);
		// A link inside the root resolves outside it, where the rule beside its target matches.
		expect(blocked(realpathSync(join(dir, "a", "x", "link", "out.txt")))).toBe(true);
		// Above the tree too, as the system's own directories.
		const top = dir.split("/")[1]!;
		for (const name of readdirSync("/").filter((name) => name !== top))
			expect(blocked(`/${name}`), name).toBe(true);
	},
);

test.skipIf(caseInsensitive)(
	"agy's read rules refuse a directory that matches names case-insensitively, since agy's rules do not",
	() => {
		const dir = realpathSync(tempDir());
		write(dir, "a/x/in.txt", "");
		write(dir, "a/Name", "");
		// A link reaching the same entry with the case swapped, as a case-insensitive volume resolves any name.
		linkSync(join(dir, "a", "Name"), join(dir, "a", "nAME"));
		expect(() => beside(join(dir, "a", "x"))).toThrow(`since ${join(dir, "a")} matches names case-insensitively`);
		// Two entries that differ only in case are a case-sensitive directory.
		rmSync(join(dir, "a", "nAME"));
		write(dir, "a/nAME", "");
		expect(beside(join(dir, "a", "x"))).toContain(join(dir, "a", "nAME"));
	},
);

test.skipIf(caseInsensitive)(
	"agy's export fetches what a partial clone lacks of the head, in one batch, in the caller's runtime directory",
	() => {
		const dir = realpathSync(tempDir());
		const run = (cwd: string, ...args: string[]) =>
			execFileSync("git", ["-C", cwd, ...args], {
				encoding: "utf8",
				env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
			});
		const source = join(dir, "source");
		run(dir, "init", "-q", source);
		write(source, "top.txt", "top\n");
		write(source, "sub/inner.txt", "inner\n");
		run(source, "add", "-A");
		run(source, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "one");
		run(source, "config", "uploadpack.allowFilter", "true");
		run(source, "config", "uploadpack.allowAnySHA1InWant", "true");
		const part = join(dir, "part");
		run(dir, "clone", "-q", "--no-local", "--filter=blob:none", "--sparse", `file://${source}`, part);
		const head = run(part, "rev-parse", "HEAD").trim();
		// The sparse checkout leaves sub/inner.txt's blob behind.
		expect(run(part, "rev-list", "--objects", "--missing=print", "--no-walk", head)).toMatch(/^\?/m);
		const call = agyTurn(
			{
				mergeBase: head,
				root: part,
				head,
				ranges: [],
				instructions: "",
				model: "m",
				effort: "low",
				schema: {},
				schemaFile: "",
				// The caller's environment, not the process's, places the turn.
				env: { ...process.env, XDG_RUNTIME_DIR: join(dir, "run") },
			},
			"",
			[],
		);
		try {
			expect(call.workspace!.dir.startsWith(join(dir, "run", "quest", "agent", "review-"))).toBe(true);
			expect(readFileSync(join(call.workspace!.dir, "head", "sub", "inner.txt"), "utf8")).toBe("inner\n");
		} finally {
			rmSync(call.workspace!.dir, { recursive: true, force: true });
		}
	},
);

// Root lists any directory, so the refusal only shows for another user.
test.skipIf(process.getuid?.() === 0 || caseInsensitive)("agy's read rules refuse a parent they cannot list", () => {
	const dir = realpathSync(tempDir());
	write(dir, "hidden/turn/in.txt", "");
	chmodSync(join(dir, "hidden"), 0o311);
	try {
		expect(() => beside(join(dir, "hidden", "turn"))).toThrow(`since ${join(dir, "hidden")} cannot be listed`);
	} finally {
		chmodSync(join(dir, "hidden"), 0o755);
	}
});

test("review refuses max effort", async () => {
	const result = await quest("review", "--harness", "claude", "--model", "opus", "--effort", "max");
	expect(result.code).toBe(2);
	expect(result.stderr).toContain("max is never run");
});

test("reviewPrompt always includes shared review rules and layers repo REVIEW.md after them", () => {
	const change = { base: "origin/main", mergeBase: "aaa", head: "bbb" };
	const withoutRepo = reviewPrompt(change, null);
	expect(withoutRepo).toContain("<shared-review-rules>");
	expect(withoutRepo).toContain("# Shared review rules");
	expect(withoutRepo).not.toContain("<review-rules>");

	const withRepo = reviewPrompt(change, { sha: "ccc", text: "Repo-only invariant." });
	expect(withRepo).toContain("<shared-review-rules>");
	expect(withRepo).toContain("<review-rules>\nRepo-only invariant.\n</review-rules>");
	expect(withRepo.indexOf("<shared-review-rules>")).toBeLessThan(withRepo.indexOf("<review-rules>"));
});

fakes("claude reviews read-only with the base's instructions, then reports in the schema", async () => {
	const s = setup("CODEX_THREAD_ID");
	// The rules travel inside the command's one double-quoted argument.
	moveBase(s.repo, (dir) => write(dir, "REVIEW.md", 'Flag "magic" numbers \\ constants.\n'));
	const args = ["--model", "opus", "--effort", "low", "--size", "XS", "--json"];
	const result = await quest("--root", s.repo, "review", ...args);
	expect(result.code).toBe(0);
	const [round] = JSON.parse(result.stdout).rounds;
	expect(round.reviewer).toBe("claude");
	expect(round.model).toBe("opus");
	expect(round.effort).toBe("low");
	expect(round.usage).toEqual([
		{ turn: "review", input: 101, cached: 0, output: 51 },
		{ turn: "findings", input: 100, cached: 80, output: 7 },
	]);
	expect(round.score).toBe(8);
	expect(round.rationale).toBe("Lands once the off-by-one is fixed.");
	expect(round.findings).toEqual([FINDING]);

	const [status, first, second] = s.calls();
	expect(status.argv).toEqual(["auth", "status"]);
	const mergeBase = git(s.repo, "merge-base", "origin/main", "HEAD");
	expect(first.stdin.startsWith(`/code-review low ${mergeBase}...HEAD "`)).toBe(true);
	expect(first.stdin.endsWith('"')).toBe(true);
	expect(first.stdin).toContain("<shared-review-rules>");
	expect(first.stdin).toContain('Flag \\"magic\\" numbers \\\\ constants.');
	expect(first.argv).not.toContain("--json-schema");
	expect(second.argv).toContain("--json-schema");
	expect(second.argv[second.argv.indexOf("--resume") + 1]).toBe(first.argv[first.argv.indexOf("--session-id") + 1]);
	for (const call of [first, second]) {
		const at = (flag: string) => call.argv[call.argv.indexOf(flag) + 1];
		expect(at("--permission-mode")).toBe("dontAsk");
		// No settings file, so not even the user's own allow rules apply.
		expect(at("--setting-sources")).toBe("");
		expect(at("--tools")).toBe("Read,Grep,Glob,Bash,Agent");
		// No other session steers a round, though no settings file loads.
		expect(at("--settings")).toBe('{"crossSessionInbound":"refuse"}');
		expect(at("--model")).toBe("opus");
		expect(at("--effort")).toBe("low");
		expect(at("--append-system-prompt")).toContain("BASE-ROOT rule");
		expect(at("--append-system-prompt")).not.toContain("HEAD-ROOT rule");
		expect(call.env.CODEX_THREAD_ID).toBeUndefined();
		expect(call.env.CLAUDE_CODE_PROMPT_CACHE_TTL).toBe("1h");
	}
});

const AGY = ["--harness", "agy", "--model", "gemini-4-neon", "--effort", "high"];

agyFakes(
	"agy reviews from a directory of its own, reading an export of the head, then reports in the schema",
	async () => {
		const s = setup("CLAUDECODE");
		// A head that would hide a file from an archive or its hunks from the diff, run one of the user's filter drivers,
		// and link out of the export, with a path git would quote, beside a file the checkout ignores.
		const login = join(realpathSync(homedir()), ".codex");
		write(s.repo, ".gitattributes", "src/lib.ts export-ignore -diff\n* filter=plant\n");
		symlinkSync(login, join(s.repo, "link"));
		write(s.repo, "docs/café.md", "Accented.\n");
		git(s.repo, "add", ".gitattributes", "link", "docs");
		git(s.repo, "commit", "-qm", "attributes");
		const smudged = join(s.repo, ".tmp", "smudged");
		git(s.repo, "config", "filter.plant.smudge", `touch ${smudged}; cat`);
		// The user's own attributes name the filter too, and their default attributes file converts line endings,
		// neither of which the export applies.
		write(s.repo, ".git/info/attributes", "* filter=plant\n");
		const config = join(s.bin, "..", "config");
		write(config, "git/attributes", "*.ts eol=crlf\n");
		vi.stubEnv("XDG_CONFIG_HOME", config);
		write(s.repo, ".tmp/secret.env", "UNTRACKED-SECRET\n");
		// An Antigravity session's own state and an Antigravity gateway never reach the reviewer.
		vi.stubEnv("ANTIGRAVITY_LS_ADDRESS", "127.0.0.1:1");
		vi.stubEnv("AGY_LLM_GATEWAY_URL", "http://127.0.0.1:9");
		const result = await quest("--root", s.repo, "review", ...AGY, "--json");
		expect(result.code, result.stderr).toBe(0);
		const [round] = JSON.parse(result.stdout).rounds;
		expect(round).toMatchObject({ reviewer: "agy", model: "gemini-4-neon", effort: "high", score: 8 });
		expect(round.findings).toEqual([FINDING]);
		// Input counts the cached tokens, which agy reports apart; output already holds thinking.
		expect(round.usage).toEqual([
			{ turn: "review", input: 100, cached: 10, output: 50 },
			{ turn: "findings", input: 100, cached: 80, output: 7 },
		]);

		const [status, first, second] = s.calls();
		expect(status!.argv).toEqual(["models"]);
		// Even the status check runs outside the checkout.
		expect(status!.cwd.startsWith(s.repo)).toBe(false);
		expect(existsSync(status!.cwd)).toBe(false);
		const mergeBase = git(s.repo, "merge-base", "origin/main", "HEAD");
		const head = git(s.repo, "rev-parse", "HEAD");
		expect(first!.argv).not.toContain("--json-schema");
		expect(first!.argv).not.toContain("--conversation");
		expect(first!.stdin).toContain("Review the change for what it breaks");
		expect(second!.argv[second!.argv.indexOf("--conversation") + 1]).toBe("conversation-1");
		const schemaFile = second!.argv[second!.argv.indexOf("--json-schema") + 1]!;
		expect(JSON.parse(readFileSync(schemaFile, "utf8")).required).toContain("risk");
		const repo = realpathSync(s.repo);
		// What the head tracks, apart from what the checkout ignores or keeps in .git.
		const tracked = git(s.repo, "ls-tree", "-r", "-z", "--name-only", "HEAD").split("\0").filter(Boolean).sort();
		expect(tracked).toContain("docs/café.md");
		// The report turn reads nothing, so only the review turn gets the head's export.
		expect(
			Object.keys(second!.workspace!).filter((name) => name.startsWith("head/") || name === "files.txt"),
		).toEqual([]);
		for (const call of [first!, second!]) {
			const flag = (name: string) => call.argv[call.argv.indexOf(name) + 1];
			// The turn runs in a workspace inside its own directory, which holds the head's export beside it.
			const dir = dirname(call.cwd);
			expect(call.cwd).toBe(join(dir, "workspace"));
			expect(call.argv.slice(0, 3)).toEqual(["-p", "", "--input-format"]);
			expect(flag("--agent")).toBe("quest-reviewer");
			expect(call.argv).toContain("--dangerously-skip-permissions");
			expect(call.argv).toContain("--disable-slash-commands");
			expect(flag("--settings")).toBe(join(dir, "settings.json"));
			const deny: string[] = JSON.parse(call.workspace!["settings.json"]!).permissions.deny;
			expect(deny).toEqual(expect.arrayContaining(["command(*)", "write_file(*)", "read_url(*)", "mcp(*)"]));
			// Reads stay in the turn's directory: the checkout and what lies beside it are denied, and nothing in it.
			const reads = deny.filter((rule) => rule.startsWith("read_file(")).map((rule) => rule.slice(10, -1));
			const blocked = (path: string) => reads.some((rule) => path === rule || path.startsWith(`${rule}/`));
			for (const path of [repo, join(repo, ".git", "config"), join(dirname(repo), "origin.git")])
				expect(blocked(path), path).toBe(true);
			// A login created while the turn runs, as by signing in to Codex, is denied before it exists.
			expect(blocked(join(realpathSync(homedir()), ".codex"))).toBe(true);
			// The rules list what lies beside the directory, so its settings file is denied too, and nothing else in it.
			expect(reads.filter((rule) => rule === dir || rule.startsWith(`${dir}/`))).toEqual([
				join(dir, "settings.json"),
			]);
			expect(blocked(join(dir, "head", "src", "lib.ts"))).toBe(false);
			expect(flag("--model")).toBe("gemini-4-neon");
			expect(flag("--effort")).toBe("high");
			// It runs outside the checkout, in a directory removed after the turn.
			expect(call.cwd.startsWith(s.repo)).toBe(false);
			expect(existsSync(dir)).toBe(false);
			const agent = call.workspace!["workspace/.agents/agents/quest-reviewer.md"]!;
			expect(agent).toContain("tools:\n  - view_file\n  - finish\n");
			expect(agent).toContain("inheritCustomizations: false");
			expect(agent).toContain("BASE-ROOT rule");
			expect(agent).not.toContain("HEAD-ROOT rule");
			if (call === second) continue;
			// The export holds exactly the head's tracked files, as committed, and the list names each, unquoted.
			const exported = Object.keys(call.workspace!)
				.filter((name) => name.startsWith("head/"))
				.map((name) => name.slice("head/".length))
				.sort();
			expect(exported).toEqual(tracked);
			expect(call.workspace!["files.txt"]!.split("\n").sort()).toEqual(tracked);
			expect(call.workspace!["head/src/lib.ts"]).toBe("export const x = 2;\n");
			// A link is a file holding its target, which no filter driver touched.
			expect(call.workspace!["head/link"]).toBe(login);
			expect(existsSync(smudged)).toBe(false);
			expect(call.stdin).not.toContain(s.repo);
			// A resumed conversation still names the first turn's removed directory, so each file is named in full.
			expect(call.stdin).toContain(`tracked files are in \`${dir}/head\`, which \`${dir}/files.txt\` lists`);
		}
		for (const call of [first!, second!]) {
			const dir = dirname(call.cwd);
			// The head's `-diff` hides none of its hunks, and a path is written as the export names it.
			expect(call.workspace!["diff-1.diff"]).toContain("+export const x = 2;");
			expect(call.workspace!["diff-1.diff"]).toContain("+++ b/docs/café.md");
			expect(call.stdin).toContain(`\`${dir}/diff-1.diff\` holds \`git diff ${mergeBase}..${head}\``);
			expect(Object.keys(call.env).filter((name) => /^(ANTIGRAVITY|AGY)_/.test(name))).toEqual([]);
		}

		// A later round starts a conversation of its own and reads the whole change again, never a diff from the
		// head the last one reviewed.
		write(s.repo, "src/lib.ts", "export const x = 4;\n");
		git(s.repo, "commit", "-qam", "fix");
		const responses = join(s.repo, ".tmp", "responses.md");
		write(s.repo, ".tmp/responses.md", "Fixed at src/lib.ts:1.\n");
		const later = await quest("--root", s.repo, "review", ...AGY, "--responses", responses);
		expect(later.code, later.stderr).toBe(0);
		const [again] = s.calls().slice(-2);
		expect(again!.argv).not.toContain("--conversation");
		expect(again!.stdin).toContain("Review the change for what it breaks");
		expect(again!.stdin).toContain("Fixed at src/lib.ts:1.");
		expect(Object.keys(again!.workspace!)).not.toContain("diff-2.diff");
		expect(again!.workspace!["head/src/lib.ts"]).toBe("export const x = 4;\n");
	},
);

agyFakes.for([
	["FAKE_LOGGED_OUT", "1", "error: agy is not logged in; run `agy`"],
	["FAKE_REJECTED", "1", "error: agy is not logged in; run `agy`"],
	["FAKE_LIMITED", "reset", "error: agy hit its usage limit; resets 2030-03-17T17:46:40Z"],
	["FAKE_LIMITED", "unknown", "error: agy hit its usage limit; resets unknown"],
	["FAKE_LIMITED", "stderr", "error: agy hit its usage limit; resets 2030-03-17T17:46:40Z"],
	["FAKE_EMPTY_ERROR", "1", "quest: agy failed: agy reported ERROR"],
	["FAKE_DENIED", "1", "quest: agy failed: agy denied command, which ended the turn"],
] as const)(
	"agy's login, quota, and denied actions fail its round as the real CLI reports them (%s=%s)",
	async ([flag, value, message]) => {
		const s = setup("CLAUDECODE");
		vi.stubEnv(flag, value);
		const result = await quest("--root", s.repo, "review", ...AGY);
		expect(result.stderr).toBe(`${message}\n`);
		expect(result.code).toBe(flag === "FAKE_DENIED" || flag === "FAKE_EMPTY_ERROR" ? 1 : 3);
	},
);

agyFakes("agy is refused where a directory leading to its workspace matches names case-insensitively", async () => {
	const s = setup("CLAUDECODE");
	// A link reaching the same entry with the case swapped, as a case-insensitive volume resolves any name.
	const parent = join(s.bin, "..", "insensitive");
	write(parent, "Name", "");
	linkSync(join(parent, "Name"), join(parent, "nAME"));
	vi.stubEnv("XDG_RUNTIME_DIR", join(parent, "run"));
	const result = await quest("--root", s.repo, "review", ...AGY);
	expect(result.code, result.stderr).toBe(3);
	expect(result.stderr).toContain(`since ${realpathSync(parent)} matches names case-insensitively`);
	expect(s.calls().filter((call) => call.argv[0] !== "models")).toEqual([]);
});

agyFakes("agy is refused with a Git older than 2.41, which has no --attr-source", async () => {
	const s = setup("CLAUDECODE");
	const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
	write(
		s.bin,
		"git",
		`#!/bin/sh\nif [ "$1" = version ]; then echo "git version 2.40.1"; exit 0; fi\nexec "${real}" "$@"\n`,
	);
	chmodSync(join(s.bin, "git"), 0o755);
	const result = await quest("--root", s.repo, "review", ...AGY);
	expect(result.code, result.stderr).toBe(3);
	expect(result.stderr).toContain("agy needs Git 2.41 or later");
	expect(result.stderr).toContain("git version 2.40.1 is installed");
	expect(s.calls().filter((call) => call.argv[0] !== "models")).toEqual([]);
});

agyFakes("agy's status check failing other than on its login fails as it is, rather than as logged out", async () => {
	const s = setup("CLAUDECODE");
	vi.stubEnv("FAKE_OFFLINE", "1");
	const result = await quest("--root", s.repo, "review", ...AGY);
	expect(result.code).toBe(1);
	expect(result.stderr).toContain("`agy models` failed: Fetching available models...\nError: dial tcp: lookup");
	expect(result.stderr).not.toContain("not logged in");
});

agyFakes(
	"a workspace inside a repository is refused before agy runs, since agy would load its configuration",
	async () => {
		const s = setup("CLAUDECODE");
		vi.stubEnv("XDG_RUNTIME_DIR", join(s.repo, ".tmp", "run"));
		const result = await quest("--root", s.repo, "review", ...AGY);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain(`lies in the repository at ${s.repo}`);
		expect(s.calls().filter((call) => call.argv[0] !== "models")).toEqual([]);
	},
);

// Fable wrote it, so an M PR's rounds draw among Sol and Opus; Gemini stays out, as with OPUS_WROTE.
const FABLE_WROTE = ["--exclude-model", "claude-fable-5-2", "--exclude-model", "gemini-4-neon"];

fakes("a later round seats a model the branch has not had, which settles the findings and reviews it all", async () => {
	const s = setup(null);
	const first = await quest("--root", s.repo, "review", ...FABLE_WROTE, "--json");
	expect(JSON.parse(first.stdout).rounds.map((r: Round) => r.model)).toEqual(["gpt-6.2-sol"]);
	const missing = await quest("--root", s.repo, "review", ...FABLE_WROTE);
	expect(missing.code).toBe(2);
	expect(missing.stderr).toContain("the last round reported 1 finding(s); pass --responses");

	const reviewed = git(s.repo, "rev-parse", "HEAD");
	write(s.repo, "src/lib.ts", "export const x = 4;\n");
	git(s.repo, "commit", "-qam", "fix");
	const responses = join(s.repo, ".tmp", "responses.md");
	write(s.repo, ".tmp/responses.md", "Fixed at src/lib.ts:1.\n");
	vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
	const later = await quest("--root", s.repo, "review", ...FABLE_WROTE, "--responses", responses);
	expect(later.code, later.stderr).toBe(0);
	// Sol reviewed the branch already, so the standard rung's other model takes the round.
	expect(later.stdout).toContain("\nreviewer claude claude-opus-5-5 medium\nrung standard size\nsession ");
	expect(later.stdout).toContain("\nround 2\n");
	expect(later.stdout).toContain("findings 0\n");
	expect(later.stdout).toMatch(/\nnext done: no findings remain on this head\n$/);
	// The round settles the last round's finding, by its number in the prompt.
	expect(later.stdout).toContain(
		`earlier 1 ${reviewed}\n\n1. fixed high src/lib.ts:2 Off by one\n  Checked against the head.\n`,
	);

	// Its session is its own: the review turn starts one, which only its report turn resumes.
	const [review, report] = at(s.calls(), "medium");
	const session = review!.argv[review!.argv.indexOf("--session-id") + 1];
	expect(session).toBeDefined();
	expect(report!.argv[report!.argv.indexOf("--resume") + 1]).toBe(session);
	const bounded = JSON.parse(report!.argv[report!.argv.indexOf("--json-schema") + 1]!);
	expect(bounded.required).toEqual(["score", "rationale", "risk", "findings", "earlier"]);
	// It is given the last round's findings and the author's responses, then reviews the whole change under the rules.
	const head = git(s.repo, "rev-parse", "HEAD");
	const prompt = review!.argv.at(-1) + review!.stdin;
	expect(prompt).toContain("Fixed at src/lib.ts:1.");
	expect(prompt).toContain(
		"<earlier-findings>\n1. high src/lib.ts:2 Off by one\n   average([3]) is 0.\n</earlier-findings>",
	);
	expect(prompt).toContain("by another reviewer in another session");
	expect(prompt).toContain("Then review the whole change anew");
	expect(prompt).toContain("BASE-REVIEW rule");
	expect(prompt).toContain(`\`git diff ${git(s.repo, "rev-parse", "origin/main")}..${head}\``);
	// The new head is classified again before the round, which gives it to the reviewer.
	expect(report!.stdin).toContain("the change was classified medium risk");
	expect(report!.stdin).toContain(
		"<earlier-findings>\n1. high src/lib.ts:2 Off by one\n   average([3]) is 0.\n</earlier-findings>",
	);

	// The rung has no model left that the branch has not had, so the one whose round is the oldest reviews again.
	write(s.repo, "src/lib.ts", "export const x = 5;\n");
	git(s.repo, "commit", "-qam", "more");
	const third = JSON.parse((await quest("--root", s.repo, "review", ...FABLE_WROTE, "--json")).stdout);
	expect(third.rounds.map((r: Round) => [r.model, r.round, r.earlier])).toEqual([["gpt-6.2-sol", 3, null]]);
	// Each model keeps its own tally, and Sol's names both of its sessions.
	expect(third.tallies.map((t: Tally) => [t.model, t.rounds, t.last, t.sessions.length, t.fixed])).toEqual([
		["gpt-6.2-sol", 2, 3, 2, 1],
		["claude-opus-5-5", 1, 2, 1, 0],
	]);
});

fakes("--new drops the last round's findings, and a first round takes no responses", async () => {
	const s = setup();
	expect((await quest("--root", s.repo, "review", ...SMALL)).code).toBe(0);
	write(s.repo, ".tmp/responses.md", "Fixed at src/lib.ts:1.\n");
	const responses = join(s.repo, ".tmp", "responses.md");
	const fresh = await quest("--root", s.repo, "review", ...SMALL, "--new", "--responses", responses);
	expect(fresh.code).toBe(2);
	expect(fresh.stderr).toContain("this branch has none to settle");
	const restarted = JSON.parse((await quest("--root", s.repo, "review", ...SMALL, "--new", "--json")).stdout);
	// The branch's runs go on counting, and nothing is left to settle.
	expect(restarted.rounds.map((r: Round) => [r.round, r.earlier])).toEqual([[2, null]]);
	// The reviewer's tally continues, less the finding the first run left, which was dropped unsettled.
	expect(
		restarted.tallies.map((t: Tally) => [t.model, t.rounds, t.findings.high, t.fixed, t.sessions.length]),
	).toEqual([["gpt-6.2-sol", 2, 1, 0, 2]]);
});

/** Commit `edit` to origin's `next` branch, leaving the checkout on `feature`; no flags change. */
function moveNext(repo: string, edit: () => void): string[] {
	git(repo, "checkout", "-q", "next");
	edit();
	git(repo, "commit", "-qam", "move next");
	git(repo, "push", "-q", "origin", "next");
	git(repo, "checkout", "-q", "feature");
	return [];
}

fakes.each([
	["a changed REVIEW.md", (repo: string) => moveNext(repo, () => write(repo, "REVIEW.md", "NEW rule\n"))],
	["a removed REVIEW.md", (repo: string) => moveNext(repo, () => git(repo, "rm", "-q", "REVIEW.md"))],
	["an older base", (_: string) => ["--base", "origin/main"]],
] as const)(
	"a head the last run passed is reviewed again once %s gives it other rules or another base",
	async (_, change) => {
		const s = setup();
		vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
		// The branch merges a base ahead of main, which the first round reviews against.
		git(s.repo, "checkout", "-qb", "next", "main");
		write(s.repo, "notes.md", "next\n");
		git(s.repo, "add", ".");
		git(s.repo, "commit", "-qm", "next");
		git(s.repo, "push", "-q", "origin", "next");
		git(s.repo, "checkout", "-q", "feature");
		git(s.repo, "merge", "-q", "--no-edit", "next");
		const first = await quest("--root", s.repo, "review", ...SMALL, "--base", "origin/next");
		expect(first.code, first.stderr).toBe(0);
		const flags = change(s.repo);
		const base = flags.includes("--base") ? [] : ["--base", "origin/next"];
		const round = await quest("--root", s.repo, "review", ...SMALL, ...base, ...flags);
		expect(round.code, round.stderr).toBe(0);
		expect(round.stdout).toContain("round 2\n");
		expect(round.stdout).not.toContain("unchanged");
		expect(at(s.calls(), "medium").at(-2)!.argv[1]).toBe("review");
	},
);

/**
 * Point the fixture's origin at `acme/widget` on GitHub, still fetched from its local copy, and answer the
 * API with `pulls` as the open PRs from `acme:<branch>` into main. With `fork`, `acme/widget` is a fork of
 * `upstream/widget`, whose root holds the quest tree, and the PRs are upstream's. Returns the PR bodies
 * each PATCH wrote.
 */
/** An open PR from `feature` into `main`, from `acme/widget` unless `head` names another repository. */
type FakePull = { number: number; body: string | null; head?: string; sha?: string };
function onGitHub(repo: string, pulls: FakePull[], fork = false): { body: string }[] {
	const local = git(repo, "remote", "get-url", "origin");
	git(repo, "remote", "set-url", "origin", "https://github.com/acme/widget.git");
	git(repo, "config", `url.${local}.insteadOf`, "https://github.com/acme/widget.git");
	const owner = fork ? "upstream" : "acme";
	const writes: { body: string }[] = [];
	const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
	const info = (login: string, parent: string | null) => ({
		owner: { login },
		name: "widget",
		fork: parent !== null,
		...(parent === null ? {} : { parent: { owner: { login: parent }, name: "widget" } }),
		default_branch: "main",
		clone_url: `https://github.com/${login}/widget.git`,
		ssh_url: `git@github.com:${login}/widget.git`,
	});
	vi.stubEnv("GH_TOKEN", "token");
	vi.stubGlobal("fetch", async (input: URL, init?: RequestInit) => {
		const url = new URL(input);
		if (url.pathname === "/repos/acme/widget") return json(info("acme", fork ? "upstream" : null));
		if (url.pathname === "/repos/upstream/widget") return json(info("upstream", null));
		if (url.pathname.startsWith("/repos/upstream/widget/contents/"))
			return url.pathname.endsWith("/contents/quest/README.md") ? json({}) : json({}, 404);
		if (url.pathname === `/repos/${owner}/widget/pulls`) {
			expect(url.searchParams.get("state")).toBe("open");
			const row = ({ head, sha, ...p }: FakePull, ref: string, base: string) => ({
				...p,
				html_url: `https://github.com/${owner}/widget/pull/${p.number}`,
				head: { ref, repo: { full_name: head ?? "acme/widget" }, ...(sha === undefined ? {} : { sha }) },
				base: { ref: base },
				draft: false,
				created_at: "2026-10-01T00:00:00Z",
				updated_at: "2026-10-01T00:00:00Z",
			});
			// The record's PR among others: one from another branch, and one from the same branch into another base.
			return json([
				...pulls.map((p) => row(p, "feature", "main")),
				row({ number: 90, body: "other" }, "other", "main"),
				row({ number: 91, body: "other" }, "feature", "release"),
			]);
		}
		const patched = new RegExp(`^/repos/${owner}/widget/pulls/(\\d+)$`).exec(url.pathname);
		if (patched && init?.method === "PATCH") {
			const { body } = JSON.parse(String(init.body)) as { body: string };
			writes.push({ body });
			pulls.find((p) => p.number === Number(patched[1]))!.body = body;
			return json({});
		}
		if (patched && (init?.method ?? "GET") === "GET")
			return json({ body: pulls.find((p) => p.number === Number(patched[1]))!.body });
		throw new Error(`unexpected ${init?.method ?? "GET"} ${url.pathname}`);
	});
	return writes;
}

fakes("each round rewrites the Review section of the branch's open PR, keeping the author's prose", async () => {
	const s = setup();
	const pull = {
		number: 7,
		body: [
			"Fixes averaging.",
			"",
			"## Review",
			"",
			"Hand-written record of an older head.",
			"",
			"## Models",
			"",
			"- Size: S",
			"- Implementer: Claude Code, claude-opus-5-5, high effort",
		].join("\r\n"),
	};
	const writes = onGitHub(s.repo, [pull]);
	try {
		const first = await quest("--root", s.repo, "review");
		expect(first.stderr).toBe("");
		expect(first.code).toBe(0);
		expect(first.stdout).toContain("record https://github.com/acme/widget/pull/7\n");
		const head = git(s.repo, "rev-parse", "HEAD");
		const base = git(s.repo, "rev-parse", "origin/main");
		expect(pull.body).toBe(
			[
				// The author's lines keep their line endings.
				"Fixes averaging.\r\n\r\n## Review\r",
				"",
				"Rewritten by `quest review` after each round.",
				"",
				// The land gate counts a full SHA, which a head with an open finding does not earn.
				`- Head: ${head.slice(0, 12)}, named in full once no reviewer reports a finding`,
				`- Base: origin/main at ${base.slice(0, 12)}`,
				"- Risk: medium, `the base has no RISK.md to name what is always high or customer-facing, so every change is medium`",
				"- Classified: medium by default",
				"",
				// The body's `## Models` record sizes the PR S, whose run drew its own rung.
				"- Reviewer: Codex, gpt-6.2-sol, medium effort, light rung (size)",
				"- Session: `thread-1`, round 1",
				"- Score: 8/10, `Lands once the off-by-one is fixed.`",
				"- Rounds: 1, runs 1 to 1; first round 1 (high 1); findings 1 (high 1): fixed 0, refuted 0, open 1",
				"- Findings, open until the next round settles them:",
				"  - High, `src/lib.ts:2`: `Off by one`",
				"",
				"## Models\r\n\r\n- Size: S\r\n- Implementer: Claude Code, claude-opus-5-5, high effort",
			].join("\n"),
		);

		// The next round settles that finding from the responses; model text never mentions, links, or names a full SHA.
		write(s.repo, "src/lib.ts", "export const x = 4;\n");
		git(s.repo, "commit", "-qam", "fix");
		write(s.repo, ".tmp/responses.md", "1. Fixed at src/lib.ts:1.\n");
		vi.stubEnv("FAKE_DISPOSITION", "refuted");
		const title = `Ping @someone about \`${base}\` in #12`;
		vi.stubEnv(
			"FAKE_REPLY",
			JSON.stringify({ score: 9, rationale: "Fixes #3.", findings: [{ ...FINDING, line: null, title }] }),
		);
		const second = await quest(
			"--root",
			s.repo,
			"review",
			"--responses",
			join(s.repo, ".tmp", "responses.md"),
			"--json",
		);
		expect(second.code).toBe(0);
		expect(JSON.parse(second.stdout).record).toEqual({ url: "https://github.com/acme/widget/pull/7" });
		const record = pull.body.split("## Review\r\n\n")[1]!.split("\n\n## Models")[0];
		expect(record).toContain(`- Head: ${git(s.repo, "rev-parse", "HEAD").slice(0, 12)},`);
		expect(record).toContain("- Session: `thread-1`, round 2\n");
		expect(record).toContain("- Score: 9/10, `Fixes #3.`\n");
		// The refuted finding counts beside the new one, across both rounds.
		expect(record).toContain(
			"- Rounds: 2, runs 1 to 2; first round 1 (high 1); findings 2 (high 2): fixed 0, refuted 1, open 1\n",
		);
		expect(record).toContain(
			`  - High, \`src/lib.ts\`: \`\`Ping @someone about \`${base.slice(0, 12)}\` in #12\`\`\n`,
		);
		expect(record).toContain(
			`- The last round's findings, at ${head.slice(0, 12)}:\n  - Refuted: high, \`src/lib.ts:2\`: \`Off by one\`; \`Checked against the head.\``,
		);
		expect(record).not.toMatch(/\b[0-9a-f]{40}\b/);
		expect(pull.body.startsWith("Fixes averaging.\r\n\r\n## Review\r\n\nRewritten")).toBe(true);
		expect(writes).toHaveLength(2);
	} finally {
		vi.unstubAllGlobals();
	}
});

/** A risk file whose `## High` list holds `high`, after a line of prose the classifier reads. */
const riskFile = (high: string[]) =>
	[
		"# Risk",
		"",
		"CUSTOMER-PROSE: the averaging library ships to paying customers.",
		"",
		"## High",
		"",
		...high,
		"",
	].join("\n");

/** The turns that ran the classifier, Haiku, rather than a reviewer. */
const classifying = (calls: Call[]) => calls.filter((call) => call.argv.includes("claude-haiku-5-5"));

fakes(
	"a change to a path held high is high without a model, even a file moved out of it",
	async () => {
		const s = setup();
		moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile(["- `src/` - customers' averages run on it"])));
		// A high head seats two reviewers of different vendors from the run's rung, never the writer's model. The
		// standard rung's only Claude model wrote it, so the second seat passes to the next rung outward.
		const listed = await quest("--root", s.repo, "review", ...OPUS_WROTE);
		expect(listed.code, listed.stderr).toBe(0);
		const reason = "it changes src/lib.ts, which is always high: customers' averages run on it";
		expect(listed.stdout).toContain(
			`\nrisk high ${reason}\nclassified high paths ${reason}\n\nreviewer codex gpt-6.2-sol high\nrung standard size\n`,
		);
		expect(listed.stdout).toContain("\nreviewer claude claude-fable-5-2 medium\nrung deep up\n");
		// An L PR's rung seats both, Codex's with the model the branch has not had.
		const large = await quest("--root", s.repo, "review", "--new", "--size", "L", ...OPUS_WROTE);
		expect(large.code, large.stderr).toBe(0);
		expect(large.stdout).toContain("\nreviewer codex gpt-6.2-astra medium\nrung deep size\n");
		expect(large.stdout).toContain("\nreviewer claude claude-fable-5-2 medium\nrung deep size\n");
		expect(classifying(s.calls())).toEqual([]);

		// Workflows are high in every repository, whatever its risk file lists, and a rename out of them counts.
		const t = setup();
		const base = moveBase(t.repo, (dir) => {
			write(dir, "RISK.md", riskFile([]));
			write(dir, ".github/workflows/ci.yml", "on: push\n");
		});
		git(t.repo, "fetch", "-q", "origin");
		git(t.repo, "merge", "-q", "--no-edit", "origin/main");
		git(t.repo, "mv", ".github/workflows/ci.yml", "ci.yml");
		git(t.repo, "commit", "-qm", "retire the workflow");
		const moved = await quest("--root", t.repo, "review", ...OPUS_WROTE);
		expect(moved.code, moved.stderr).toBe(0);
		expect(moved.stdout).toContain(`base ${base} origin/main\n`);
		expect(moved.stdout).toContain(
			"\nrisk high it changes .github/workflows/ci.yml, which is always high: workflows run with the repository's secrets and decide what merges and ships\n",
		);
	},
	20_000,
);

const reviewersOf = (out: string) => out.split("\n").filter((line) => line.startsWith("reviewer "));

fakes("a high head's seat that cannot run passes on, and each model is skipped once", async () => {
	const s = setup();
	moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile(["- `src/` - customers' averages run on it"])));
	const skips = (out: string) =>
		out
			.split("\n")
			.filter((line) => line.startsWith("skipped "))
			.sort();
	try {
		// Opus wrote it and Sol is at its limit: its seat passes to the next rung's Astra, beside Fable.
		vi.stubEnv("FAKE_FAILS", "gpt-6.2-sol");
		vi.stubEnv("FAKE_LIMITED", "reset");
		const passed = await quest("--root", s.repo, "review", ...OPUS_WROTE);
		expect(passed.code, passed.stderr).toBe(0);
		expect(reviewersOf(passed.stdout)).toEqual([
			"reviewer codex gpt-6.2-astra medium",
			"reviewer claude claude-fable-5-2 medium",
		]);
		// Sonnet wrote it, and Sol and Opus, the standard rung's seats, are both at their limits. Sol's first turn
		// hangs, so Opus fails first, and once Sol fails too neither is run again: each is named once, and the next
		// rung seats Astra and Fable.
		vi.stubEnv("FAKE_FAILS", "gpt-6.2-sol,claude-opus-5-5");
		vi.stubEnv("FAKE_HANG", join(s.bin, "..", "sol.pid"));
		const before = s.calls().length;
		const sonnet = ["--exclude-model", "claude-sonnet-5-5", "--exclude-model", "gemini-4-neon"];
		const both = await quest("--root", s.repo, "review", "--new", ...sonnet);
		expect(both.code, both.stderr).toBe(0);
		expect(skips(both.stdout)).toEqual([
			"skipped claude claude-opus-5-5 medium usage limit, resets 2030-03-17T17:46:40Z",
			`skipped codex gpt-6.2-sol high usage limit, resets ${codexReset}`,
		]);
		expect(reviewersOf(both.stdout)).toEqual([
			"reviewer codex gpt-6.2-astra medium",
			"reviewer claude claude-fable-5-2 medium",
		]);
		// Opus ran one attempt, its review turn and the findings turn that hit the limit.
		const opus = s
			.calls()
			.slice(before)
			.filter((c) => effortOf(c) !== null && c.argv[c.argv.indexOf("--model") + 1] === "claude-opus-5-5");
		expect(opus).toHaveLength(2);
	} finally {
		vi.unstubAllGlobals();
	}
});

fakes("a high head's seats may be weaker than its writer, as Sol and Opus reviewing Fable's work", async () => {
	const s = setup();
	moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile(["- `src/` - customers' averages run on it"])));
	const fable = await quest("--root", s.repo, "review", ...FABLE_WROTE);
	expect(fable.code, fable.stderr).toBe(0);
	expect(reviewersOf(fable.stdout)).toEqual([
		"reviewer codex gpt-6.2-sol high",
		"reviewer claude claude-opus-5-5 medium",
	]);
});

fakes(
	"the classifier sets the tier from the diff and the base's risk file, once per head",
	async () => {
		const s = setup();
		moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile(["- `billing/**/*.ts` - charges customers"])));
		vi.stubEnv("FAKE_RISK", JSON.stringify({ tier: "medium", reason: "Only a constant\nchanges." }));
		vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
		const first = await quest("--root", s.repo, "review");
		expect(first.code, first.stderr).toBe(0);
		const [call, ...more] = classifying(s.calls());
		expect(more).toEqual([]);
		const session = call!.argv[call!.argv.indexOf("--session-id") + 1];
		expect(first.stdout).toContain(
			[
				"risk medium Only a constant changes.",
				"classified medium model Only a constant changes.",
				`classifier claude claude-haiku-5-5 low ${session}`,
				"usage classify input 40 cached 0 output 3",
				"",
			].join("\n"),
		);
		// One read-only turn with its own instructions, never the repository's, that replies in the schema.
		expect(call!.argv[call!.argv.indexOf("--effort") + 1]).toBe("low");
		expect(call!.argv).toContain("dontAsk");
		const schema = JSON.parse(call!.argv[call!.argv.indexOf("--json-schema") + 1]!);
		expect(schema.required).toEqual(["tier", "reason"]);
		const instructions = call!.argv[call!.argv.indexOf("--append-system-prompt") + 1]!;
		expect(instructions).toContain("You set a pull request's risk tier from its change alone");
		expect(instructions).not.toContain("BASE-ROOT rule");
		// The prompt holds the base's risk file and the whole diff, by its merge base.
		expect(call!.stdin).toContain("CUSTOMER-PROSE");
		expect(call!.stdin).toContain("-export const x = 1;\n+export const x = 2;");
		expect(call!.stdin).toContain(
			`\`git diff --stat --patch ${git(s.repo, "merge-base", "HEAD", "origin/main")}..`,
		);
		// The reviewer is told the tier it may raise.
		expect(at(s.calls(), "high").at(-1)!.stdin).toContain(
			"<classified-reason>\nOnly a constant changes.\n</classified-reason>",
		);

		// The same head and risk file reuse the tier, so no model runs again.
		const again = await quest("--root", s.repo, "review");
		expect(again.code, again.stderr).toBe(0);
		expect(again.stdout).toContain(`classifier claude claude-haiku-5-5 low ${session}\n\nreviewer`);
		expect(classifying(s.calls())).toHaveLength(1);
		// --new classifies again.
		expect((await quest("--root", s.repo, "review", "--new")).code).toBe(0);
		expect(classifying(s.calls())).toHaveLength(2);
	},
	20_000,
);

fakes("without a logged-in Claude Code, Codex classifies", async () => {
	const s = setup();
	moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile([])));
	// Only git and the fake Codex are on PATH, so no Claude Code install outside the fakes is found either.
	const only = join(s.bin, "..", "codex-only");
	mkdirSync(only);
	symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(only, "git"));
	symlinkSync(join(s.bin, "codex"), join(only, "codex"));
	vi.stubEnv("PATH", only);
	const result = await quest("--root", s.repo, "review");
	expect(result.code, result.stderr).toBe(0);
	expect(result.stdout).toContain("classifier codex gpt-6.2-sol low thread-classify\n");
	const call = s.calls().find((each) => each.argv[1] === "--json")!;
	expect(call.argv.slice(0, 2)).toEqual(["exec", "--json"]);
	expect(call.argv).toContain('model_reasoning_effort="low"');
	expect(call.argv).toContain('sandbox_mode="read-only"');
	// The classifier may read the diff in parts, so only the user's connected apps are off.
	expect(call.argv).toContain("features.apps=false");
	expect(call.argv).not.toContain("features.shell_tool=false");
	const file = call.argv[call.argv.indexOf("--output-schema") + 1]!;
	expect(JSON.parse(readFileSync(file, "utf8")).required).toEqual(["tier", "reason"]);
	// Each schema has a file named by its content, since every worktree of the clone, on any release, writes there.
	const report = s.calls().find((each) => each.argv[1] === "resume")!;
	const reportFile = report.argv[report.argv.indexOf("--output-schema") + 1]!;
	expect(dirname(reportFile)).toBe(dirname(file));
	expect([basename(file), basename(reportFile)]).toEqual([
		expect.stringMatching(/^schema-[0-9a-f]{16}\.json$/),
		expect.stringMatching(/^schema-[0-9a-f]{16}\.json$/),
	]);
	expect(reportFile).not.toBe(file);
	expect(JSON.parse(readFileSync(reportFile, "utf8")).required).toContain("risk");
});

agyFakes("with only Antigravity installed, Gemini Flash classifies, reading the diff from its workspace", async () => {
	const s = setup();
	moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile([])));
	const only = join(s.bin, "..", "agy-only");
	mkdirSync(only);
	symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(only, "git"));
	symlinkSync(join(s.bin, "agy"), join(only, "agy"));
	vi.stubEnv("PATH", only);
	const result = await quest("--root", s.repo, "review", ...AGY);
	expect(result.code, result.stderr).toBe(0);
	expect(result.stdout).toContain("classifier agy gemini-3.8-flash low conversation-ask\n");
	const call = s.calls().find((each) => each.argv.includes("gemini-3.8-flash"))!;
	expect(call.argv).not.toContain("--conversation");
	expect(JSON.parse(readFileSync(call.argv[call.argv.indexOf("--json-schema") + 1]!, "utf8")).required).toEqual([
		"tier",
		"reason",
	]);
	expect(call.workspace!["diff-1.diff"]).toContain("+export const x = 2;");
	// The question carries the patch, so no head is exported.
	expect(Object.keys(call.workspace!).filter((name) => name.startsWith("head/") || name === "files.txt")).toEqual([]);
});

agyFakes(
	"a classifier whose turn fails on its login or usage limit, or replies unusably, passes the turn to the next",
	async () => {
		const s = setup();
		moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile([])));
		vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
		const run = async (failing: string) => {
			vi.stubEnv("FAKE_CLASSIFY", failing);
			return quest("--root", s.repo, "review", "--new");
		};
		// An unusable reply passes the turn on too.
		for (const failing of ["claude-rejected", "claude-limited", "claude-unusable"]) {
			const passed = await run(failing);
			expect(passed.code, passed.stderr).toBe(0);
			expect(passed.stdout).toContain("classifier codex gpt-6.2-sol low thread-classify\n");
		}
		// Gemini Flash answers last.
		const last = await run("claude-limited,codex-limited");
		expect(last.code, last.stderr).toBe(0);
		expect(last.stdout).toContain("classifier agy gemini-3.8-flash low conversation-ask\n");
		// With every classifier out of usage, the run fails on the limit that resets first.
		expect(await run("claude-limited,codex-limited,agy-limited")).toMatchObject({
			code: 3,
			stdout: "",
			stderr: `error: codex hit its usage limit; resets ${codexReset}\n`,
		});
		// A classifier whose CLI is not installed stands aside.
		const path = process.env.PATH;
		const without = join(s.bin, "..", "no-agy");
		mkdirSync(without);
		for (const name of ["claude", "codex"]) symlinkSync(join(s.bin, name), join(without, name));
		symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(without, "git"));
		vi.stubEnv("PATH", without);
		// Even where its workspace would be refused, as inside a repository, before it is found missing.
		const runtime = process.env.XDG_RUNTIME_DIR;
		vi.stubEnv("XDG_RUNTIME_DIR", join(s.repo, ".tmp", "run"));
		expect(await run("claude-limited,codex-limited")).toMatchObject({ code: 3, stdout: "" });
		vi.stubEnv("XDG_RUNTIME_DIR", runtime);
		vi.stubEnv("PATH", path);
		// Otherwise it names why each failed.
		const failed = await run("claude-rejected,codex-limited,agy-rejected");
		expect(failed.code).toBe(2);
		expect(failed.stderr).toMatch(
			/^error: no classifier could set the risk tier: claude is not logged in .*; codex hit its usage limit; resets .*; agy is not logged in; run `agy`\n$/,
		);
		const unusable = await run("claude-unusable,codex-unusable,agy-unusable");
		expect(unusable.code).toBe(2);
		expect(unusable.stderr).toBe(
			"error: no classifier could set the risk tier: claude claude-haiku-5-5: the classifier's reply has no risk tier with a reason; codex gpt-6.2-sol: the classifier's reply is not JSON; agy gemini-3.8-flash: the classifier's reply has no risk tier with a reason\n",
		);
	},
	20_000,
);

fakes("a question no model answers usably throws with what each reply took", async () => {
	const s = setup();
	const entries = [
		{ harness: "claude" as const, model: "claude-haiku-5-5", effort: "low" },
		{ harness: "codex" as const, model: "gpt-6.2-sol", effort: "low" },
	];
	const error = await ask(entries, {
		cwd: s.repo,
		dir: tempDir(),
		env: process.env,
		instructions: "i",
		schema: {},
		prompt: "p",
		tools: "",
		who: "time splitter",
		task: "split the session's time",
		parse: () => {
			throw new Error("unusable");
		},
	}).catch((each: unknown) => each);
	expect(error).toBeInstanceOf(UnansweredError);
	expect((error as UnansweredError).spent).toEqual([
		{ entry: entries[0], usage: { input: 40, cached: 0, output: 3 } },
		{ entry: entries[1], usage: { input: 40, cached: 0, output: 3 } },
	]);
});

fakes("a reviewer raises the tier, and the record keeps the classifier's beside it", async () => {
	const s = setup();
	moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile([])));
	const pull = {
		number: 7,
		body: "Fixes averaging.\n\n## Models\n\n- Size: S\n- Implementer: Claude Code, claude-opus-5-5, high effort\n",
	};
	onGitHub(s.repo, [pull]);
	vi.stubEnv("FAKE_RAISE", "high");
	try {
		const result = await quest("--root", s.repo, "review", ...OPUS_WROTE);
		expect(result.code, result.stderr).toBe(0);
		expect(result.stdout).toContain("\nrisk high It rewrites the wire format peers read.\n");
		expect(result.stdout).toContain("\nclassified medium model It changes what the library returns.\n");
		expect(result.stdout).toContain("\nscore 8 Lands once the off-by-one is fixed.\nraised high It rewrites");
		const session = classifying(s.calls())[0]!.argv.find((arg) => /^[0-9a-f-]{36}$/.test(arg));
		expect(pull.body).toContain(
			[
				"- Risk: high, `It rewrites the wire format peers read.`",
				`- Classified: medium by Claude Code, claude-haiku-5-5, low effort, session \`${session}\``,
				"",
				"- Reviewer: Codex, gpt-6.2-sol, medium effort, light rung (size)",
				"- Session: `thread-1`, round 1",
				"- Score: 8/10, `Lands once the off-by-one is fixed.`",
				"- Raised the risk to high: `It rewrites the wire format peers read.`",
			].join("\n"),
		);
		// The raise to high gets the second seat the medium tier skipped, in the same run: the light rung's only
		// other model wrote the PR, so it comes from the nearest rung with another vendor's.
		expect(result.stdout).toContain("\nreviewer claude claude-fable-5-2 medium\nrung deep up\n");
		expect(pull.body).toContain("- Reviewer: Claude Code, claude-fable-5-2, medium effort, deep rung (up)\n");
		expect(recordedRisk(pull.body)).toEqual({
			tier: "high",
			reason: "It rewrites the wire format peers read.",
			classified: "medium",
			by: "model",
			session,
			head: git(s.repo, "rev-parse", "HEAD").slice(0, 12),
			class: null,
			overridden: null,
		});

		// A raise holds for every later round on its head, whatever they judge it.
		vi.stubEnv("FAKE_RAISE", undefined);
		write(s.repo, ".tmp/responses.md", "1. Fixed.\n2. Fixed.\n");
		const responses = ["--responses", join(s.repo, ".tmp", "responses.md")];
		const held = await quest("--root", s.repo, "review", ...OPUS_WROTE, ...responses);
		expect(held.code, held.stderr).toBe(0);
		expect(held.stdout).toContain("\nrisk high It rewrites the wire format peers read.\n");
		expect(reviewersOf(held.stdout)).toHaveLength(2);
		// On a new head the tier is the classifier's again, and a reviewer never lowers it.
		vi.stubEnv("FAKE_RAISE", "low");
		write(s.repo, "src/lib.ts", "export const x = 3;\n");
		git(s.repo, "commit", "-qam", "another constant");
		const lower = await quest("--root", s.repo, "review", ...OPUS_WROTE, ...responses);
		expect(lower.code, lower.stderr).toBe(0);
		expect(lower.stdout).toContain("\nrisk medium It changes what the library returns.\n");
		expect(lower.stdout).not.toContain("\nraised ");
	} finally {
		vi.unstubAllGlobals();
	}
});

fakes("a raise to high saves its rounds before the second seat, which the next run fills", async () => {
	const s = setup();
	moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile([])));
	const pull = {
		number: 7,
		body: "Fixes averaging.\n\n## Models\n\n- Size: S\n- Implementer: Claude Code, claude-opus-5-5, high effort\n",
	};
	onGitHub(s.repo, [pull]);
	vi.stubEnv("FAKE_RAISE", "high");
	write(s.repo, ".tmp/responses.md", "1. Fixed.\n2. Fixed.\n");
	const responses = ["--responses", join(s.repo, ".tmp", "responses.md")];
	try {
		// The second seat the raise calls for cannot run, and no other vendor's model is left, so the run fails on it.
		vi.stubEnv("FAKE_LIMITED", "reset");
		vi.stubEnv("FAKE_FAILS", "claude-fable-5-2");
		const out = await quest("--root", s.repo, "review", ...OPUS_WROTE);
		expect(out.code).toBe(3);
		expect(out.stderr).toBe("error: claude hit its usage limit; resets 2030-03-17T17:46:40Z\n");
		// The rounds that ran are saved and printed, so their findings can be answered.
		expect(out.stdout).toContain("\nreviewer codex gpt-6.2-sol medium\n");
		expect(out.stdout).toContain("\nrisk high It rewrites the wire format peers read.\n");
		expect(out.stdout).toContain("\nfindings 1\n");

		// The raising round was saved, so the next run on its head is high from the start and seats both.
		vi.stubEnv("FAKE_LIMITED", undefined);
		vi.stubEnv("FAKE_FAILS", undefined);
		const both = await quest("--root", s.repo, "review", ...OPUS_WROTE, ...responses);
		expect(both.code, both.stderr).toBe(0);
		expect(reviewersOf(both.stdout)).toEqual([
			"reviewer codex gpt-6.2-sol medium",
			"reviewer claude claude-fable-5-2 medium",
		]);
		expect(pull.body).toContain(
			"- Reviewer: Codex, gpt-6.2-sol, medium effort, light rung (size)\n- Session: `thread-1`, round 2",
		);
		// Every seat settles the one finding, which its raiser's tally counts once.
		expect(both.stdout.match(/\n1\. fixed high /g)).toHaveLength(2);
		expect(pull.body).toContain(
			"- Rounds: 2, runs 1 to 2; first round 1 (high 1); findings 2 (high 2): fixed 1, refuted 0, open 1\n",
		);

		// On a new head the tier starts at medium with one seat; when its round raises the tier again, the second
		// seat runs at once, each reviewer once.
		write(s.repo, "src/lib.ts", "export const x = 3;\n");
		git(s.repo, "commit", "-qam", "another constant");
		const again = await quest("--root", s.repo, "review", ...OPUS_WROTE, ...responses);
		expect(again.code, again.stderr).toBe(0);
		expect(again.stdout).toContain("\nrisk high It rewrites the wire format peers read.\n");
		expect(reviewersOf(again.stdout)).toEqual([
			"reviewer codex gpt-6.2-sol medium",
			"reviewer claude claude-fable-5-2 medium",
		]);

		// --effort names only the first seat, so its raise still seats the second.
		write(s.repo, "src/lib.ts", "export const x = 4;\n");
		git(s.repo, "commit", "-qam", "a third constant");
		const named = await quest("--root", s.repo, "review", ...OPUS_WROTE, "--effort", "high", ...responses);
		expect(named.code, named.stderr).toBe(0);
		expect(reviewersOf(named.stdout)).toEqual([
			"reviewer codex gpt-6.2-sol high",
			"reviewer claude claude-fable-5-2 medium",
		]);
	} finally {
		vi.unstubAllGlobals();
	}
});

fakes("a raise to high with no other vendor's model left prints its saved rounds before the usage error", async () => {
	const s = setup();
	moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile([])));
	vi.stubEnv("FAKE_RAISE", "high");
	try {
		// Every model but Codex's is avoided, so Sol has no second reviewer.
		const others = ["claude-opus-5-5", "claude-fable-5-2", "gemini-4-neon"].flatMap((m) => ["--exclude-model", m]);
		const out = await quest("--root", s.repo, "review", "--size", "S", ...others);
		expect(out.code).toBe(2);
		expect(out.stderr).toContain(
			"a high-risk head needs reviewers from 2 vendors, and every model of a vendor other than codex's is avoided",
		);
		expect(out.stdout).toContain("\nrisk high It rewrites the wire format peers read.\n");
		expect(out.stdout).toContain("\nreviewer codex gpt-6.2-sol medium\n");
		expect(out.stdout).toContain("\nfindings 1\n");
	} finally {
		vi.unstubAllGlobals();
	}
});

fakes("a raise by an earlier run's reviewer holds while the head is the one it reviewed", async () => {
	const s = setup();
	const pull = {
		number: 7,
		body: "Fixes averaging.\n\n## Models\n\n- Size: L\n- Implementer: Claude Code, claude-opus-5-5, high effort\n",
	};
	onGitHub(s.repo, [pull]);
	// Only Sol, at xhigh effort for an L PR, raises the tier; the second seat it calls for does not.
	vi.stubEnv("FAKE_RAISE", "high@xhigh");
	const raised = "\nrisk high It rewrites the wire format peers read.\n";
	const block = [
		"- Reviewer: Codex, gpt-6.2-sol, xhigh effort, deep rung (size)",
		"- Session: `thread-1`",
		"- Raised the risk to high: `It rewrites the wire format peers read.`",
		"- Rounds: 1, runs 1 to 1;",
	].join("\n");
	write(s.repo, ".tmp/responses.md", "1. Refuted.\n2. Refuted.\n");
	const responses = ["--responses", join(s.repo, ".tmp", "responses.md")];
	try {
		const first = await quest("--root", s.repo, "review", ...OPUS_WROTE);
		expect(first.code, first.stderr).toBe(0);
		expect(first.stdout).toContain(raised);
		expect(reviewersOf(first.stdout)).toEqual([
			"reviewer codex gpt-6.2-sol xhigh",
			"reviewer claude claude-fable-5-2 medium",
		]);

		// The next run on that head seats Astra, which the branch has not had, in Sol's place: Sol's raise still
		// covers the head, so the run seats two and the record keeps the raise beside Sol's tally.
		vi.stubEnv("FAKE_RAISE", undefined);
		vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
		const again = await quest("--root", s.repo, "review", ...OPUS_WROTE, ...responses);
		expect(again.code, again.stderr).toBe(0);
		expect(reviewersOf(again.stdout)).toEqual([
			"reviewer codex gpt-6.2-astra medium",
			"reviewer claude claude-fable-5-2 medium",
		]);
		expect(again.stdout).toContain(raised);
		expect(pull.body).toContain(block);
		expect(recordedRisk(pull.body)).toMatchObject({ tier: "high", classified: "medium" });

		// A new head is its own reviewers' to judge.
		write(s.repo, "src/lib.ts", "export const x = 3;\n");
		git(s.repo, "commit", "-qam", "another constant");
		const moved = await quest("--root", s.repo, "review", ...OPUS_WROTE);
		expect(moved.code, moved.stderr).toBe(0);
		expect(moved.stdout).toContain("\nrisk medium the base has no RISK.md");
		expect(pull.body).not.toContain("- Raised the risk");
	} finally {
		vi.unstubAllGlobals();
	}
});

fakes(
	"a low head gets no local review, and the maintainer's override sets the tier until the change grows",
	async () => {
		const s = setup();
		moveBase(s.repo, (dir) =>
			write(dir, "RISK.md", `${riskFile([])}\n## Automatic\n\n- \`constants\` - only constants change\n`),
		);
		const pull = {
			number: 7,
			body: "Fixes averaging.\n\n## Models\n\n- Size: S\n- Implementer: Claude Code, claude-opus-5-5, high effort\n",
		};
		onGitHub(s.repo, [pull]);
		vi.stubEnv(
			"FAKE_RISK",
			JSON.stringify({ tier: "low", reason: "Only a constant changes.", class: "constants" }),
		);
		vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
		try {
			const low = await quest("--root", s.repo, "review");
			expect(low.code, low.stderr).toBe(0);
			expect(low.stdout).toContain("\nrisk low Only a constant changes.\n");
			expect(low.stdout).toContain("\nclass constants\n");
			expect(low.stdout).not.toContain("\nreviewer ");
			expect(low.stdout).toContain(
				"\nnext done: the head is low risk, so the online reviewer alone reviews it\n",
			);
			// Only the classifier ran, told the classes it may name.
			const reviewers = new Set(Object.values(RUNGS).flatMap((rung) => rung.map((each) => each.model)));
			expect(
				s.calls().filter((call) => [...reviewers].some((model) => call.argv.join(" ").includes(model))),
			).toEqual([]);
			const [call] = classifying(s.calls());
			const schema = JSON.parse(call!.argv[call!.argv.indexOf("--json-schema") + 1]!);
			expect(schema.properties.class.enum).toEqual(["constants", null]);
			const head = git(s.repo, "rev-parse", "HEAD");
			// The head is named in full, so the record counts as its review.
			expect(pull.body).toContain(`- Head: ${head}\n`);
			expect(pull.body).toContain(
				"- Class: `constants`\n- Local review: none, since a low-risk head needs only the online reviewer",
			);
			expect(recordedRisk(pull.body)).toMatchObject({ tier: "low", class: "constants", overridden: null });

			// The maintainer holds it high: two reviewers of different vendors review it.
			const high = ["--override", "high", "--reason", "It ships tonight."];
			const held = await quest("--root", s.repo, "review", ...OPUS_WROTE, ...high);
			expect(held.code, held.stderr).toBe(0);
			expect(held.stdout).toContain("\nrisk high It ships tonight.\noverridden low by the maintainer\n");
			expect(held.stdout).toContain("\nreviewer codex gpt-6.2-sol medium\n");
			expect(held.stdout).toContain("\nreviewer claude claude-fable-5-2 medium\n");
			expect(recordedRisk(pull.body)).toMatchObject({
				tier: "high",
				overridden: "low",
				reason: "It ships tonight.",
			});
			// The override outlasts a new head whose change is no riskier.
			write(s.repo, "src/lib.ts", "export const x = 3;\n");
			git(s.repo, "commit", "-qam", "another constant");
			const kept = await quest("--root", s.repo, "review", ...OPUS_WROTE);
			expect(kept.stdout).toContain("\nrisk high It ships tonight.\n");
			// --effort names only the first seat, so a high head still gets its second.
			write(s.repo, "src/lib.ts", "export const x = 7;\n");
			git(s.repo, "commit", "-qam", "a constant at a named effort");
			const effort = await quest("--root", s.repo, "review", ...OPUS_WROTE, "--effort", "high");
			expect(effort.code, effort.stderr).toBe(0);
			expect(effort.stdout).toContain("\nreviewer codex gpt-6.2-sol high\n");
			expect(effort.stdout).toContain("\nreviewer claude claude-fable-5-2 medium\n");
			// A riskier change than the one overridden ends it.
			vi.stubEnv("FAKE_RISK", JSON.stringify({ tier: "medium", reason: "It changes the output.", class: null }));
			write(s.repo, "src/lib.ts", "export const x = 4;\n");
			git(s.repo, "commit", "-qam", "a riskier constant");
			const grown = await quest("--root", s.repo, "review", ...OPUS_WROTE);
			expect(grown.code, grown.stderr).toBe(0);
			expect(grown.stdout).toContain("\nrisk medium It changes the output.\n");
			expect(grown.stdout).not.toContain("\noverridden ");

			// An override to the tier the reviews settled on changes nothing, so nothing records one.
			const same = await quest(
				"--root",
				s.repo,
				"review",
				...OPUS_WROTE,
				"--override",
				"medium",
				"--reason",
				"As it is.",
			);
			expect(same.code, same.stderr).toBe(0);
			expect(same.stdout).toContain("\nrisk medium It changes the output.\n");
			expect(same.stdout).not.toContain("\noverridden ");
			expect(recordedRisk(pull.body)).toMatchObject({ tier: "medium", overridden: null });

			expect((await quest("--root", s.repo, "review", "--override", "low")).stderr).toContain(
				"--override and --reason go together",
			);

			// A second seat that cannot run, with no other vendor's model left, is the one the failure names, never
			// the seat it ran beside. On a new head Codex runs until the failure stops it.
			write(s.repo, "src/lib.ts", "export const x = 5;\n");
			git(s.repo, "commit", "-qam", "a constant for the outage");
			vi.stubEnv("FAKE_HANG", join(s.bin, "..", "codex.pid"));
			vi.stubEnv("FAKE_LIMITED", "reset");
			vi.stubEnv("FAKE_FAILS", "claude-fable-5-2");
			const out = await quest("--root", s.repo, "review", ...OPUS_WROTE, ...high);
			expect(out.code).toBe(3);
			expect(out.stderr).toBe("error: claude hit its usage limit; resets 2030-03-17T17:46:40Z\n");
		} finally {
			vi.unstubAllGlobals();
		}
	},
);

fakes("a raise to the override's own tier agrees with it, so the override holds", async () => {
	const s = setup();
	vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
	try {
		// Classified medium, held high by the maintainer, and judged high by its reviewers too.
		const opus = OPUS_WROTE;
		vi.stubEnv("FAKE_RAISE", "high");
		const held = await quest(
			"--root",
			s.repo,
			"review",
			...opus,
			"--override",
			"high",
			"--reason",
			"It ships tonight.",
		);
		expect(held.code, held.stderr).toBe(0);
		expect(reviewersOf(held.stdout)).toHaveLength(2);
		vi.stubEnv("FAKE_RAISE", undefined);
		// The next head is classified medium and raised by no one, and the override still holds it high.
		write(s.repo, "src/lib.ts", "export const x = 9;\n");
		git(s.repo, "commit", "-qam", "another constant");
		const next = await quest("--root", s.repo, "review", ...opus);
		expect(next.code, next.stderr).toBe(0);
		expect(next.stdout).toContain("\noverridden medium by the maintainer\n");
		expect(reviewersOf(next.stdout)).toHaveLength(2);
	} finally {
		vi.unstubAllGlobals();
	}
});

fakes("a malformed risk file on the base fails before any model runs", async () => {
	const s = setup();
	moveBase(s.repo, (dir) => write(dir, "RISK.md", riskFile(["- `/etc/` - absolute", "- src/ without a reason"])));
	const result = await quest("--root", s.repo, "review");
	expect(result.code).toBe(2);
	expect(result.stderr).toContain(
		"the base's RISK.md cannot be read: RISK.md:7: `/etc/` is no pattern: it starts with /",
	);
	expect(result.stderr).toContain("RISK.md:8: a `## High` item is a backticked pattern");
	expect(s.calls()).toEqual([]);
});

fakes("a branch with no open PR, or a body without a Review section, is reported as such", async () => {
	const s = setup();
	const pulls: { number: number; body: string | null }[] = [];
	onGitHub(s.repo, pulls);
	try {
		const none = await quest("--root", s.repo, "review");
		expect(none.code).toBe(0);
		expect(none.stdout).toContain("record skipped: no open PR from feature into main\n");

		pulls.push({ number: 8, body: null });
		vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
		write(s.repo, ".tmp/responses.md", "Fixed.\n");
		const recorded = await quest("--root", s.repo, "review", "--responses", join(s.repo, ".tmp", "responses.md"));
		expect(recorded.stdout).toContain("record https://github.com/acme/widget/pull/8\n");
		expect(pulls[0]!.body).toMatch(
			/^## Review\n\nRewritten by `quest review` after each round\.\n[\s\S]*- Findings: none\n/,
		);
		// A round with no findings names its head in full, which the land gate counts.
		expect(pulls[0]!.body!.match(/\b[0-9a-f]{40}\b/g)).toEqual([git(s.repo, "rev-parse", "HEAD")]);
	} finally {
		vi.unstubAllGlobals();
	}
});

fakes("a maintainer's checkout records on a contributor's fork PR and reads its size", async () => {
	const s = setup();
	const pushed = git(s.repo, "rev-parse", "HEAD~1");
	const pull = { number: 12, body: "Body.\n\n## Models\n\n- Size: S\n", head: "contributor/widget", sha: pushed };
	// A stranger's PR from a branch of the same name, whose head this checkout lacks.
	const stranger = {
		number: 13,
		body: "Stranger.\n\n## Models\n\n- Size: XS\n",
		head: "stranger/widget",
		sha: "f".repeat(40),
	};
	const pulls: FakePull[] = [stranger];
	onGitHub(s.repo, pulls);
	vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
	try {
		const alone = await quest("--root", s.repo, "review");
		expect(alone.code, alone.stderr).toBe(0);
		expect(alone.stdout).toContain(
			"record skipped: no open PR from feature into main from acme or with a head this checkout holds: https://github.com/acme/widget/pull/13\n",
		);
		// Its size went unread: no size is the default, M.
		expect(alone.stdout).toMatch(/^size M default\n/);
		expect(stranger.body).toBe("Stranger.\n\n## Models\n\n- Size: XS\n");

		pulls.push(pull);
		const result = await quest("--root", s.repo, "review");
		expect(result.code, result.stderr).toBe(0);
		expect(result.stdout).toContain("record https://github.com/acme/widget/pull/12\n");
		expect(result.stdout).toMatch(/^size S ## Models\n/);
		expect(pull.body).toMatch(/^Body\.\n\n## Models\n\n- Size: S\n\n## Review\n\nRewritten by `quest review`/);
		expect(stranger.body).toBe("Stranger.\n\n## Models\n\n- Size: XS\n");

		// A second contributor's PR whose head this checkout also holds leaves no way to tell them apart.
		pulls.push({ number: 15, body: "Other.", head: "someone/widget", sha: pushed });
		const ambiguous = await quest("--root", s.repo, "review", "--size", "S");
		expect(ambiguous.code, ambiguous.stderr).toBe(0);
		expect(ambiguous.stdout).toContain(
			"record skipped: several open PRs from feature into main with heads this checkout holds, none from acme: https://github.com/acme/widget/pull/12, https://github.com/acme/widget/pull/15\n",
		);
		expect(pulls[2]!.body).toBe("Other.");

		// The push repository's own PR wins over any fork's.
		pulls.push({ number: 14, body: "Own." });
		const own = await quest("--root", s.repo, "review", "--size", "S");
		expect(own.stdout).toContain("record https://github.com/acme/widget/pull/14\n");
		expect(pulls[2]!.body).toBe("Other.");
	} finally {
		vi.unstubAllGlobals();
	}
});

fakes("a review from a subdirectory of a fork records on the upstream PR", async () => {
	const s = setup();
	const pull = { number: 11, body: "Body." };
	onGitHub(s.repo, [pull], true);
	try {
		const result = await quest("--root", join(s.repo, "src"), "review");
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("record https://github.com/upstream/widget/pull/11\n");
		expect(pull.body).toMatch(/^Body\.\n\n## Review\n\nRewritten by `quest review`/);
	} finally {
		vi.unstubAllGlobals();
	}
});

fakes("a round on the head the last round passed runs no reviewer and repeats that round", async () => {
	const s = setup();
	vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
	const first = await quest("--root", s.repo, "review", "--json", ...SMALL);
	expect(first.code, first.stderr).toBe(0);
	const calls = s.calls().length;
	const again = await quest("--root", s.repo, "review", "--json", ...SMALL);
	expect(again.code, again.stderr).toBe(0);
	expect(s.calls()).toHaveLength(calls);
	const rounds: Round[] = JSON.parse(first.stdout).rounds;
	expect(rounds.map((round) => [round.model, round.effort])).toEqual([["gpt-6.2-sol", "medium"]]);
	expect(JSON.parse(again.stdout).rounds).toEqual(
		rounds.map((round: object) => ({ ...round, usage: [], unchanged: true })),
	);
	// The round stands whatever the next run would have drawn, and reports the size given.
	const resized = await quest("--root", s.repo, "review", "--json", "--size", "XS");
	expect(s.calls()).toHaveLength(calls);
	expect(JSON.parse(resized.stdout).rounds).toMatchObject(rounds.map(() => ({ size: "XS", sizeFrom: "--size" })));
	const repeated = (await quest("--root", s.repo, "review", "--size", "XS")).stdout;
	expect(repeated.split("unchanged round 1 reviewed this head and found nothing; no reviewer ran\n")).toHaveLength(2);

	// A reviewer a flag names that is not among them joins that run, rather than start another, and then stands too.
	const named = JSON.parse((await quest("--root", s.repo, "review", "--json", ...SMALL, "--effort", "high")).stdout);
	expect(named.rounds.map((r: Round) => [r.effort, r.round, r.unchanged])).toEqual([
		["medium", 1, true],
		["high", 1, false],
	]);
	const ran = s.calls().length;
	const both = JSON.parse((await quest("--root", s.repo, "review", "--json", ...SMALL)).stdout);
	expect(both.rounds.map((r: Round) => [r.effort, r.unchanged])).toEqual([
		["medium", true],
		["high", true],
	]);
	expect(s.calls()).toHaveLength(ran);

	// Its reviewer since avoided, the passed head needs another: Sol's round no longer counts for it.
	const avoided = JSON.parse(
		(await quest("--root", s.repo, "review", "--json", "--size", "S", "--exclude-model", "gpt-6.2-sol")).stdout,
	);
	expect(avoided.rounds.map((r: Round) => [r.model, r.unchanged])).toEqual([["claude-opus-5-5", false]]);

	// A round with findings to settle runs on the same head, since a refutation needs no new commit.
	vi.stubEnv("FAKE_REPLY", undefined);
	const t = setup();
	expect((await quest("--root", t.repo, "review", ...SMALL)).code).toBe(0);
	write(t.repo, ".tmp/responses.md", "1. Refuted: src/lib.ts:1 sets it.\n");
	const responses = join(t.repo, ".tmp", "responses.md");
	const refuted = await quest("--root", t.repo, "review", ...SMALL, "--responses", responses);
	expect(refuted.code, refuted.stderr).toBe(0);
	expect(refuted.stdout).toContain("session thread-1\nround 2\n");
	expect(refuted.stdout).not.toContain("unchanged");
	expect(at(t.calls(), "medium").at(-2)!.stdin).toContain("Refuted: src/lib.ts:1 sets it.");
});

fakes("a head that turns high after its round passed seats only the vendor it lacks", async () => {
	const s = setup(null);
	vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
	const first = JSON.parse((await quest("--root", s.repo, "review", "--json", ...FABLE_WROTE)).stdout);
	expect(first.rounds.map((r: Round) => r.model)).toEqual(["gpt-6.2-sol"]);
	// The maintainer holds the head high: Sol's round stands, and the second seat joins its run on another vendor.
	const high = ["--override", "high", "--reason", "It ships tonight."];
	const held = JSON.parse((await quest("--root", s.repo, "review", "--json", ...FABLE_WROTE, ...high)).stdout);
	expect(held.rounds.map((r: Round) => [r.reviewer, r.model, r.round, r.unchanged])).toEqual([
		["codex", "gpt-6.2-sol", 1, true],
		["claude", "claude-opus-5-5", 1, false],
	]);
	const calls = s.calls().length;
	const again = JSON.parse((await quest("--root", s.repo, "review", "--json", ...FABLE_WROTE)).stdout);
	expect(again.rounds.map((r: Round) => r.unchanged)).toEqual([true, true]);
	expect(s.calls()).toHaveLength(calls);
});

fakes("the PR's Models record sizes the review and names its latest writer", async () => {
	const s = setup();
	const body = (...lines: string[]) => ["Body.", "", "## Models", "", ...lines].join("\n");
	const pull: FakePull = { number: 9, body: body("- Size: L", "- Implementer: Codex, gpt-6.2-sol, high effort") };
	onGitHub(s.repo, [pull]);
	// Each case starts on a branch no reviewer has seen, so its draw is the rung's first that may review.
	const anew = (...args: string[]) => {
		rmSync(sessionFile(join(s.repo, ".git"), "feature"), { force: true });
		return quest("--root", s.repo, "review", ...args);
	};
	try {
		// Sol wrote it, so Opus reviews it at L's effort, though Claude Code runs the command.
		const sol = await quest("--root", s.repo, "review");
		expect(sol.stderr).toBe("");
		expect(sol.stdout).toMatch(/^size L ## Models\n[\s\S]*\nreviewer claude claude-opus-5-5 high\n/);

		// Flags override the record.
		const flagged = await anew("--size", "XS", "--exclude-model", "x");
		expect(flagged.stdout).toMatch(/^size XS --size\n[\s\S]*\nreviewer codex gpt-6.2-sol medium\n/);

		// Only the latest implementer is avoided, whoever wrote earlier.
		pull.body = body("- Implementer: Codex, unknown, unknown effort", "- Implementer: Codex, gpt-6.2-sol, high");
		expect((await anew()).stdout).toContain("reviewer claude claude-opus-5-5 medium\n");
		// A display name is avoided as its ID is.
		pull.body = body("- Size: S", "- Implementer: Codex, GPT-6.2 Sol, high effort");
		expect((await anew()).stdout).toContain("reviewer claude claude-opus-5-5 low\n");
		// A latest implementer whose model is unknown may be the running harness's, which the review then skips.
		pull.body = body("- Implementer: Codex, gpt-6.2-sol, high", "- Implementer: Codex, unknown, unknown effort");
		expect((await anew()).stdout).toContain("reviewer codex gpt-6.2-sol high\n");

		// A malformed field fails the round, unless the flag that replaces it is given.
		pull.body = body("- Size: XXL", "- Implementer: Codex");
		const invalid = await anew("--exclude-model", "gpt-6.2-sol");
		expect(invalid.code).toBe(2);
		expect(invalid.stderr).toContain("the PR's ## Models record names size XXL, not one of XS, S, M, L, XL");
		const nameless = await anew("--size", "S");
		expect(nameless.code).toBe(2);
		expect(nameless.stderr).toContain("names no model it can read in: Implementer: Codex");
		const both = await anew("--size", "S", "--exclude-model", "gpt-6.2-sol");
		expect(both.stdout).toMatch(/^size S --size\n[\s\S]*\nreviewer claude claude-opus-5-5 low\n/);
		pull.body = body("- Size: S", "- Size: M");
		expect((await anew()).stderr).toContain("names 2 sizes");

		// A blank, multi-token, or malformed duplicate Size line fails too, rather than falling back to M.
		pull.body = body("- Size:");
		const blank = await anew();
		expect(blank.code).toBe(2);
		expect(blank.stderr).toContain("has a Size: line that names no size");
		pull.body = body("- Size: L extra");
		const extra = await anew();
		expect(extra.code).toBe(2);
		expect(extra.stderr).toContain("names size L extra, not one of");
		pull.body = body("- Size: S", "- Size: S extra");
		const duplicate = await anew();
		expect(duplicate.code).toBe(2);
		expect(duplicate.stderr).toContain("names 2 sizes");
		pull.body = body("- Size:");
		expect((await anew("--size", "S")).stdout).toContain("size S --size\n");
	} finally {
		vi.unstubAllGlobals();
	}
});

test("a Models record reads its size and every implementing model", () => {
	const body =
		"x\n\n## Models\n\nSize: S\n- Implementer: Claude Code, claude-opus-5-5, high effort\n* Implementer: Codex, unknown, unknown effort\n\n## Review\n\n- Size: XL\n";
	expect(recorded(body)).toEqual({
		sizes: ["S"],
		implementers: [
			{
				item: "Implementer: Claude Code, claude-opus-5-5, high effort",
				fields: { harness: "Claude Code", model: "claude-opus-5-5", effort: "high", size: null, arm: null },
			},
			{
				item: "Implementer: Codex, unknown, unknown effort",
				fields: { harness: "Codex", model: "unknown", effort: "unknown", size: null, arm: null },
			},
		],
	});
	expect(recorded("No record.")).toEqual({ sizes: [], implementers: [] });
	expect(recorded("## Models\n\n- Size:\n- Size: L extra\n- Size:  M \n").sizes).toEqual(["", "L extra", "M"]);
	expect(recorded("## Models\n\n- Implementer: Codex\n").implementers).toEqual([
		{ item: "Implementer: Codex", fields: null },
	]);
});

test("an Implementer line reads as agents write it", () => {
	const read = (rest: string) => implementer(`Implementer: ${rest}`);
	const opus = (effort: string, harness = "Claude Code") => ({
		harness,
		model: "claude-opus-5-5",
		effort,
		size: null,
		arm: null,
	});
	expect(read("Claude Code, Opus 5.5, high effort")).toEqual(opus("high"));
	expect(read("Claude Code, Claude Opus 5.5, xhigh effort")).toEqual(opus("xhigh"));
	expect(read("Claude Code, Opus 5.5")).toEqual(opus("unknown"));
	expect(read("Claude Code, Opus 5.5, effort not reported")).toEqual(opus("unknown"));
	expect(read("Claude, Haiku 5.5, low effort")).toEqual({
		harness: "Claude Code",
		model: "claude-haiku-5-5",
		effort: "low",
		size: null,
		arm: null,
	});
	expect(read("claude-haiku-5-5, effort not reported")).toEqual({
		harness: "unknown",
		model: "claude-haiku-5-5",
		effort: "unknown",
		size: null,
		arm: null,
	});
	expect(read("Codex, GPT-6.2 Sol, medium effort (iterate, XS)")).toEqual({
		harness: "Codex",
		model: "gpt-6.2-sol",
		effort: "medium",
		size: "XS",
		arm: null,
	});
	// A retired model's spellings still read as its ID, as older records name it; an unlisted ID reads as written.
	for (const name of ["GPT-6.1 Sol", "GPT 6.1  Sol", "GPT-6.1-SOL", "openai/gpt-6.1-sol"])
		expect(read(`Codex, ${name}, high effort`)?.model).toBe("gpt-6.1-sol");
	expect(read("Codex, openrouter/gpt-5-mini, high effort")?.model).toBe("openrouter/gpt-5-mini");
	// Comparisons fold the spellings of a listed or retired model, and keep an unlisted one's namespace.
	expect(sameModel("openai/gpt-6.2-astra", "gpt-6.2-astra")).toBe(true);
	expect(sameModel("gpt-6.1-sol", "gpt-6.2-sol")).toBe(false);
	expect(sameModel("internal/gpt-5-mini", "openai/gpt-5-mini")).toBe(false);
	// So do those of a model no table lists, which runs only when named, so a writer's spelling still avoids it.
	expect(sameModel("google/gemini-4-neon", "Gemini 4 Neon")).toBe(true);
	expect(
		authored({ exclude: ["google/gemini-4-neon"] }, {})({ harness: "agy", model: "gemini-4-neon", effort: "high" }),
	).toBe(true);
	expect(read("GPT 6.2 Astra")?.model).toBe("gpt-6.2-astra");
	expect(read("Claude Code, Opus 5.5, low effort (iterate, flow fix)")).toEqual(opus("low"));
	expect(read("Claude Code, Opus 5.5, high effort (iterate, XS, arm B)")).toEqual({
		...opus("high"),
		size: "XS",
		arm: "B",
	});
	expect(read("Claude Code, Opus 5.5, high effort (arm A)")).toEqual({ ...opus("high"), arm: "A" });
	// Only an arm the A/B runs reads as one.
	expect(read("Claude Code, Opus 5.5, high effort (arm C)")).toEqual(opus("high"));
	expect(read("unknown, Opus 5.5, high effort")).toEqual(opus("high", "unknown"));
	expect(read("Claude Code, Fable 5.2, medium effort")?.model).toBe("claude-fable-5-2");
	expect(read("Codex, openai/gpt-6.2-sol, high effort")?.model).toBe("gpt-6.2-sol");
	expect(read("Codex, gpt-6.2-sol, high")?.effort).toBe("high");
	expect(read("unknown")).toBeNull();
	// A lone field reads as a listed display name or an ID, keeping the size its notes give.
	expect(read("Opus 5.5")).toEqual(opus("unknown", "unknown"));
	expect(read("Claude Opus 5.5 (iterate, S)")).toEqual({ ...opus("unknown", "unknown"), size: "S" });
	expect(read("claude-opus-5-5")).toEqual(opus("unknown", "unknown"));
	expect(read("claude-opus-5-5 (iterate, XS)")).toEqual({ ...opus("unknown", "unknown"), size: "XS" });
	expect(read("Claude Code")).toBeNull();
	expect(read("claude-opus-5-5, unknown")).toEqual(opus("unknown", "unknown"));
	expect(read("Claude Code, Opus 5.5,")).toEqual(opus("unknown"));
	expect(read("OpenRouter, openrouter/kimi, high effort")?.model).toBe("openrouter/kimi");
	expect(read("openrouter/kimi")).toBeNull();
	expect(read(", claude-opus-5-5, high effort")).toEqual(opus("high", "unknown"));
	// An ID no list names still reads, so a new model is counted before the lists add it.
	expect(read("Codex, gpt-7, high effort")?.model).toBe("gpt-7");
	expect(read("Codex, Some Model, high effort")).toBeNull();
	expect(read("Claude Code, Opus 5.5, high effort, extra")).toBeNull();
	expect(read("Claude Code, Opus 5.5, very high effort")).toBeNull();
});

test("the record replaces only a top-level Review section, never an example of one", () => {
	const fenced = "Example:\n\n```md\n## Review\n\nold\n```\n\nAfter.\n";
	expect(withReview(fenced, "new")).toBe(`${fenced.trimEnd()}\n\n## Review\n\nnew\n`);
	const quoted = "> ## Review\n> quoted\n\n## Review\n\nold\n\n# Notes\n\n## Review\n\nsecond\n";
	expect(withReview(quoted, "new")).toBe(
		"> ## Review\n> quoted\n\n## Review\n\nnew\n\n# Notes\n\n## Review\n\nsecond\n",
	);
	// A level-3 heading stays inside the section, and a rewrite of the same record changes nothing.
	const nested = "## Review\n\nold\n\n### Detail\n\nmore\n\n## Models\n\n- Size: S\n";
	const once = withReview(nested, "new");
	expect(once).toBe("## Review\n\nnew\n\n## Models\n\n- Size: S\n");
	expect(withReview(once, "new")).toBe(once);
	expect(withReview("", "new")).toBe("## Review\n\nnew\n");
	// A heading appended inside an unclosed construct would be no section, which the land gate never reads.
	for (const open of ["```md\nunclosed", "<!-- unclosed"])
		expect(() => withReview(open, "new")).toThrow("unclosed code fence or HTML comment");
});

fakes("a record GitHub refuses fails the command after printing the round", async () => {
	const s = setup();
	onGitHub(s.repo, [{ number: 9, body: "" }]);
	const fetch = globalThis.fetch;
	vi.stubGlobal("fetch", async (input: URL, init?: RequestInit) =>
		init?.method === "PATCH"
			? new Response('{"message":"Must have admin rights"}', { status: 403 })
			: fetch(input, init),
	);
	try {
		const result = await quest("--root", s.repo, "review");
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("findings 1\n");
		expect(result.stderr).toContain("the round finished, but recording it in the PR body failed: GitHub HTTP 403");
	} finally {
		vi.unstubAllGlobals();
	}
});

/** Push a commit that `change` makes to origin's main, returning its SHA. */
function moveBase(repo: string, change: (dir: string) => void): string {
	const base = join(repo, "..", "base");
	git(repo, "worktree", "add", "-q", base, "origin/main");
	change(base);
	git(base, "add", "-A");
	git(base, "commit", "-qm", "move the base");
	git(base, "push", "-q", "origin", "HEAD:main");
	return git(base, "rev-parse", "HEAD");
}

fakes("a reply that does not match the schema fails rather than reads as clean", async () => {
	const s = setup();
	vi.stubEnv("FAKE_REPLY", "Looks good to me.");
	const prose = await quest("--root", s.repo, "review");
	expect(prose.code).toBe(1);
	expect(prose.stderr).toContain("not JSON");

	vi.stubEnv(
		"FAKE_REPLY",
		JSON.stringify({ score: 8, rationale: "Fix it.", findings: [{ ...FINDING, severity: "critical" }] }),
	);
	const wrong = await quest("--root", s.repo, "review");
	expect(wrong.code).toBe(1);
	expect(wrong.stderr).toContain("finding 1 does not match the schema");

	vi.stubEnv("FAKE_REPLY", JSON.stringify({ findings: [] }));
	const unscored = await quest("--root", s.repo, "review");
	expect(unscored.code).toBe(1);
	expect(unscored.stderr).toContain("no score from 0 to 10");
});

test("the verdict is checked field by field, settling each earlier finding once", () => {
	const risk = { tier: "medium", reason: "It changes what the library returns." };
	const scored = { score: 7, rationale: "Fix the finding.", risk, earlier: [] };
	expect(verdict({ structured: { ...scored, findings: [{ ...FINDING, line: null }] } }, 0)).toEqual({
		...scored,
		findings: [{ ...FINDING, line: null }],
	});
	expect(() => verdict({ structured: { ...scored, findings: [{ ...FINDING, line: 0 }] } }, 0)).toThrow(
		"does not match",
	);
	expect(() => verdict({ text: '{"verdict":"approve"}' }, 0)).toThrow("no findings list");
	// An agy reviewer naming a file by its path in the head's export names it in the repository.
	const exported = (file: string) =>
		verdict(
			{
				structured: {
					...scored,
					findings: [{ ...FINDING, file: `/run/user/1/quest/agent/review-AbC123/head/${file}` }],
				},
			},
			0,
		).findings[0]!.file;
	expect(exported("src/lib.ts")).toBe("src/lib.ts");
	// Only the export's own prefix, though a tracked path looks like one.
	expect(exported("packages/review-ui/head/index.ts")).toBe("packages/review-ui/head/index.ts");
	for (const score of [-1, 11, 7.5, "7", undefined]) {
		expect(() => verdict({ structured: { ...scored, score, findings: [] } }, 0)).toThrow("no score from 0 to 10");
	}
	expect(() => verdict({ structured: { ...scored, rationale: " ", findings: [] } }, 0)).toThrow("no rationale");
	// The reviewer's tier is one of the three, with a reason, which a reply puts on one line.
	for (const bad of [undefined, { tier: "critical", reason: "x" }, { tier: "high", reason: " " }]) {
		expect(() => verdict({ structured: { ...scored, risk: bad, findings: [] } }, 0)).toThrow("no risk tier");
	}
	expect(
		verdict({ structured: { ...scored, risk: { tier: "high", reason: "Peers\n read it." }, findings: [] } }, 0)
			.risk,
	).toEqual({ tier: "high", reason: "Peers read it." });

	const fixed = { finding: 1, disposition: "fixed", reason: "src/lib.ts:2 divides by the length." };
	const refuted = { finding: 2, disposition: "refuted", reason: "The maintainer decided it." };
	const answered = { ...scored, findings: [], earlier: [refuted, fixed] };
	expect(verdict({ structured: answered }, 2).earlier).toEqual([refuted, fixed]);
	// A first round's schema has no `earlier`; a later one's requires it.
	expect(verdict({ structured: { ...scored, findings: [], earlier: undefined } }, 0).earlier).toEqual([]);
	expect(() => verdict({ structured: { ...scored, findings: [], earlier: undefined } }, 1)).toThrow(
		"no earlier list",
	);
	// A finding kept open is reported again, so a reply cannot keep one open and read as clean.
	const open = { ...fixed, disposition: "open" };
	expect(() => verdict({ structured: { ...scored, findings: [], earlier: [open] } }, 1)).toThrow(
		"keeps 1 earlier finding(s) open but reports 0",
	);
	expect(verdict({ structured: { ...scored, findings: [FINDING], earlier: [open] } }, 1).earlier).toEqual([open]);
	// Each of the last round's findings is settled exactly once, by its number.
	for (const earlier of [[fixed], [fixed, fixed], [fixed, { ...refuted, finding: 3 }]]) {
		expect(() => verdict({ structured: { ...scored, findings: [], earlier } }, 2)).toThrow("settle each");
	}
	for (const bad of [
		{ ...fixed, disposition: "deferred" },
		{ ...fixed, reason: " " },
		{ ...fixed, finding: 1.5 },
	]) {
		expect(() => verdict({ structured: { ...scored, findings: [], earlier: [bad] } }, 1)).toThrow(
			"earlier entry 1",
		);
	}
});

test("each changed directory keeps its own instructions, and a directory's symlink is given once", () => {
	const repo = tempDir();
	execFileSync("git", ["init", "-q", "-b", "main", repo]);
	write(repo, "AGENTS.md", "root\n");
	write(repo, "a/AGENTS.md", "same\n");
	write(repo, "b/AGENTS.md", "same\n");
	write(repo, "c/AGENTS.md", "c rules\n");
	symlinkSync("AGENTS.md", join(repo, "c", "CLAUDE.md"));
	write(repo, "d/AGENTS.md", "untouched\n");
	git(repo, "add", ".");
	git(repo, "commit", "-qm", "base");
	const files = baseInstructions(repo, "HEAD", ["a/x.ts", "b/y.ts", "c/z.ts"]);
	expect(files).toEqual([
		{ path: "AGENTS.md", text: "root" },
		{ path: "a/AGENTS.md", text: "same" },
		{ path: "b/AGENTS.md", text: "same" },
		{ path: "c/AGENTS.md", text: "c rules" },
	]);
});

test("the next step stops for the design checkpoint when a reviewer's every third round reports findings", () => {
	const round = (number: number, findings: number, severity = "medium") =>
		({ round: number, findings: Array.from({ length: findings }, () => ({ severity })) }) as unknown as Round;
	expect(nextStep([round(3, 1)])).toMatch(
		/^next checkpoint: .*best long-term approach from first principles, compare it with the current one/,
	);
	expect(nextStep([round(6, 2)])).toMatch(/^next checkpoint: .*best long-term approach from first principles/);
	expect(nextStep([round(4, 1)])).toMatch(/^next respond: /);
	// --new restarts the count: the third run after it is the checkpoint, not the branch's third.
	expect(nextStep([round(3, 1)], 2)).toMatch(/^next respond: /);
	expect(nextStep([round(5, 1)], 2)).toMatch(/^next checkpoint: /);
	expect(nextStep([round(3, 0)])).toMatch(/^next done: /);
	expect(nextStep([round(3, 2, "low")])).toMatch(/^next finish: /);
	expect(nextStep([round(4, 1, "low")])).toMatch(/^next finish: /);
	// Across reviewers: any finding not low needs another round, and a clean third round is no checkpoint.
	expect(nextStep([round(1, 1, "low"), round(1, 1)])).toMatch(/^next respond: /);
	expect(nextStep([round(3, 0), round(1, 1)])).toMatch(/^next respond: /);
	expect(nextStep([round(1, 1), round(3, 1)])).toMatch(
		/^next checkpoint: .*best long-term approach from first principles/,
	);
	expect(nextStep([round(3, 0), round(1, 0)])).toMatch(/^next done: /);
});

test("saved rounds are read only in the current format, or refused naming --new", () => {
	const finding = { severity: "low", file: "a.ts", line: 1, title: "t", body: "b" };
	const round = { reviewer: "codex", model: "m", effort: "e", head: "a", round: 1, findings: [finding] };
	const tally = {
		reviewer: "codex",
		model: "m",
		effort: "e",
		sessions: ["thread-1"],
		rounds: 1,
		debut: 1,
		last: 1,
		findings: { high: 0, medium: 0, low: 1 },
		first: { high: 0, medium: 0, low: 1 },
		fixed: 0,
		refuted: 0,
	};
	const reviewed = { mergeBase: "m", given: { instructions: "i", rules: null }, rounds: [round] };
	const current = { branch: "feature", runs: 1, reviewed, tallies: [tally] };
	expect(parseState(current)).toEqual(current);
	// A branch whose every head was low has run no reviewer yet.
	const none = { branch: "feature", runs: 0, tallies: [] };
	expect(parseState(none)).toEqual(none);
	// A round no tally counts.
	const spelled = { ...current, reviewed: { ...reviewed, rounds: [{ ...round, model: "openai/m" }] } };
	expect(() => parseState(spelled)).toThrow(/--new/);
	const session = {
		reviewer: "codex",
		session: "thread-1",
		rounds: [{ head: "a", mergeBase: "m", findings: [finding] }],
		last: {},
		given: { instructions: "i", rules: null },
	};
	for (const older of [
		null,
		// A reviewer's resumed sessions, as saved before every round ran its own.
		{ branch: "feature", sessions: [session], tallies: [{ ...tally, session: "thread-1", sessions: undefined }] },
		{ ...current, runs: undefined },
		{ ...current, tallies: [] },
		{ ...current, tallies: [{ ...tally, findings: { high: 0, low: 1 } }] },
		{ ...current, tallies: [{ ...tally, first: undefined }] },
		{ ...current, tallies: [{ ...tally, last: undefined }] },
		{ ...current, tallies: [{ ...tally, sessions: "thread-1" }] },
		{ ...current, reviewed: { ...reviewed, rounds: [] } },
		{ ...current, reviewed: { ...reviewed, given: undefined } },
		{ ...current, reviewed: { ...reviewed, rounds: [{ ...round, findings: 1 }] } },
		// A reviewer quest no longer runs has no CLI the record could name.
		{ ...current, reviewed: { ...reviewed, rounds: [{ ...round, reviewer: "opencode" }] } },
		{ ...current, tallies: [{ ...tally, reviewer: "opencode" }] },
	])
		expect(() => parseState(older)).toThrow(/--new/);
});

fakes("rounds saved by an older quest are refused before the reviewer runs", async () => {
	const s = setup();
	expect((await quest("--root", s.repo, "review")).code).toBe(0);
	const path = sessionFile(join(s.repo, ".git"), "feature");
	const saved = JSON.parse(readFileSync(path, "utf8"));
	expect(saved.runs).toBe(1);
	writeFileSync(path, JSON.stringify({ branch: saved.branch, sessions: [], tallies: saved.tallies }));
	const calls = s.calls().length;
	const refused = await quest("--root", s.repo, "review", "--responses", path);
	expect(refused.code).not.toBe(0);
	expect(refused.stderr).toMatch(/--new/);
	expect(s.calls().length).toBe(calls);
	writeFileSync(path, "{");
	const truncated = await quest("--root", s.repo, "review");
	expect(truncated.code).toBe(2);
	expect(truncated.stderr).toContain("not JSON; pass --new");
	expect((await quest("--root", s.repo, "review", "--new")).code).toBe(0);
});

fakes("--harness reviews alone, and its findings are the next run's to settle", async () => {
	const s = setup();
	vi.stubEnv("FAKE_REPLY", JSON.stringify({ score: 10, rationale: "Lands as is.", findings: [] }));
	expect((await quest("--root", s.repo, "review", ...SMALL)).code).toBe(0);
	write(s.repo, "src/lib.ts", "export const x = 4;\n");
	git(s.repo, "commit", "-qam", "more");
	vi.stubEnv("FAKE_REPLY", undefined);
	const claude = ["--harness", "claude", "--model", "opus", "--effort", "low"];
	const alone = await quest("--root", s.repo, "review", ...SMALL, ...claude, "--json");
	expect(alone.code, alone.stderr).toBe(0);
	expect(JSON.parse(alone.stdout).rounds.map((r: Round) => [r.reviewer, r.round, r.rung])).toEqual([
		["claude", 2, undefined],
	]);
	// Its finding is open on the branch, whoever reviews next: the next run's own draw settles it.
	const held = await quest("--root", s.repo, "review", ...SMALL);
	expect(held.code).toBe(2);
	expect(held.stderr).toContain("the last round reported 1 finding(s); pass --responses");
	write(s.repo, ".tmp/responses.md", "1. Fixed at src/lib.ts:1.\n");
	const responses = join(s.repo, ".tmp", "responses.md");
	const drawn = JSON.parse(
		(await quest("--root", s.repo, "review", ...SMALL, "--responses", responses, "--json")).stdout,
	);
	expect(
		drawn.rounds.map((r: Round) => [r.reviewer, r.round, r.earlier?.findings.map((f) => f.disposition)]),
	).toEqual([["codex", 3, ["fixed"]]]);
	// The fix is credited to the reviewer that raised the finding.
	expect(drawn.tallies.map((t: Tally) => [t.model, t.rounds, t.fixed])).toEqual([
		["gpt-6.2-sol", 2, 0],
		["opus", 1, 1],
	]);
});

test("a tally counts each finding once, for the model that raised it, through every round", () => {
	const finding = (severity: Finding["severity"], title: string): Finding => ({
		file: "a.ts",
		line: 1,
		severity,
		title,
		body: "b",
	});
	const settled = (f: Finding, disposition: Settled["disposition"], number: number): Settled => ({
		...f,
		number,
		disposition,
		reason: "r",
	});
	const base = {
		reviewer: "codex",
		model: "gpt-6.2-sol",
		effort: "high",
		rung: { name: "standard", drawn: "size" },
		branch: "feature",
		size: "M",
		sizeFrom: "default",
		session: "s1",
		base: { ref: "origin/main", sha: "a".repeat(40) },
		head: "b".repeat(40),
		usage: [],
		score: 8,
		rationale: "r",
		earlier: null,
		unchanged: false,
	} satisfies Omit<Round, "round" | "findings">;
	const opus = { reviewer: "claude", model: "claude-opus-5-5", effort: "medium", session: "s2" } as const;
	const [a, b, c] = [finding("high", "a"), finding("medium", "b"), finding("low", "c")];
	const one: Round = { ...base, round: 1, findings: [a, b, c] };
	const first = tallied([], [one]);
	expect(first).toEqual([
		{
			reviewer: "codex",
			model: "gpt-6.2-sol",
			effort: "high",
			rung: { name: "standard", drawn: "size" },
			sessions: ["s1"],
			rounds: 1,
			debut: 1,
			last: 1,
			findings: { high: 1, medium: 1, low: 1 },
			first: { high: 1, medium: 1, low: 1 },
			fixed: 0,
			refuted: 0,
		},
	]);
	// Another model's round settles them for the model that raised them, and starts its own tally: the finding it
	// keeps open is reported again, so it moves to its count at its new severity.
	const two: Round = {
		...base,
		...opus,
		round: 2,
		findings: [{ ...b, severity: "high" }],
		earlier: {
			head: base.head,
			findings: [settled(a, "fixed", 1), settled(b, "open", 2), settled(c, "refuted", 3)],
		},
	};
	const second = tallied(first, [two], [one, one, one]);
	expect(second.map((t) => [t.model, t.rounds, t.last, t.findings, t.first, t.fixed, t.refuted])).toEqual([
		["claude-opus-5-5", 1, 2, { high: 1, medium: 0, low: 0 }, { high: 1, medium: 0, low: 0 }, 0, 0],
		// The first round's findings stay as it reported them, however later rounds settle them.
		["gpt-6.2-sol", 1, 1, { high: 1, medium: 0, low: 1 }, { high: 1, medium: 1, low: 1 }, 1, 1],
	]);
	// A second seat of the same run settles the same findings its own way, which counts for nothing: each is
	// settled once, as the run's first round judged it. A round that repeats the last one counts nothing either.
	const beside: Round = {
		...base,
		reviewer: "agy",
		model: "gemini-4-neon",
		effort: "medium",
		session: "s3",
		round: 2,
		findings: [],
		earlier: {
			head: base.head,
			findings: [settled(a, "refuted", 1), settled(b, "fixed", 2), settled(c, "fixed", 3)],
		},
	};
	const seated = tallied(first, [{ ...one, unchanged: true }, two, beside], [one, one, one]);
	expect(seated.map((t) => [t.model, t.rounds, t.fixed, t.refuted])).toEqual([
		["gpt-6.2-sol", 1, 1, 1],
		["claude-opus-5-5", 1, 0, 0],
		["gemini-4-neon", 1, 0, 0],
	]);
	// A finding any seat keeps open is open, whichever seat printed first: only the first's other verdicts count.
	const reversed = tallied(first, [beside, two], [one, one, one]);
	expect(reversed.map((t) => [t.model, t.fixed, t.refuted, t.debut])).toEqual([
		["gemini-4-neon", 0, 0, 2],
		["claude-opus-5-5", 0, 0, 2],
		["gpt-6.2-sol", 1, 1, 1],
	]);
	// The same model at the same effort, in any spelling, continues its tally and names each session; a round a
	// flag named drops the rung its last one recorded.
	const { rung: _, ...flagged } = base;
	const again = tallied(second, [{ ...flagged, model: "openai/gpt-6.2-sol", session: "s4", round: 3, findings: [] }]);
	expect(again[0]).toMatchObject({ model: "gpt-6.2-sol", sessions: ["s1", "s4"], rounds: 2, last: 3 });
	expect(again[0]).not.toHaveProperty("rung");
	// Another effort is another reviewer.
	expect(tallied(second, [{ ...base, effort: "xhigh", round: 3, findings: [] }])).toHaveLength(3);
	expect(() => tallied([], [two], [one])).toThrow(/no tally/);
});

test("a question about data alone runs with no tools on either CLI", () => {
	const context = {
		mergeBase: "",
		instructions: "i",
		model: "m",
		effort: "low",
		schema: {},
		schemaFile: "/s.json",
		root: "/r",
		ranges: [],
		env: {},
	};
	const claude = claudeFlags({ ...context, tools: "" });
	expect(claude[claude.indexOf("--tools") + 1]).toBe("");
	expect(claudeFlags(context)[claudeFlags(context).indexOf("--tools") + 1]).toBe("Read,Grep,Glob,Bash,Agent");
	const codex = codexFlags({ ...context, tools: "" });
	for (const off of [
		"features.apps=false",
		"features.shell_tool=false",
		"features.unified_exec=false",
		'web_search="disabled"',
		"--skip-git-repo-check",
	])
		expect(codex).toContain(off);
	expect(codexFlags(context)).not.toContain("features.shell_tool=false");
});
