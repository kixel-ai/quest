// quest fmt: the dev shell's treefmt, run directly inside that shell and through nix develop outside it, or the
// fmt task quest.toml declares instead.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { fmt } from "../src/cli/fmt";
import { initRepository, tempDir } from "./fixture";

// The stubs are shell scripts.
const posix = process.platform !== "win32";

const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

/**
 * A repository holding `files`, and a PATH directory whose `nix develop <flake> --command` runs its command and whose
 * `treefmt` exits with $TREEFMT_EXIT, each logging its arguments and directory.
 */
function setup(
	files: Record<string, string>,
	treefmt = true,
): { dir: string; env: NodeJS.ProcessEnv; log: () => string[] } {
	const dir = initRepository(tempDir());
	for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text);
	const bin = tempDir();
	const log = join(bin, "log");
	const stub = (name: string, body: string) =>
		writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $* in $PWD" >> ${quote(log)}\n${body}\n`, {
			mode: 0o755,
		});
	stub("nix", '[ "$1" = develop ] && [ "$3" = --command ] || exit 98\nshift 3\nexec "$@"');
	if (treefmt) stub("treefmt", 'exit "${TREEFMT_EXIT:-0}"');
	return {
		dir,
		env: { PATH: `${bin}:${process.env.PATH}` },
		log: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []),
	};
}

test.runIf(posix)(
	"treefmt runs from the root, directly in the repository's dev shell and through nix develop outside it",
	() => {
		const { dir, env, log } = setup({ "flake.nix": "{}" });
		mkdirSync(join(dir, "sub"));
		expect(fmt(join(dir, "sub"), ["--fail-on-change", "a.ts"], env)).toBe(0);
		expect(log()).toEqual([
			`nix develop ${dir} --command treefmt --fail-on-change a.ts in ${dir}`,
			`treefmt --fail-on-change a.ts in ${dir}`,
		]);

		const inside = setup({ "flake.nix": "{}" });
		expect(fmt(inside.dir, [], { ...inside.env, QUEST_DEV_SHELL: inside.dir, TREEFMT_EXIT: "3" })).toBe(3);
		expect(inside.log()).toEqual([`treefmt  in ${inside.dir}`]);
		// Another repository's dev shell holds another formatter.
		expect(fmt(inside.dir, [], { ...inside.env, QUEST_DEV_SHELL: tempDir() })).toBe(0);
		expect(inside.log()[1]).toMatch(/^nix develop /);
	},
);

test.runIf(posix)("treefmt needs flake.nix outside the dev shell, and treefmt inside it", () => {
	const bare = setup({});
	expect(() => fmt(bare.dir, [], bare.env)).toThrow(
		`quest fmt runs treefmt in the repository's Nix dev shell, but ${bare.dir} has no flake.nix; declare [tasks.fmt] in quest.toml to format without it`,
	);
	const shell = setup({ "flake.nix": "{}" }, false);
	expect(() => fmt(shell.dir, [], { ...shell.env, QUEST_DEV_SHELL: shell.dir })).toThrow(
		"no treefmt on PATH in this repository's dev shell; build it with quest.lib.mkFlake, or declare [tasks.fmt] in quest.toml",
	);
	expect(shell.log()).toEqual([]);
});

test.runIf(posix)("quest.toml's fmt task replaces treefmt, with its environment and the arguments", () => {
	const out = join(tempDir(), "out");
	const task = (extra: string) =>
		`[tasks.fmt]\ntier = "pr"\nrun = 'echo "$GREETING $# $1" >> ${out}'\nenvironment = { GREETING = "hi" }\n${extra}`;
	const plain = setup({ "quest.toml": task("nix = false\n") });
	expect(fmt(plain.dir, ["a b", "c"], plain.env)).toBe(0);
	expect(plain.log()).toEqual([]);
	const nixed = setup({ "flake.nix": "{}", "quest.toml": task("") });
	expect(fmt(nixed.dir, ["x"], nixed.env)).toBe(0);
	expect(nixed.log()).toEqual([
		`nix develop ${nixed.dir} --command env GREETING=hi bash -eo pipefail -c echo "$GREETING $# $1" >> ${out} quest-fmt x in ${nixed.dir}`,
	]);
	expect(readFileSync(out, "utf8")).toBe("hi 2 a b\nhi 1 x\n");

	const broken = setup({ "quest.toml": '[tasks.fmt]\ntier = "pr"\n' });
	expect(() => fmt(broken.dir, [], broken.env)).toThrow("quest.toml: [tasks.fmt]: missing `run`");
});
