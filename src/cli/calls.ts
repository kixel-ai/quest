// The shell calls an agent session runs, sampled by Quest's tool hooks around each one: the CPU counter of the
// session's cgroup, where that cgroup holds the session alone. A session's record groups the calls that overlapped
// and charges each group what the cgroup used meanwhile, which `quest gate`'s own scopes, outside it, never add to.
import { readFileSync } from "node:fs";
import { join } from "node:path/posix";

import { type ShellCall, type ShellGroup, commandLine } from "../core";
import { cgroupUsage, members } from "./supervise";
import { appendLog, logDirectory, readLog } from "./waits";

/** The session's cgroup and its CPU counter, in microseconds, when a hook sampled them. */
export interface Sample {
	at: string;
	/** The cgroup's path, or null when it held more than the session, or on a host without one. */
	cgroup: string | null;
	usage: number | null;
}

/** Whose call a line is about: a Claude Code sub-agent's carries its agent ID beside its parent's session ID. */
interface Caller {
	harness: string;
	session: string;
	agent: string | null;
}

/**
 * One line of the call log: a shell call starting, one returning, with the background task a harness moved it to,
 * or a Claude Code turn ending, with the background tasks still running then.
 */
export type CallLine = Sample &
	(
		| (Caller & { kind: "start"; call: string; command: string })
		| (Caller & { kind: "end"; call: string; task: string | null })
		| { kind: "stop"; harness: string; session: string; running: string[] }
	);

/** Where the call samples are logged. */
export const callsDirectory = (env: NodeJS.ProcessEnv = process.env) => logDirectory("calls", env);

/** Append `line` to today's call log. Throws when it cannot write. */
export function logCall(line: CallLine, env: NodeJS.ProcessEnv = process.env, now = Date.now()): void {
	appendLog(callsDirectory(env), line, now, "shell call");
}

/** A start line for `command`, cut as a record keeps it. */
export function startLine(caller: Caller, call: string, command: string, sample: Sample): CallLine {
	return { kind: "start", ...caller, call, command: commandLine(command), ...sample };
}

/**
 * The call lines logged on this host from the UTC day before `since`'s on, so a call that started before it still
 * has its start, failing on a line it cannot read.
 */
export function readCalls(since: number, env: NodeJS.ProcessEnv = process.env): CallLine[] {
	return readLog(callsDirectory(env), since - 86_400_000, parseCall, "a shell call");
}

function parseCall(line: string): CallLine | null {
	let value: Record<string, unknown>;
	try {
		value = JSON.parse(line) as Record<string, unknown>;
	} catch {
		return null;
	}
	const text = (v: unknown) => typeof v === "string" && v !== "";
	const sampled =
		typeof value?.at === "string" &&
		!Number.isNaN(Date.parse(value.at)) &&
		(value.cgroup === null || text(value.cgroup)) &&
		(value.usage === null || (typeof value.usage === "number" && value.usage >= 0)) &&
		text(value.harness) &&
		text(value.session);
	if (!sampled) return null;
	const caller = (value.agent === null || text(value.agent)) && text(value.call);
	switch (value.kind) {
		case "start":
			return caller && typeof value.command === "string" ? (value as unknown as CallLine) : null;
		case "end":
			return caller && (value.task === null || text(value.task)) ? (value as unknown as CallLine) : null;
		case "stop":
			return Array.isArray(value.running) && value.running.every(text) ? (value as unknown as CallLine) : null;
		default:
			return null;
	}
}

/** Where `sessionSample` reads processes and cgroups, and which process the hook and its harness are. */
export interface Host {
	proc: string;
	cgroups: string;
	self: number;
	/** The harness's process, where it names it, as Claude Code does in `CLAUDE_PID`. */
	harness?: number;
}

/**
 * The cgroup holding this process and its CPU counter now, or nulls where it holds more than the hook's session.
 * Such a cgroup holds one tree of processes, whose top is the harness: the hook's topmost ancestor in the cgroup, from
 * which every other branch hangs, as when an app starts each agent session in a scope of its own. A terminal's scope
 * fails, since the harness hangs below the terminal's shell, as does one shared with other work. A process whose
 * parent left, as a daemonized one's does, is the session's leftover and counts.
 */
