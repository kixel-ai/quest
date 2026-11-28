import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test, vi } from "vitest";

import {
	type Advice,
	type Advising,
	AdviseCapError,
	advise,
	adviseFile,
	adviceNext,
	advisors,
	parseAdvice,
	priced,
	savedAdvice,
	untrackedSession,
} from "../src/cli/advise";
import { ADVISORS } from "../src/cli/models";
import { ReviewInputError, UnansweredError } from "../src/cli/review";
import { type Pull, sessionRecords } from "../src/cli/usage";
import { type Setup, agyFakes, fakes, quest, setup } from "./review-fakes";

const ADVICE: Advice = {
	approaches: [
		{ name: "Patch", summary: "Fix the off-by-one.", tradeoffs: "Leaves the loop." },
		{ name: "Redesign", summary: "Reduce over the list.", tradeoffs: "A larger diff." },
	],
	recommendation: "Redesign",
	verdict: "revise",
	beyond: false,
	rationale: "The loop is what keeps breaking.",
	steps: ["Replace the loop with a reduce."],
};

/** Ask with the fakes as `s` set them up, recording what was queued. */
async function asked(s: Setup, options: Partial<Parameters<typeof advise>[0]> = {}) {
	const queued: Advising[] = [];
	const advised = await advise(
		{ root: s.repo, question: "Three rounds keep finding off-by-ones.", ...options },
		{
			env: process.env,
			pull: async () => ({ url: "https://github.com/acme/proj/pull/7", body: "PR-BODY text" }),
			queue: (session) => queued.push(session),
			now: () => Date.parse("2026-11-28T10:00:00Z"),
		},
	);
	return { advised, queued };
}

test("advisors are the ranked list, or --harness's entry with --model and --effort over its own", () => {
	expect(advisors({})).toEqual(ADVISORS);
	expect(ADVISORS.map((e) => e.harness)).toEqual(["agy", "codex", "claude"]);
	expect(advisors({ harness: "claude", effort: "high" })).toEqual([
		{ harness: "claude", model: "claude-fable-5-2", effort: "high" },
	]);
	expect(() => advisors({ model: "gpt-6.2-astra" })).toThrow(ReviewInputError);
});

test("advice must compare at least two approaches and recommend one of them", () => {
	expect(parseAdvice(ADVICE)).toEqual(ADVICE);
	expect(() => parseAdvice({ ...ADVICE, approaches: ADVICE.approaches.slice(1) })).toThrow("schema");
	expect(() => parseAdvice({ ...ADVICE, verdict: "maybe" })).toThrow("schema");
	expect(() => parseAdvice({ ...ADVICE, beyond: "no" })).toThrow("schema");
	expect(() => parseAdvice({ ...ADVICE, recommendation: "Rewrite" })).toThrow("did not compare");
});

test("a revision within the request's limit applies; dropping, accepting, or going past the limit hands back", () => {
	expect(adviceNext(parseAdvice(ADVICE), false)).toMatch(/^next apply: .*`Design change:`.*`quest review --new`/);
	expect(adviceNext({ ...ADVICE, verdict: "drop" }, false)).toMatch(/^next decide: .*dropping the PR/);
	expect(adviceNext({ ...ADVICE, verdict: "accept" }, false)).toMatch(/^next decide: .*accepting the open findings/);
	// An advisor that marks its advice beyond a limit no request set still applies.
	expect(adviceNext({ ...ADVICE, beyond: true }, false)).toMatch(/^next apply: /);
	expect(adviceNext({ ...ADVICE, beyond: true }, true)).toMatch(/^next decide: .*past the limit/);
});

agyFakes("a packaging-only request hands back advice to change the CLI", async () => {
	const s = setup();
	vi.stubEnv("FAKE_ASK", JSON.stringify({ ...ADVICE, recommendation: "Patch", beyond: true }));
	const run = await quest("--root", s.repo, "advise", "--limit", "fix the packaging only", "the build keeps failing");
	expect(run.code).toBe(0);
	expect(run.stdout).toContain("verdict revise, beyond the request's limit");
	expect(run.stdout.trimEnd().split("\n").at(-1)).toMatch(/^next decide: .*past the limit/);
	const turn = s.calls().find((call) => call.argv[0] !== "models")!;
	expect(turn.stdin).toContain("## The request's limit\n\nfix the packaging only");
});

