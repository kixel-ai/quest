// What a session record keeps of a command it ran: each program's name and, where it takes one, its subcommand, such
// as `cd; cargo build; tail`. Arguments, assignments, redirections, and quoted text stay on the host, since a
// command line can carry a secret, such as an inline token, and records leave it. That is still enough for the
// mistake audit to tell a cheap command from a heavy one: `cargo check` from `cargo build`, `just check` from `just
// test`.

/** The longest name a record keeps, in characters; names past it are left out. */
export const COMMAND_LIMIT = 200;

/** A program's name: a path's last part, short and of plain characters, or `?` for one written otherwise. */
const PROGRAM = /^(?:[A-Za-z0-9._+][A-Za-z0-9._+-]{0,31}|\?)$/;
/** A subcommand: lowercase words joined by hyphens, as `build` or `merge-base`, never a value such as a token. */
const SUBCOMMAND = /^[a-z]{1,24}(?:-[a-z]{1,24})*$/;
const SUBCOMMAND_LIMIT = 24;

/**
 * Programs whose first argument names what they do, kept as its subcommand. Any other program's first argument is
 * data, such as `cd`'s directory or `echo`'s text, and stays on the host.
 */
const SUBCOMMANDS = new Set([
	"apt",
	"brew",
	"bun",
	"bunx",
	"cargo",
	"deno",
	"dnf",
	"docker",
	"gh",
	"git",
	"go",
	"just",
	"kubectl",
	"make",
	"nix",
	"npm",
	"npx",
	"pnpm",
	"podman",
	"quest",
	"rustup",
	"systemctl",
	"uv",
	"yarn",
]);

/** Words that open a compound command or a wrapper of the next one, skipped to reach the program it runs. */
const KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{", "}"]);
/** Words that run the command after them, with flags and a number, such as a priority or timeout, between. */
const WRAPPERS = new Set(["env", "sudo", "time", "nice", "nohup", "exec", "command", "timeout", "xargs"]);
/** Words that open a construct naming no program, whose simple command is left out. */
const SKIPPED = new Set(["for", "case", "select", "function", "done", "fi", "esac", "in", "[", "[["]);

/** Whether `name` has the form `commandName` and `argvName` give, so a record can carry it. */
export function isCommandName(name: string): boolean {
	return (
		name.length > 0 &&
		name.length <= COMMAND_LIMIT &&
		name.split("; ").every((part) => {
			const [program, sub, ...rest] = part.split(" ");
			return (
				rest.length === 0 &&
				PROGRAM.test(program!) &&
				(sub === undefined || (sub.length <= SUBCOMMAND_LIMIT && SUBCOMMAND.test(sub)))
			);
		})
	);
}

/** The programs a shell command line runs, in order and each once, as a record keeps them. */
export function commandName(script: string): string {
	return join(words(script).map(simple));
}

/** The program an argument vector runs, as a record keeps it, reading a shell's `-c` script as `commandName` does. */
export function argvName(argv: string[]): string {
	const program = argv[0]?.split("/").pop() ?? "";
	if (["sh", "bash", "zsh", "dash"].includes(program) && argv[1] === "-c" && argv[2] !== undefined) {
		return commandName(argv[2]);
	}
	return join([simple(argv)]);
}

function join(names: (string | null)[]): string {
	const seen: string[] = [];
	let length = 0;
	for (const name of names) {
		if (name === null || seen.includes(name)) continue;
		const added = (seen.length ? 2 : 0) + name.length;
		if (length + added > COMMAND_LIMIT) break;
		seen.push(name);
		length += added;
	}
	return seen.length ? seen.join("; ") : "?";
}

