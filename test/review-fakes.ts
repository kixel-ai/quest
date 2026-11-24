// The fake Codex and Claude Code CLIs and the fixture clone the review tests run them in.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, vi } from "vitest";

import { type Output, main } from "../src/cli/main";
import { tempDir } from "./fixture";

/** The fake CLIs are shebang scripts found on a POSIX PATH, which Windows cannot run. */
export const fakes = test.skipIf(process.platform === "win32");

/** Whether the temporary directory matches names case-insensitively, as macOS's default volume does. */
export const caseInsensitive = existsSync(realpathSync(tmpdir()).toUpperCase());

/** A fake-CLI test that runs agy, which quest refuses where names match case-insensitively. */
export const agyFakes = test.skipIf(process.platform === "win32" || caseInsensitive);

export const FINDING = {
	file: "src/lib.ts",
	line: 2,
	severity: "high",
	title: "Off by one",
	body: "average([3]) is 0.",
};

export const CODEX_LOGGED_OUT =
	"codex is not logged in to its default profile (CODEX_HOME is unset); run `codex login`";
export const CLAUDE_LOGGED_OUT =
	"claude is not logged in to its default profile (CLAUDE_CONFIG_DIR is unset); run `claude auth login`";

/**
 * The findings turn's reply, `reply`: FAKE_REPLY, or one finding. A JSON reply without `earlier` settles
 * each earlier finding the prompt numbers as FAKE_DISPOSITION says, `fixed` by default, and one without `risk`
 * reports FAKE_RAISE's tier, else the tier the prompt says the change was classified. FAKE_RAISE as
 * `<tier>@<effort>` raises only in turns at that effort.
 */
const REPLY = `
const listed = /<earlier-findings>\\n([\\s\\S]*?)\\n<\\/earlier-findings>/.exec(stdin)?.[1] ?? "";
const earlier = [...listed.matchAll(/^(\\d+)\\. /gm)].map((m) => ({
	finding: Number(m[1]),
	disposition: process.env.FAKE_DISPOSITION ?? "fixed",
	reason: "Checked against the head.",
}));
const classified = /was classified (low|medium|high) risk/.exec(stdin)?.[1] ?? "medium";
const [raise, raiseAt] = (process.env.FAKE_RAISE ?? "").split("@");
const effort = argv.includes("--effort")
	? argv[argv.indexOf("--effort") + 1]
	: JSON.parse((argv.find((arg) => arg.startsWith("model_reasoning_effort=")) ?? "=null").split("=")[1]);
const risk = raise && (!raiseAt || raiseAt === effort)
	? { tier: raise, reason: "It rewrites the wire format peers read." }
	: { tier: classified, reason: "As classified." };
let reply = process.env.FAKE_REPLY ?? JSON.stringify({ score: 8, rationale: "Lands once the off-by-one is fixed.", findings: [${JSON.stringify(FINDING)}] });
try {
	const parsed = JSON.parse(reply);
	if (parsed && typeof parsed === "object" && !("earlier" in parsed)) reply = JSON.stringify({ ...parsed, earlier });
	if (parsed && typeof parsed === "object" && !("risk" in parsed)) reply = JSON.stringify({ ...JSON.parse(reply), risk });
} catch {}
`;

/** The classifier's reply: FAKE_RISK, or medium. */
const RISK_REPLY = `JSON.stringify(process.env.FAKE_RISK ? JSON.parse(process.env.FAKE_RISK) : { tier: "medium", reason: "It changes what the library returns." })`;

/**
 * Records one call as its own file in FAKE_LOG, a directory, renamed into place
 * once whole, named by its microsecond start so the files sort in call order. A
 * fake the review aborts can die mid-write, and a partial line in one shared
 * log would break the reader.
 */
const LOG = `
const logged = (call) => {
	const name = Math.round((performance.timeOrigin + performance.now()) * 1000).toString() + "-" + process.pid;
	const file = require("node:path").join(process.env.FAKE_LOG, name);
	fs.writeFileSync(file + ".tmp", JSON.stringify(call));
	fs.renameSync(file + ".tmp", file + ".json");
};
`;