test("untracked tokens price at the model's list rate, and are incomplete without one or without tokens", () => {
	const neon = priced({
		model: "gemini-4-neon",
		effort: "high",
		input: 1_000_000,
		cached: 400_000,
		output: 100_000,
		end: 0,
	});
	expect(neon).toMatchObject({ input: 600_000, cacheRead: 400_000, cacheWrite: 0, output: 100_000, complete: true });
	expect(neon.cost).toBeCloseTo(1.8 + 0.06 + 1.5);
	expect(priced({ model: "gemini-9", effort: "high", input: 10, cached: 0, output: 1, end: 0 })).toMatchObject({
		cost: 0,
		complete: false,
	});
	expect(priced({ model: "gemini-4-neon", effort: "high", input: 0, cached: 0, output: 0, end: 0 }).complete).toBe(
		false,
	);
	// A CLI that counts cached tokens apart from its input never makes a negative count.
	expect(priced({ model: "gemini-4-neon", effort: "high", input: 5, cached: 9, output: 0, end: 0 }).input).toBe(0);
});

test("an advising session is attributed to its pinned PR with the advising role", () => {
	const session = untrackedSession({
		harness: "agy",
		session: "conv",
		cwd: "/w",
		start: Date.parse("2026-11-06T10:00:00Z"),
		untracked: {
			model: "gemini-4-neon",
			effort: "high",
			input: 100,
			cached: 0,
			output: 10,
			end: Date.parse("2026-11-06T10:05:00Z"),
		},
	});
	const pull: Pull = {
		number: 7,
		url: "https://github.com/acme/proj/pull/7",
		title: "t",
		branch: "quest/m0/a",
		repository: "acme/proj",
		state: "open",
		draft: false,
		created: Date.parse("2026-11-06T09:00:00Z"),
		closed: null,
		body: "",
	};
	const records = sessionRecords({
		repository: "acme/proj",
		sessions: [session],
		evidence: [],
		pulls: [pull],
		waits: [],
		calls: [],
		since: 0,
		pins: new Map([["agy\0conv", { pull: pull.url, branch: "quest/m0/a", role: "advising", origin: "acme/proj" }]]),
	});
	expect(records.get(session)).toMatchObject({
		harness: "agy",
		role: "advising",
		pulls: [7],
		quest: "quest/m0/a.md",
		models: [{ model: "gemini-4-neon", input: 100, cacheRead: 0, output: 10, complete: true }],
		split: null,
	});
});

agyFakes("agy answers first, read-only from a private export, and its tokens are kept and queued", async () => {
	const s = setup();
	vi.stubEnv("FAKE_ASK", JSON.stringify(ADVICE));
	vi.stubEnv("ANTIGRAVITY_CONVERSATION_ID", "outer");
	const { advised, queued } = await asked(s);
	expect(advised.entry).toEqual(ADVISORS[0]);
	expect(advised.call.advice).toEqual(ADVICE);
	const turns = s.calls().filter((call) => call.argv[0] !== "models");
	expect(turns).toHaveLength(1);
	const [turn] = turns;
	expect(turn!.argv).toEqual(
		expect.arrayContaining([
			"--agent",
			"quest-advisor",
			"--dangerously-skip-permissions",
			"--disable-slash-commands",
		]),
	);
	// The coordinating session's Antigravity variables never reach it.
	expect(turn!.env.ANTIGRAVITY_CONVERSATION_ID).toBeUndefined();
	expect(turn!.cwd.startsWith(s.repo)).toBe(false);
	const files = turn!.workspace!;
	expect(files["head/src/lib.ts"]).toBe("export const x = 2;\n");
	expect(files["diff-1.diff"]).toContain("+export const x = 2;");
	const rules = JSON.parse(files["settings.json"]!).permissions.deny as string[];
	expect(rules).toEqual(expect.arrayContaining(["command(*)", "write_file(*)", "read_url(*)", "mcp(*)"]));
	// The base's instructions, not the head's, and the question, PR, and REVIEW.md reach the advisor.
	expect(files[".agents/agents/quest-advisor.md"] ?? files["workspace/.agents/agents/quest-advisor.md"]).toContain(
		"BASE-ROOT rule",
	);
	expect(turn!.stdin).toContain("Three rounds keep finding off-by-ones.");
	expect(turn!.stdin).toContain("PR-BODY text");
	expect(turn!.stdin).toContain("BASE-REVIEW rule");
	expect(queued).toEqual([
		expect.objectContaining({
			harness: "agy",
			session: "conversation-ask",
			branch: "feature",
			pull: "https://github.com/acme/proj/pull/7",
			role: "advising",
			untracked: expect.objectContaining({ model: "gemini-4-neon", input: 1000, cached: 400, output: 90 }),
		}),
	]);
	const saved = savedAdvice(s.repo, "acme/proj", 0);
	expect([...saved.pins.keys()]).toEqual(["agy\0conversation-ask"]);
	expect(saved.sessions.map((each) => [each.harness, each.id, each.models[0]!.cacheRead])).toEqual([
		["agy", "conversation-ask", 400],
	]);
});

