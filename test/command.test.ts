import { expect, test } from "vitest";

import { COMMAND_LIMIT, argvName, commandName, isCommandName } from "../src/core";

test.each([
	["cargo build --release", "cargo build"],
	["cd src && cargo test -p foo 2>&1 | tail -20", "cd; cargo test; tail"],
	["GH_TOKEN=ghp_secret gh pr view 1", "gh pr"],
	["curl -H 'Authorization: Bearer abcdef' https://x", "curl"],
	['git commit -m "fix; rm stuff && more"', "git commit"],
	["echo hunter2 > /tmp/x; cat < /tmp/x", "echo; cat"],
	["cat > x <<'EOF'\nsecret body; rm -rf /\nEOF\njust check", "cat; just check"],
	["env -i FOO=1 timeout 30s nice -n 10 bun test", "bun test"],
	["/usr/bin/time ./target/release/quest gate just test", "quest gate"],
	["for f in a b; do just check; done", "just check"],
	["if [[ -f x ]]; then make all; fi", "make all"],
	["x=$(git rev-parse HEAD)", "git rev-parse"],
	["git log abc123def", "git log"],
	["echo hunter", "echo"],
	["$EDITOR file", "?"],
	["# just a comment", "?"],
	["just check && just check", "just check"],
])("%j is kept as %j", (script, name) => {
	expect(commandName(script)).toBe(name);
	expect(isCommandName(name)).toBe(true);
});

test("an argument vector keeps its program and subcommand, reading a shell's script", () => {
	expect(argvName(["cargo", "build", "--release"])).toBe("cargo build");
	expect(argvName(["/bin/sh", "-c", "cd x && bun test secret"])).toBe("cd; bun test");
	expect(argvName(["node", "-e", "spin()"])).toBe("node");
});

test("a name stops at the limit, whole programs at a time", () => {
	const name = commandName(Array.from({ length: 100 }, (_, i) => `p${i}`).join("; "));
	expect(name.length).toBeLessThanOrEqual(COMMAND_LIMIT);
	expect(name.endsWith(";")).toBe(false);
	expect(isCommandName(name)).toBe(true);
});

test.each(["", "cargo build --release", "gh pr view 1", "-f x", "a\nb", "cargo Build", "x;y"])(
	"%j is no command name",
	(name) => expect(isCommandName(name)).toBe(false),
);