/**
 * Fake reviewer CLIs. Each logs its argv, stdin, and the variables it was
 * given, then answers as the FAKE_* variables say. FAKE_LOGGED_OUT removes the
 * stored login, so only a credential variable the real CLI reads, or Claude
 * Code's switch to a cloud provider, authenticates; like the real ones,
 * `claude auth status` counts such a variable, and `codex login status` counts
 * CODEX_ACCESS_TOKEN but not CODEX_API_KEY. FAKE_REJECTED has the API
 * reject the login in each turn with the real CLI's error, in the style it
 * names. FAKE_LIMITED fails a turn on the account's usage limit with the real
 * CLI's error, naming its reset unless set to `unknown`; for agy, `stderr`
 * reports success but exits 1 with the error only on stderr, and
 * FAKE_EMPTY_ERROR fails its first turn with an empty error. FAKE_CLASSIFY fails
 * the classifier's turn of each `<harness>-rejected` or `<harness>-limited` it
 * lists, the same way. FAKE_FAILS limits FAKE_LOGGED_OUT, FAKE_REJECTED, and
 * FAKE_LIMITED to the harnesses and models it lists, comma-separated, so one
 * reviewer fails while the next runs. FAKE_QUOTED fails Claude Code's findings
 * turn with a reply that only quotes a limit's message. FAKE_REPLY replaces the
 * findings reply.
 */