agyFakes("a second call on a branch refuses before any advisor runs, unless forced", async () => {
	const s = setup();
	vi.stubEnv("FAKE_ASK", JSON.stringify(ADVICE));
	await asked(s);
	const before = s.calls().length;
	await expect(asked(s)).rejects.toThrow(AdviseCapError);
	expect(s.calls()).toHaveLength(before);
	const { advised } = await asked(s, { force: true });
	expect(advised.forced?.advice).toEqual(ADVICE);
	const state = JSON.parse(readFileSync(adviseFile(join(s.repo, ".git"), "feature"), "utf8"));
	expect(state.calls).toHaveLength(2);
});

fakes("a missing, logged-out, or limited advisor passes the question on, each read-only", async () => {
	const s = setup();
	vi.stubEnv("FAKE_ASK", JSON.stringify(ADVICE));
	// Only the fakes and Git are on PATH, so no installed agy answers in the fake's place.
	rmSync(join(s.bin, "agy"));
	vi.stubEnv("PATH", `${s.bin}:${dirname(execFileSync("which", ["git"], { encoding: "utf8" }).trim())}`);
	vi.stubEnv("FAKE_LIMITED", "1");
	vi.stubEnv("FAKE_FAILS", "codex");
	const { advised, queued } = await asked(s);
	expect(advised.entry).toEqual(ADVISORS[2]);
	const turns = s.calls().filter((call) => call.argv.includes("-m") || call.argv.includes("-p"));
	const codex = turns.find((call) => call.argv[0] === "exec")!;
	expect(codex.argv).toEqual(expect.arrayContaining(['sandbox_mode="read-only"', 'approval_policy="never"']));
	const claude = turns.find((call) => call.argv.includes("-p"))!;
	expect(claude.argv).toEqual(expect.arrayContaining(["--permission-mode", "dontAsk", "--setting-sources", ""]));
	expect(claude.argv[claude.argv.indexOf("--tools") + 1]).not.toMatch(/Edit|Write/);
	// The answer's session is queued; Claude Code's transcript is token-max's to read.
	expect(queued.map((each) => [each.harness, each.role, each.untracked])).toContainEqual([
		"claude",
		"advising",
		undefined,
	]);
});

agyFakes("when no advisor can run, the question fails as unavailable and saves no call", async () => {
	const s = setup();
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	const error = await asked(s).catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(UnansweredError);
	expect((error as UnansweredError).unavailable).toBe(true);
	expect(() => readFileSync(adviseFile(join(s.repo, ".git"), "feature"))).toThrow();
	const run = await quest("--root", s.repo, "advise", "stuck");
	expect(run.code).toBe(3);
});

agyFakes("an unusable reply passes the question on, and only answered calls count toward the cap", async () => {
	const s = setup();
	vi.stubEnv("FAKE_ASK", JSON.stringify({ nope: true }));
	const error = await asked(s).catch((caught: unknown) => caught);
	expect((error as UnansweredError).unavailable).toBe(false);
	// Every advisor replied and spent tokens, so the call is kept, but it holds no advice.
	const path = adviseFile(join(s.repo, ".git"), "feature");
	const state = JSON.parse(readFileSync(path, "utf8"));
	expect(state.calls.map((call: { advice: unknown }) => call.advice)).toEqual([null]);
	vi.stubEnv("FAKE_ASK", JSON.stringify(ADVICE));
	const run = await quest("--root", s.repo, "advise", "stuck", "again");
	expect(run.code).toBe(0);
	expect(run.stdout).toContain("verdict revise");
	expect(run.stdout).toContain("next apply: ");
	expect(run.stdout).toContain("recommendation Redesign");
	writeFileSync(path, "{");
	expect((await quest("--root", s.repo, "advise", "again")).code).toBe(2);
});