export function sessionSample(
	now: number,
	host: Host = { proc: "/proc", cgroups: "/sys/fs/cgroup", self: process.pid },
): Sample {
	const at = new Date(now).toISOString();
	const none = { at, cgroup: null, usage: null };
	if (process.platform !== "linux") return none;
	const path = readFileSync(join(host.proc, String(host.self), "cgroup"), "utf8")
		.split("\n")
		.find((line) => line.startsWith("0::"))
		?.slice(3);
	if (path === undefined) return none;
	const group = join(host.cgroups, path);
	const inside = new Set(members(group));
	const parents = new Map<number, number | undefined>();
	const parent = (pid: number) => {
		if (!parents.has(pid)) parents.set(pid, parentOf(host.proc, pid));
		return parents.get(pid);
	};
	const chain = new Set<number>();
	let top = host.self;
	for (let pid: number | undefined = host.self; pid !== undefined && inside.has(pid); pid = parent(pid)) {
		chain.add(pid);
		top = pid;
	}
	if (!chain.has(host.self) || (host.harness !== undefined && host.harness !== top)) return none;
	for (const pid of inside) {
		if (chain.has(pid)) continue;
		// The chain member this process hangs from, or undefined for a tree whose root's parent left the cgroup.
		let at: number | undefined = parent(pid);
		while (at !== undefined && inside.has(at) && !chain.has(at)) at = parent(at);
		if (at !== undefined && chain.has(at) && at !== top) return none;
	}
	const usage = cgroupUsage(group);
	return usage === null ? none : { at, cgroup: path, usage };
}

/** Field 4 of /proc/<pid>/stat, or undefined once the process is gone. */
function parentOf(proc: string, pid: number): number | undefined {
	let stat: string;
	try {
		stat = readFileSync(join(proc, String(pid), "stat"), "utf8");
	} catch (error) {
		if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) return undefined;
		throw error;
	}
	return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
}

/** A shell group, and the sessions, as `harness\0session` with a Claude sub-agent's agent ID, that ran its calls. */
export interface OwnedGroup {
	group: ShellGroup;
	sessions: Set<string>;
	/** Its last call's end, epoch ms. */
	end: number;
}

type Start = Extract<CallLine, { kind: "start" }>;

/**
 * The calls in `lines`, grouped where they overlapped in one cgroup, each group charged what its cgroup used from its
 * first call's start to its last call's end. A call that never returned, as one denied or interrupted, is left out. A
 * call a Claude Code session moved to the background runs until the first turn end that no longer lists its task,
 * else until its cgroup's last sample. A call sampled outside a counted cgroup is a group of its own, without CPU.
 */
export function shellGroups(lines: CallLine[]): OwnedGroup[] {
	const callKey = (l: { harness: string; session: string; call: string }) => `${l.harness}\0${l.session}\0${l.call}`;
	const ends = new Map<string, Extract<CallLine, { kind: "end" }>>();
	const stops = new Map<string, Extract<CallLine, { kind: "stop" }>[]>();
	const last = new Map<string, Sample>();
	const ms = (s: Sample) => Date.parse(s.at);
	for (const line of lines) {
		if (line.kind === "end") ends.set(callKey(line), line);
		if (line.kind === "stop") {
			const key = `${line.harness}\0${line.session}`;
			stops.set(key, [...(stops.get(key) ?? []), line]);
		}
		if (line.cgroup !== null && ms(line) >= ms(last.get(line.cgroup) ?? line)) last.set(line.cgroup, line);
	}
	const calls: { start: Start; end: Sample }[] = [];
	for (const start of lines) {
		if (start.kind !== "start") continue;
		const returned = ends.get(callKey(start));
		if (!returned || ms(returned) < ms(start)) continue;
		let end: Sample = returned;
		if (returned.task !== null) {
			const finished = (stops.get(`${start.harness}\0${start.session}`) ?? [])
				.filter((stop) => ms(stop) >= ms(returned) && !stop.running.includes(returned.task!))
				.sort((a, b) => ms(a) - ms(b))[0];
			end = finished ?? (start.cgroup === null ? returned : (last.get(start.cgroup) ?? returned));
		}
		calls.push({ start, end });
	}
	calls.sort((a, b) => ms(a.start) - ms(b.start));
	const groups: { calls: typeof calls; end: Sample }[] = [];
	const open = new Map<string, (typeof groups)[number]>();
	for (const call of calls) {
		const current = call.start.cgroup === null ? undefined : open.get(call.start.cgroup);
		if (current && ms(call.start) <= ms(current.end)) {
			current.calls.push(call);
			if (ms(call.end) > ms(current.end)) current.end = call.end;
			continue;
		}
		const group = { calls: [call], end: call.end };
		groups.push(group);
		if (call.start.cgroup !== null) open.set(call.start.cgroup, group);
	}
	return groups.map(({ calls: grouped, end }) => {
		const first = grouped[0]!.start;
		const counted =
			first.cgroup !== null &&
			end.cgroup === first.cgroup &&
			first.usage !== null &&
			end.usage !== null &&
			end.usage >= first.usage;
		return {
			group: {
				calls: grouped.map((c): ShellCall => ({ command: c.start.command, start: c.start.at, end: c.end.at })),
				cpu: counted ? Math.round((end.usage! - first.usage!) / 1000) : null,
			},
			sessions: new Set(grouped.map((c) => `${c.start.harness}\0${c.start.agent ?? c.start.session}`)),
			end: ms(end),
		};
	});
}