export const FAKES: Record<string, string> = {
	claude: `
const fs = require("node:fs");${LOG}
const argv = process.argv.slice(2);
const stdin = fs.readFileSync(0, "utf8");
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(CLAUDE|CODEX|ANTHROPIC|FAKE_HOST|PATH$)/.test(k)));
logged({ argv, stdin, env, cwd: process.cwd() });
// FAKE_FAILS limits the FAKE_* failures to the harnesses and models it lists.
const model = argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : argv.includes("-m") ? argv[argv.indexOf("-m") + 1] : undefined;
const only = process.env.FAKE_FAILS?.split(",");
const fake = (name) => (!only || only.includes("claude") || only.includes(model) ? process.env[name] : undefined);
const credential = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"].some((k) => process.env[k]);
const provider = Object.entries(process.env).some(([k, v]) => k.startsWith("CLAUDE_CODE_USE_") && v === "1");
const loggedIn = !fake("FAKE_LOGGED_OUT") || credential || provider;
if (argv[0] === "auth") process.exit(loggedIn ? 0 : 1);
const at = (flag) => argv[argv.indexOf(flag) + 1];
const result = (fields) => console.log(JSON.stringify({ type: "result", is_error: false, ...fields }));
const rejected = fake("FAKE_REJECTED") ?? (loggedIn ? undefined : "status");
if (rejected) {
	const session_id = at("--session-id") ?? at("--resume");
	if (rejected === "status") {
		result({ session_id, is_error: true, api_error_status: 401, result: "Failed to authenticate. API Error: 401 Invalid bearer token" });
	} else if (rejected === "stderr") {
		console.error("Login expired · Please run /login");
	} else {
		result({ session_id, is_error: true, result: "OAuth token revoked · Please run /login" });
	}
	process.exit(1);
}
// A turn that fails without the CLI's error, its reply only quoting a limit's message.
if (process.env.FAKE_QUOTED && argv.includes("--resume")) {
	result({ session_id: at("--resume"), result: "The diff prints: You've hit your weekly limit · resets Nov 5, 3pm (UTC)" });
	process.exit(1);
}
// The limit hits the findings turn, after the review turn passed.
if (fake("FAKE_LIMITED") && argv.includes("--resume")) {
	if (fake("FAKE_LIMITED") !== "unknown") {
		console.log(JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1900000000 } }));
	}
	result({ session_id: at("--resume"), is_error: true, result: "You've hit your weekly limit · resets Nov 5, 3pm (UTC)" });
	process.exit(1);
}
const usage = { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 };
const failing = (process.env.FAKE_CLASSIFY ?? "").split(",");
if (argv.includes("--session-id") && argv.includes("--json-schema")) {
	if (failing.includes("claude-rejected")) {
		result({ session_id: at("--session-id"), is_error: true, api_error_status: 401, result: "Failed to authenticate. API Error: 401 Invalid bearer token" });
		process.exit(1);
	}
	if (failing.includes("claude-limited")) {
		console.log(JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1900000000 } }));
		result({ session_id: at("--session-id"), is_error: true, result: "You've hit your weekly limit · resets Nov 5, 3pm (UTC)" });
		process.exit(1);
	}
	const reply = failing.includes("claude-unusable") ? JSON.stringify({ tier: "huge", reason: "x" }) : ${RISK_REPLY};
	result({
		session_id: at("--session-id"),
		result: reply,
		structured_output: JSON.parse(reply),
		usage: { ...usage, input_tokens: 40, output_tokens: 3 },
	});
} else if (argv.includes("--session-id")) {
	result({
		session_id: at("--session-id"),
		result: "Found an off-by-one.",
		usage,
		modelUsage: {
			"claude-small": { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
			"claude-big": { inputTokens: 10, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 90 },
		},
	});
} else {
	${REPLY}
	result({
		session_id: at("--resume"),
		result: reply,
		structured_output: process.env.FAKE_REPLY ? undefined : JSON.parse(reply),
		usage: { ...usage, input_tokens: 5, cache_read_input_tokens: 80, cache_creation_input_tokens: 15, output_tokens: 7 },
		modelUsage: { "claude-big": { inputTokens: 15, outputTokens: 57 } },
	});
}
`,
	codex: `
const fs = require("node:fs");${LOG}
const argv = process.argv.slice(2);
const stdin = fs.readFileSync(0, "utf8");
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(CLAUDE|CODEX|ANTHROPIC|FAKE_HOST|PATH$)/.test(k)));
logged({ argv, stdin, env, cwd: process.cwd() });
// FAKE_FAILS limits the FAKE_* failures to the harnesses and models it lists.
const model = argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : argv.includes("-m") ? argv[argv.indexOf("-m") + 1] : undefined;
const only = process.env.FAKE_FAILS?.split(",");
const fake = (name) => (!only || only.includes("codex") || only.includes(model) ? process.env[name] : undefined);
if (argv[0] === "login") process.exit(fake("FAKE_LOGGED_OUT") && !process.env.CODEX_ACCESS_TOKEN ? 1 : 0);
// FAKE_HANG hangs the first turn until it is stopped, writing its pid there, and lets later turns run.
if (process.env.FAKE_HANG && !fs.existsSync(process.env.FAKE_HANG)) {
	// It takes a while to exit when asked to, as a CLI saving its session does.
	process.on("SIGTERM", () => setTimeout(() => process.exit(143), 300));
	fs.writeFileSync(process.env.FAKE_HANG, String(process.pid));
	setInterval(() => {}, 1000);
	return;
}
const event = (value) => console.log(JSON.stringify(value));
const loggedIn = !fake("FAKE_LOGGED_OUT") || process.env.CODEX_API_KEY || process.env.CODEX_ACCESS_TOKEN;
const rejected = fake("FAKE_REJECTED") ?? (loggedIn ? undefined : "turn");
if (rejected === "turn") {
	const message = "unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses";
	event({ type: "thread.started", thread_id: "thread-1" });
	event({ type: "error", message: "Reconnecting... 1/5 (" + message + ")" });
	event({ type: "turn.failed", error: { message } });
	process.exit(1);
}
if (rejected) {
	console.error("Error: Your access token could not be refreshed because your refresh token was revoked. Please log out and sign in again.");
	process.exit(1);
}
// A CLI may name a model it does not serve only on stderr, with no event.
if (fake("FAKE_LIMITED") === "unserved-stderr") {
	console.error("The '" + model + "' model is not supported when using Codex with a ChatGPT account.");
	process.exit(1);
}
if (fake("FAKE_LIMITED")) {
	const message = fake("FAKE_LIMITED") === "retried"
		? "exceeded retry limit, last status: 429 Too Many Requests"
		: fake("FAKE_LIMITED") === "unknown"
		? "You've hit your usage limit."
		: fake("FAKE_LIMITED") === "unserved"
		? "The '" + model + "' model is not supported when using Codex with a ChatGPT account."
		: "You've hit your usage limit. Visit https://chatgpt.com/settings/usage to purchase more credits or try again at Nov 5th, 2026 3:15 PM.";
	event({ type: "thread.started", thread_id: "thread-1" });
	event({ type: "error", message });
	event({ type: "turn.failed", error: { message } });
	process.exit(1);
}
const message = (text) => event({ type: "item.completed", item: { type: "agent_message", text } });
const zero = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
if (argv[1] === "review") {
	event({ type: "thread.started", thread_id: "thread-1" });
	message("Found an off-by-one.");
	event({ type: "turn.completed", usage: zero });
} else if (argv[1] !== "resume") {
	event({ type: "thread.started", thread_id: "thread-classify" });
	const failing = (process.env.FAKE_CLASSIFY ?? "").split(",");
	if (failing.includes("codex-rejected")) {
		event({ type: "turn.failed", error: { message: "unexpected status 401 Unauthorized: Missing bearer or basic authentication in header" } });
		process.exit(1);
	}
	if (failing.includes("codex-limited")) {
		const message = "You've hit your usage limit. Visit https://chatgpt.com/settings/usage to purchase more credits or try again at Nov 5th, 2026 3:15 PM.";
		event({ type: "turn.failed", error: { message } });
		process.exit(1);
	}
	message(failing.includes("codex-unusable") ? "not JSON" : ${RISK_REPLY});
	event({ type: "turn.completed", usage: { input_tokens: 40, cached_input_tokens: 0, output_tokens: 3 } });
} else {
	event({ type: "thread.started", thread_id: argv[argv.length - 2] });
	message("Checking the findings.");
	${REPLY}
	message(reply);
	event({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 7 } });
}
`,
	// Antigravity's print mode: the prompt is one stream-json line on stdin, and the turn's directory is logged as it stood,
	// since quest removes it after the turn. FAKE_DENIED ends a turn on a denied command, as print mode does.
	agy: `
const fs = require("node:fs");
const path = require("node:path");${LOG}
const argv = process.argv.slice(2);
const raw = fs.readFileSync(0, "utf8");
const stdin = raw ? JSON.parse(raw).message.content : "";
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(CLAUDE|CODEX|ANTHROPIC|ANTIGRAVITY|AGY|GEMINI|GOOGLE|FAKE_HOST|PATH$)/.test(k)));
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
	entry.isDirectory() ? walk(path.join(dir, entry.name)).map((name) => entry.name + "/" + name) : [entry.name]);
// A turn runs in its directory's workspace, so the whole directory, its export included, is logged.
const workspace = argv[0] === "models" ? null : Object.fromEntries(walk("..").map((name) => [name, fs.readFileSync(path.join("..", name), "utf8")]));
logged({ argv, stdin, env, cwd: process.cwd(), workspace });
const model = argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : undefined;
const only = process.env.FAKE_FAILS?.split(",");
const fake = (name) => (!only || only.includes("agy") || only.includes(model) ? process.env[name] : undefined);
if (argv[0] === "models") {
	console.log("Fetching available models...");
	if (fake("FAKE_LOGGED_OUT")) {
		console.log("Error: Please sign in to view available models. Launch the CLI without arguments to sign in.");
		process.exit(1);
	}
	if (fake("FAKE_OFFLINE")) {
		console.log("Error: dial tcp: lookup cloudcode-pa.googleapis.com: no such host");
		process.exit(1);
	}
	console.log("gemini-4-neon-xhigh\\tGemini 4 Neon (XHigh)");
	process.exit(0);
}
const at = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
const conversation = at("--conversation") ?? "conversation-" + (at("--json-schema") ? "ask" : "1");
const event = (value) => console.log(JSON.stringify(value));
// Each step reports its own usage; the result's sums the conversation, a resumed one's earlier turns included.
const result = (fields, ...steps) => {
	const usage = { input_tokens: at("--conversation") ? 1000 : 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0 };
	for (const [index, step] of steps.entries()) {
		event({ event: "step_update", step_update: { conversation_id: conversation, step_index: index + 1, state: "ACTIVE", step_type: "agent_response" } });
		event({ event: "step_update", step_update: { conversation_id: conversation, step_index: index + 1, state: "DONE", step_type: "agent_response", usage: step } });
		for (const key of Object.keys(usage)) usage[key] += step[key];
	}
	event({ event: "result", result: { conversation_id: conversation, status: "SUCCESS", response: "", num_turns: 1, usage, ...fields } });
};
const tokens = (input_tokens, output_tokens, thinking_tokens, cache_read_tokens) => ({ input_tokens, output_tokens, thinking_tokens, cache_read_tokens });
const fail = (error) => {
	result({ status: "ERROR", error });
	console.error("error: " + error);
	process.exit(1);
};
const QUOTA = (reset) => "Error 429, Message: Quota exhausted for gemini-4-neon., Status: RESOURCE_EXHAUSTED, Details: [map[@type:type.googleapis.com/google.rpc.ErrorInfo domain:cloudcode-pa.googleapis.com metadata:map[" + reset + "] reason:QUOTA_EXHAUSTED]]";
event({ event: "init", conversation_id: conversation, init: { model, cwd: process.cwd(), tools: [], permission_mode: "always-proceed" } });
if (fake("FAKE_REJECTED")) fail("authentication failed or timed out");
const failing = (process.env.FAKE_CLASSIFY ?? "").split(",");
if (at("--json-schema") && !at("--conversation")) {
	if (failing.includes("agy-rejected")) fail("authentication failed or timed out");
	if (failing.includes("agy-limited")) fail(QUOTA("quotaResetTimeStamp:2030-03-17T17:46:40Z"));
	const reply = failing.includes("agy-unusable") ? JSON.stringify({ tier: "huge", reason: "x" }) : ${RISK_REPLY};
	result({ response: reply + "\\n", structured_output: JSON.parse(reply) }, tokens(40, 3, 1, 0));
} else if (!at("--conversation")) {
	if (process.env.FAKE_EMPTY_ERROR) {
		result({ status: "ERROR", error: "" });
		console.error("error: something broke");
		process.exit(1);
	}
	if (process.env.FAKE_DENIED) {
		result({ denied_actions: [{ action: "command", display_name: "Bash" }] });
		process.exit(0);
	}
	result({ response: "Found an off-by-one.\\n" }, tokens(60, 30, 25, 10), tokens(30, 20, 15, 0));
} else {
	if (fake("FAKE_LIMITED") === "stderr") {
		result({});
		console.error("error: " + QUOTA("quotaResetTimeStamp:2030-03-17T17:46:40Z"));
		process.exit(1);
	}
	if (fake("FAKE_LIMITED")) fail(QUOTA(fake("FAKE_LIMITED") === "unknown" ? "" : "quotaResetDelay:3600s quotaResetTimeStamp:2030-03-17T17:46:40Z"));
	${REPLY}
	result(
		{ response: reply + "\\n", structured_output: process.env.FAKE_REPLY ? undefined : JSON.parse(reply) },
		tokens(20, 7, 2, 80),
	);
}
`,
};