/** One simple command's program and subcommand, or null for one that names no program. */
function simple(command: string[]): string | null {
	let i = 0;
	const assignment = (word: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
	for (;;) {
		const word = command[i];
		if (word === undefined) return null;
		if (SKIPPED.has(word)) return null;
		if (KEYWORDS.has(word) || assignment(word)) {
			i++;
			continue;
		}
		if (WRAPPERS.has(word.split("/").pop()!) && command[i + 1] !== undefined) {
			i++;
			while (command[i] !== undefined && /^(?:-.*|\d+[smhd]?|[A-Za-z_][A-Za-z0-9_]*=.*)$/.test(command[i]!)) i++;
			continue;
		}
		break;
	}
	const base = command[i]!.split("/").pop()!;
	const program = PROGRAM.test(base) ? base : "?";
	const sub = SUBCOMMANDS.has(program) ? command[i + 1] : undefined;
	return sub !== undefined && sub.length <= SUBCOMMAND_LIMIT && SUBCOMMAND.test(sub) ? `${program} ${sub}` : program;
}

/**
 * The simple commands of a shell script, each as its words with quotes removed. Redirections and their targets,
 * here-document bodies, and comments are dropped; text inside `$(…)` or backticks counts as commands of its own.
 * This reads common scripts, not every shell grammar: what it misreads becomes a `?` or a word's own name.
 */
function words(script: string): string[][] {
	const commands: string[][] = [];
	let current: string[] = [];
	let word: string | null = null;
	const heredocs: string[] = [];
	const endWord = () => {
		if (word !== null) current.push(word);
		word = null;
	};
	const endCommand = () => {
		endWord();
		if (current.length) commands.push(current);
		current = [];
	};
	let i = 0;
	const n = script.length;
	/** Read a quoted or plain word from `i` with no command structure, as a redirection's target. */
	const target = (): string => {
		while (script[i] === " " || script[i] === "\t") i++;
		let text = "";
		while (i < n && !/[\s;&|()<>`]/.test(script[i]!)) {
			const c = script[i]!;
			if (c === "'" || c === '"') {
				const close = script.indexOf(c, i + 1);
				const end = close === -1 ? n : close;
				text += script.slice(i + 1, end);
				i = end + 1;
			} else if (c === "\\") {
				text += script[i + 1] ?? "";
				i += 2;
			} else {
				text += c;
				i++;
			}
		}
		return text;
	};
	while (i < n) {
		const c = script[i]!;
		if (c === "\n") {
			endCommand();
			i++;
			// A here-document's body runs to the line that is its delimiter alone.
			while (heredocs.length && i < n) {
				const eol = script.indexOf("\n", i);
				const line = script.slice(i, eol === -1 ? n : eol);
				i = eol === -1 ? n : eol + 1;
				if (line.trim() === heredocs[0]) heredocs.shift();
			}
		} else if (c === " " || c === "\t") {
			endWord();
			i++;
		} else if (c === "#" && word === null) {
			while (i < n && script[i] !== "\n") i++;
		} else if (c === "\\") {
			if (script[i + 1] === "\n") i += 2;
			else {
				word = (word ?? "") + (script[i + 1] ?? "");
				i += 2;
			}
		} else if (c === "'") {
			const close = script.indexOf("'", i + 1);
			const end = close === -1 ? n : close;
			word = (word ?? "") + script.slice(i + 1, end);
			i = end + 1;
		} else if (c === '"') {
			let j = i + 1;
			let text = "";
			while (j < n && script[j] !== '"') {
				if (script[j] === "\\" && j + 1 < n) j++;
				text += script[j];
				j++;
			}
			word = (word ?? "") + text;
			i = j + 1;
		} else if (c === "<" || c === ">" || (c === "&" && script[i + 1] === ">")) {
			// A redirection: a file descriptor before it, its operator, and its target are no part of the command.
			if (word !== null && /^\d+$/.test(word)) word = null;
			endWord();
			let op = "";
			while (i < n && /[<>&|-]/.test(script[i]!) && op.length < 3) op += script[i++];
			if (op === "<<<") target();
			else if (op.startsWith("<<")) heredocs.push(target());
			else if (op.endsWith("&") && /\d|-/.test(script[i] ?? "")) {
				while (/[\d-]/.test(script[i] ?? "")) i++;
			} else target();
		} else if (c === "$" && script.startsWith("((", i + 1)) {
			// Arithmetic runs no program.
			const close = script.indexOf("))", i + 3);
			word = (word ?? "") + "0";
			i = close === -1 ? n : close + 2;
		} else if (c === "$" && script[i + 1] === "(") {
			endCommand();
			i += 2;
		} else if (";&|()`".includes(c)) {
			endCommand();
			i++;
		} else {
			word = (word ?? "") + c;
			i++;
		}
	}
	endCommand();
	return commands;
}
