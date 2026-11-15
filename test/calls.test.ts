import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { type CallLine, type Sample, logCall, readCalls, sessionSample, shellGroups } from "../src/cli/calls";
import { tempDir } from "./fixture";

describe.skipIf(process.platform !== "linux")("sessionSample", () => {
	const scope = "/app.slice/agent.scope";
	/** A fake /proc and cgroup tree: each process's parent, and which are in the session's scope. */
	function host(parents: Record<number, number>, scoped: number[], self: number) {
		const proc = tempDir();
		const cgroups = tempDir();
		for (const [pid, parent] of Object.entries(parents)) {
			mkdirSync(join(proc, pid));
			// The command name may hold spaces and parentheses.
			writeFileSync(join(proc, pid, "stat"), `${pid} (a (b) c) S ${parent} 1 1 0\n`);
			writeFileSync(join(proc, pid, "cgroup"), `0::${scoped.includes(Number(pid)) ? scope : "/other.scope"}\n`);
		}
		mkdirSync(join(cgroups, scope), { recursive: true });
		writeFileSync(join(cgroups, scope, "cgroup.procs"), `${scoped.join("\n")}\n`);
		writeFileSync(join(cgroups, scope, "cpu.stat"), "usage_usec 7000\nuser_usec 5000\n");
		return { proc, cgroups, self };
	}
	const at = Date.parse("2026-11-15T10:00:00Z");
	const counted: Sample = { at: "2026-11-15T10:00:00.000Z", cgroup: scope, usage: 7000 };
	const none: Sample = { ...counted, cgroup: null, usage: null };

	test("counts a scope whose top is the harness, every other branch hanging from it", () => {
		// The harness 10, its hook shell 20 and hook 30, an MCP server 11, a tool shell 12 and its child 13, and a
		// daemon 40 whose parent left.
		const parents = { 10: 1, 20: 10, 30: 20, 11: 10, 12: 10, 13: 12, 40: 1 };
		const each = host(parents, [10, 20, 30, 11, 12, 13, 40], 30);
		expect(sessionSample(at, each)).toEqual(counted);
		expect(sessionSample(at, { ...each, harness: 10 })).toEqual(counted);
		// A harness that names itself elsewhere is not this scope's top.
		expect(sessionSample(at, { ...each, harness: 20 })).toEqual(none);
	});

	test("refuses a terminal's scope, where the harness hangs below the terminal's shell", () => {
		const parents = { 5: 1, 10: 5, 20: 10, 30: 20, 11: 10 };
		expect(sessionSample(at, host(parents, [5, 10, 20, 30, 11], 30))).toEqual(none);
		// Another tab's work beside the session in one terminal's scope.
		const shared = { 5: 1, 10: 5, 20: 10, 30: 20, 6: 5 };
		expect(sessionSample(at, { ...host(shared, [5, 10, 20, 30, 6], 30), harness: 10 })).toEqual(none);
	});

	test("refuses a hook outside the cgroup it reads", () => {
		const each = host({ 10: 1, 30: 10 }, [10], 30);
		expect(sessionSample(at, each)).toEqual(none);
	});
});

describe("shellGroups", () => {
	const t = (s: number) => new Date(Date.parse("2026-11-15T10:00:00Z") + s * 1000).toISOString();
	const cg = "/agent.scope";
	const start = (call: string, s: number, usage: number | null, extra: Partial<CallLine> = {}): CallLine =>
		({
			kind: "start",
			harness: "claude",
			session: "s",
			agent: null,
			call,
			command: `run ${call}`,
			at: t(s),
			cgroup: cg,
			usage,
			...extra,
		}) as CallLine;
	const end = (call: string, s: number, usage: number | null, extra: Partial<CallLine> = {}): CallLine =>
		({
			kind: "end",
			harness: "claude",
			session: "s",
			agent: null,
			call,
			task: null,
			at: t(s),
			cgroup: cg,
			usage,
			...extra,
		}) as CallLine;
	const stop = (s: number, running: string[], usage: number): CallLine => ({
		kind: "stop",
		harness: "claude",
		session: "s",
		running,
		at: t(s),
		cgroup: cg,
		usage,
	});

	test("charges overlapping calls together, and each lone call its own span", () => {
		const groups = shellGroups([
			start("a", 0, 1_000_000),
			start("b", 1, 1_100_000, { agent: "sub" } as Partial<CallLine>),
			end("a", 2, 1_500_000),
			end("b", 3, 2_000_000, { agent: "sub" } as Partial<CallLine>),
			start("c", 10, 3_000_000),
			end("c", 11, 3_250_400),
			// Denied or interrupted: it never returned.
			start("d", 12, 3_300_000),
		]);
		expect(groups.map((g) => g.group)).toEqual([
			{
				calls: [
					{ command: "run a", start: t(0), end: t(2) },
					{ command: "run b", start: t(1), end: t(3) },
				],
				cpu: 1000,
			},
			{ calls: [{ command: "run c", start: t(10), end: t(11) }], cpu: 250 },
		]);
		expect(groups.map((g) => [...g.sessions])).toEqual([["claude\0s", "claude\0sub"], ["claude\0s"]]);
		expect(groups[1]!.end).toBe(Date.parse(t(11)));
	});

	test("a background call runs until a turn end no longer lists its task", () => {
		const lines = [
			start("bg", 0, 0),
			end("bg", 1, 10_000, { task: "b1" } as Partial<CallLine>),
			stop(5, ["b1"], 50_000),
			start("fg", 6, 60_000),
			end("fg", 7, 70_000),
			stop(9, [], 90_000),
		];
		expect(shellGroups(lines).map((g) => [g.group.calls.map((c) => c.end), g.group.cpu])).toEqual([
			[[t(9), t(7)], 90],
		]);
		// Still running at the last sample: it runs until then.
		expect(shellGroups(lines.slice(0, 3)).map((g) => [g.group.calls[0]!.end, g.group.cpu])).toEqual([[t(5), 50]]);
	});

	test("a call outside a counted cgroup, or across a counter that changed, has no CPU", () => {
		const uncounted = { cgroup: null, usage: null } as Partial<CallLine>;
		const groups = shellGroups([
			start("a", 0, null, uncounted),
			start("b", 0, null, uncounted),
			end("a", 2, null, uncounted),
			end("b", 2, null, uncounted),
			start("c", 3, 5_000),
			end("c", 4, null, uncounted),
			start("d", 5, 9_000),
			end("d", 6, 1_000),
		]);
		expect(groups.map((g) => [g.group.calls.length, g.group.cpu])).toEqual([
			[1, null],
			[1, null],
			[1, null],
			[1, null],
		]);
	});
});

test("the call log keeps whole lines and reads from the day before a window", () => {
	const env = { XDG_STATE_HOME: tempDir() };
	const line: CallLine = {
		kind: "stop",
		harness: "claude",
		session: "s",
		running: [],
		at: "2026-11-14T23:59:00.000Z",
		cgroup: null,
		usage: null,
	};
	logCall(line, env, Date.parse(line.at));
	expect(readCalls(Date.parse("2026-11-15T00:30:00Z"), env)).toEqual([line]);
	expect(readCalls(Date.parse("2026-11-16T00:30:00Z"), env)).toEqual([]);
	logCall({ ...line, running: [""] }, env, Date.parse(line.at));
	logCall(line, env, Date.parse(line.at));
	expect(() => readCalls(Date.parse("2026-11-15T00:30:00Z"), env)).toThrow("is not a shell call quest logged");
});