export const git = (dir: string, ...args: string[]) =>
	execFileSync("git", ["-C", dir, "-c", "user.name=Fixture", "-c", "user.email=fixture@localhost", ...args], {
		encoding: "utf8",
	}).trim();

export function write(dir: string, path: string, text: string) {
	mkdirSync(join(dir, path, ".."), { recursive: true });
	writeFileSync(join(dir, path), text);
}

export interface Setup {
	repo: string;
	bin: string;
	/** Every logged invocation of the fake Codex and Claude Code. */
	calls(): Call[];
}

export interface Call {
	argv: string[];
	stdin: string;
	env: Record<string, string>;
	cwd: string;
	/** The files of an Antigravity turn's directory, beside and in its working directory, as it ran. */
	workspace?: Record<string, string> | null;
}

/** Credentials and routes the running session may hold, cleared so each test sets its own. */
const HOST_CREDENTIALS = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_AWS_API_KEY",
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_CUSTOM_HEADERS",
	"ANTHROPIC_FOUNDRY_API_KEY",
	"ANTHROPIC_FOUNDRY_AUTH_TOKEN",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
	...["BEDROCK", "VERTEX", "FOUNDRY", "MANTLE", "ANTHROPIC_AWS", "ANTHROPIC_GOOGLE_CLOUD"].map(
		(provider) => `CLAUDE_CODE_USE_${provider}`,
	),
	"CODEX_API_KEY",
	"CODEX_ACCESS_TOKEN",
	"CODEX_CA_CERTIFICATE",
];

/**
 * A clone whose origin's main holds instructions and review rules, checked out
 * on a branch that edits its own AGENTS.md and a file in `src/`.
 */
export function setup(host: "CLAUDECODE" | "CODEX_THREAD_ID" | null = "CLAUDECODE"): Setup {
	const dir = tempDir();
	const bin = join(dir, "bin");
	mkdirSync(bin);
	for (const [name, body] of Object.entries(FAKES)) {
		writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`);
		chmodSync(join(bin, name), 0o755);
	}
	const origin = join(dir, "origin.git");
	execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
	const repo = join(dir, "repo");
	execFileSync("git", ["init", "-q", "-b", "main", repo]);
	write(repo, "AGENTS.md", "BASE-ROOT rule\n");
	write(repo, "src/AGENTS.md", "BASE-SRC rule\n");
	write(repo, "docs/AGENTS.md", "BASE-DOCS rule\n");
	write(repo, "REVIEW.md", "BASE-REVIEW rule\n");
	write(repo, "src/lib.ts", "export const x = 1;\n");
	write(repo, ".gitignore", ".tmp/\n");
	git(repo, "add", ".");
	git(repo, "commit", "-qm", "base");
	git(repo, "remote", "add", "origin", origin);
	git(repo, "push", "-q", "origin", "main");
	git(repo, "checkout", "-qb", "feature");
	write(repo, "AGENTS.md", "HEAD-ROOT rule\n");
	write(repo, "src/lib.ts", "export const x = 2;\n");
	git(repo, "commit", "-qam", "change");

	const log = join(dir, "calls");
	mkdirSync(log);
	vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
	// Every draw takes its first choice: the size's rung, and each rung's models in the order listed.
	vi.spyOn(Math, "random").mockReturnValue(0);
	vi.stubEnv("FAKE_LOG", log);
	// The session's own profile would change the logged-out errors.
	const unset = [
		...HOST_CREDENTIALS,
		"CLAUDECODE",
		"CODEX_THREAD_ID",
		"ANTIGRAVITY_CONVERSATION_ID",
		"CLAUDE_CONFIG_DIR",
		"CODEX_HOME",
		"OPENAI_BASE_URL",
	];
	for (const name of [
		...unset,
		"FAKE_LOGGED_OUT",
		"FAKE_REJECTED",
		"FAKE_LIMITED",
		"FAKE_FAILS",
		"FAKE_QUOTED",
		"FAKE_HANG",
		"FAKE_DISPOSITION",
		"FAKE_RISK",
		"FAKE_RAISE",
		"FAKE_DENIED",
		"FAKE_CLASSIFY",
	]) {
		vi.stubEnv(name, undefined);
	}
	if (host === "CLAUDECODE") vi.stubEnv("CLAUDECODE", "1");
	if (host === "CODEX_THREAD_ID") vi.stubEnv("CODEX_THREAD_ID", "parent");
	// Only whole calls: a fake's unfinished write stays a .tmp file.
	const read = (path: string) =>
		readdirSync(path)
			.filter((name) => name.endsWith(".json"))
			.sort()
			.map((name) => JSON.parse(readFileSync(join(path, name), "utf8")));
	return { repo, bin, calls: () => read(log) };
}

/** The effort a Codex or Claude Code turn runs at, or null for a status check. */
export function effortOf(call: Call): string | null {
	const flag = call.argv.indexOf("--effort");
	if (flag >= 0) return call.argv[flag + 1]!;
	const setting = call.argv.find((arg) => arg.startsWith("model_reasoning_effort="));
	return setting ? JSON.parse(setting.slice("model_reasoning_effort=".length)) : null;
}

/** The turns at `effort`, so each seat of a run, which run at once on the same CLI, read apart. */
export const at = (calls: Call[], effort: string) => calls.filter((call) => effortOf(call) === effort);

export async function quest(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	let stdout = "";
	let stderr = "";
	const out: Output = {
		stdout: (text) => {
			stdout += text;
		},
		stderr: (text) => {
			stderr += text;
		},
	};
	const code = await main(args, out);
	return { code, stdout, stderr };
}
