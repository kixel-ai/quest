// Whether a review of one head still covers a later one that only merged the base. A merge of the base that is the
// clean merge of its parents adds nothing of the PR's own, though it changes `git diff <base>...<head>`'s text
// wherever the base touched a file the PR touches. So a review carries along the head's first-parent chain across
// such merges, each checked by redoing it: git's own line merge, ported in `xdiff.ts`, so a merge queue that cannot
// run git judges a head as `quest` does.
//
// A file only one parent changed since their merge base must be that parent's; one both changed must be their
// line merge, without conflicts other than the quest link lists `resolveLists` settles where `.gitattributes` gives
// the path the `quest` driver. Anything this cannot establish as git's clean merge, such as a binary file, another
// merge driver, a symlink or submodule both changed, or a rename one side made of a file the other changed (seen
// here as a delete against an edit), does not count, so the review stays stale.

import { merge, render, resolveLists } from "./merge";

/** A tree's entry, as git stores it. */
export interface TreeEntry {
	type: "blob" | "tree" | "commit";
	/** Git's mode, such as `100644`, `100755`, `120000`, or `040000`. */
	mode: string;
	oid: string;
}

/** A repository's history, as a forge or a local clone reads it. */
export interface History {
	/** A commit's root tree and parents, the first parent first. */
	commit(sha: string): Promise<{ tree: string; parents: string[] }>;
	/** A tree's entries by name. */
	tree(oid: string): Promise<Map<string, TreeEntry>>;
	/** A blob's bytes. */
	blob(oid: string): Promise<Uint8Array>;
	/** The merge base of two commits, or null when they have none, or several. */
	mergeBase(a: string, b: string): Promise<string | null>;
	/** Whether the PR's base branch reaches `sha`. */
	onBase(sha: string): Promise<boolean>;
}

/**
 * The commits a head's review may come from: the head, then each first parent back across merges of the base that
 * are clean merges of their parents. It reads the chain only as far as asked, once.
 */
export class BaseMerges {
	readonly #history: Cached;
	readonly #chain: string[];
	#ended = false;

	constructor(history: History, head: string) {
		this.#history = new Cached(history);
		this.#chain = [head.toLowerCase()];
	}

	/** Whether a review of `sha` covers the head: it is the head, or the head only merged the base since. */
	async reaches(sha: string): Promise<boolean> {
		const wanted = sha.toLowerCase();
		for (;;) {
			if (this.#chain.includes(wanted)) return true;
			if (this.#ended) return false;
			const next = await this.#step(this.#chain.at(-1)!);
			if (next === null) this.#ended = true;
			else this.#chain.push(next);
		}
	}

	/** The first parent of `sha` when `sha` is a clean merge of the base, which it is not when the base reaches it. */
	async #step(sha: string): Promise<string | null> {
		const history = this.#history;
		if (await history.onBase(sha)) return null;
		const { tree, parents } = await history.commit(sha);
		if (parents.length !== 2) return null;
		const [ours, theirs] = parents as [string, string];
		if (!(await history.onBase(theirs))) return null;
		const base = await history.mergeBase(ours, theirs);
		if (base === null) return null;
		const [b, o, t] = await Promise.all(
			[base, ours, theirs].map(async (each) => (await history.commit(each)).tree),
		);
		const merged = new TreeMerge(history, [b!, o!, t!]);
		return (await merged.matches("", b!, o!, t!, tree)) ? ours : null;
	}
}

/** A history that reads each tree and blob once, since a walk reads the same ones from several commits. */
class Cached implements History {
	readonly #history: History;
	readonly #trees = new Map<string, Promise<Map<string, TreeEntry>>>();
	readonly #blobs = new Map<string, Promise<Uint8Array>>();

	constructor(history: History) {
		this.#history = history;
	}

	commit(sha: string) {
		return this.#history.commit(sha);
	}

	tree(oid: string) {
		let found = this.#trees.get(oid);
		if (found === undefined) this.#trees.set(oid, (found = this.#history.tree(oid)));
		return found;
	}

	blob(oid: string) {
		let found = this.#blobs.get(oid);
		if (found === undefined) this.#blobs.set(oid, (found = this.#history.blob(oid)));
		return found;
	}

	mergeBase(a: string, b: string) {
		return this.#history.mergeBase(a, b);
	}

	onBase(sha: string) {
		return this.#history.onBase(sha);
	}
}

/** How git merges a path both sides changed, as its `merge` attribute says: by lines, by the `quest` driver, or otherwise. */
type Driver = "text" | "quest" | "other";

/** The check of one merge's tree against its parents' trees and their merge base's. */
class TreeMerge {
	readonly #history: History;
	/** The root trees of the merge base, ours, and theirs, whose `.gitattributes` pick a path's driver. */
	readonly #roots: string[];

	constructor(history: History, roots: string[]) {
		this.#history = history;
		this.#roots = roots;
	}

	/** Whether `merged` is the clean merge of the directory `path` as `base`, `ours`, and `theirs` hold it; null for none. */
	async matches(
		path: string,
		base: string | null,
		ours: string | null,
		theirs: string | null,
		merged: string | null,
	): Promise<boolean> {
		const [b, o, t, m] = await Promise.all(
			[base, ours, theirs, merged].map((oid) => (oid === null ? new Map() : this.#history.tree(oid))),
		);
		const names = new Set([...b!.keys(), ...o!.keys(), ...t!.keys(), ...m!.keys()]);
		for (const name of names) {
			const [eb, eo, et, em] = [b, o, t, m].map((tree) => tree!.get(name)) as (TreeEntry | undefined)[];
			const at = path === "" ? name : `${path}/${name}`;
			// One side's change, or the same change on both, is taken whole.
			if (same(eo, et) || same(eo, eb)) {
				if (!same(em, et)) return false;
			} else if (same(et, eb)) {
				if (!same(em, eo)) return false;
			} else if (eo?.type === "tree" && et?.type === "tree" && em?.type === "tree") {
				const inner = eb?.type === "tree" ? eb.oid : null;
				if (!(await this.matches(at, inner, eo.oid, et.oid, em.oid))) return false;
			} else if (!(await this.#file(at, eb, eo, et, em))) return false;
		}
		return true;
	}

	/** Whether `merged` is the clean line merge of a file both sides changed. */
	async #file(
		path: string,
		base: TreeEntry | undefined,
		ours: TreeEntry | undefined,
		theirs: TreeEntry | undefined,
		merged: TreeEntry | undefined,
	): Promise<boolean> {
		// A file both sides added, or one deleted and the other changed, conflicts.
		if (![base, ours, theirs, merged].every(regular)) return false;
		const [b, o, t, m] = [base!, ours!, theirs!, merged!];
		const mode = o.mode === b.mode ? t.mode : t.mode === b.mode || o.mode === t.mode ? o.mode : null;
		if (m.mode !== mode) return false;
		const driver = await this.#driver(path);
		if (driver === "other") return false;
		const [bt, ot, tt] = await Promise.all(
			[b, o, t].map(async (entry) => text(await this.#history.blob(entry.oid))),
		);
		if (bt === null || ot === null || tt === null) return false;
		const lines = merge(ot, bt, tt);
		const chunks = driver === "quest" ? resolveLists(path, lines) : lines;
		if (!chunks.every((chunk) => Array.isArray(chunk))) return false;
		return equal(ENCODER.encode(render(chunks, 7, false)), await this.#history.blob(m.oid));
	}

	/**
	 * How git merges `path`: by lines when every one of the three trees leaves it to the default or names `text`, by
	 * the `quest` driver when every one names it, and otherwise not in a way this can check. Git reads one tree's
	 * attributes, which differs between commands, so all three must agree.
	 */
	async #driver(path: string): Promise<Driver> {
		const drivers = await Promise.all(this.#roots.map((root) => this.#attribute(root, path)));
		if (drivers.every((driver) => driver === "text")) return "text";
		if (drivers.every((driver) => driver === "quest")) return "quest";
		// A clean line merge is the same under either driver, which only resolves conflicts.
		if (drivers.every((driver) => driver !== "other")) return "text";
		return "other";
	}

	/** `path`'s merge driver as the `.gitattributes` files in `root` set it, from the root's down to its own directory's. */
	async #attribute(root: string, path: string): Promise<Driver> {
		const dirs = path.split("/").slice(0, -1);
		let tree: string | null = root;
		let state: Driver = "text";
		let macros: Set<string> | undefined;
		for (let depth = 0; tree !== null && depth <= dirs.length; depth++) {
			const entries = await this.#history.tree(tree);
			const file = entries.get(".gitattributes");
			if (file !== undefined) {
				// Git reads no `.gitattributes` that is a symlink, and a directory or submodule is not one.
				if (!regular(file)) return "other";
				const source = text(await this.#history.blob(file.oid));
				if (source === null) return "other";
				// Macros are defined only at the top level.
				macros ??= depth === 0 ? mergeMacros(source) : new Set(["binary"]);
				const dir = dirs.slice(0, depth).join("/");
				const relative = dir === "" ? path : path.slice(dir.length + 1);
				const set = mergeState(source, relative, macros);
				if (set === "other") return "other";
				if (set !== null) state = set;
			} else macros ??= new Set(["binary"]);
			const next = depth < dirs.length ? entries.get(dirs[depth]!) : undefined;
			tree = next?.type === "tree" ? next.oid : null;
		}
		return state;
	}
}

/**
 * The macros a `.gitattributes` file defines that touch the `merge` attribute, directly or through another macro,
 * with git's built-in `binary`.
 */
function mergeMacros(source: string): Set<string> {
	const found = new Set(["binary"]);
	const definitions = lines(source).flatMap(([pattern, ...attributes]) =>
		pattern!.startsWith("[attr]") ? [{ name: pattern!.slice(6), attributes }] : [],
	);
	for (let grew = true; grew;) {
		grew = false;
		for (const { name, attributes } of definitions)
			if (!found.has(name) && attributes.some((each) => touches(each, found))) {
				found.add(name);
				grew = true;
			}
	}
	return found;
}

/**
 * The driver the last line of `source` that matches `path`, relative to the file's directory, and touches the
 * `merge` attribute gives it, or null when none does. A line this cannot read, such as a quoted pattern or a
 * bracket expression, is `other` when it touches the attribute at all.
 */
function mergeState(source: string, path: string, macros: Set<string>): Driver | null {
	let state: Driver | null = null;
	for (const [pattern, ...attributes] of lines(source)) {
		// Git ignores negated patterns and patterns for directories, which no file matches.
		if (pattern!.startsWith("[attr]") || pattern!.startsWith("!") || pattern!.endsWith("/")) continue;
		const touching = attributes.filter((each) => touches(each, macros));
		if (touching.length === 0) continue;
		const glob = globSource(pattern!);
		if (glob === null || touching.length > 1) return "other";
		const name = path.slice(path.lastIndexOf("/") + 1);
		const anchored = pattern!.includes("/");
		if (!new RegExp(`^${glob}$`, "s").test(anchored ? path : name)) continue;
		const [attribute] = touching as [string];
		state =
			attribute === "!merge"
				? "text"
				: attribute === "merge" || attribute === "merge=text"
					? "text"
					: attribute === "merge=quest"
						? "quest"
						: "other";
	}
	return state;
}

/** Whether a line's attribute sets, unsets, or clears `merge`, or one of `macros`. */
function touches(attribute: string, macros: Set<string>): boolean {
	const name = attribute.replace(/^[-!]/, "").replace(/=.*$/s, "");
	return name === "merge" || macros.has(name);
}

/** A `.gitattributes` file's lines, each as its whitespace-separated words, without blanks and comments. */
function lines(source: string): string[][] {
	return source
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"))
		.map((line) => line.split(/\s+/));
}

/**
 * A regular expression's source for a `.gitattributes` pattern, without its leading `/`, as git matches it with
 * `*`, `?`, and whole `**` segments; null for a pattern with quoting, escapes, or a bracket expression.
 */
function globSource(pattern: string): string | null {
	if (/["\\[]/.test(pattern)) return null;
	const segments = (pattern.startsWith("/") ? pattern.slice(1) : pattern).split("/");
	return segments
		.map((segment, index) => {
			const last = index === segments.length - 1;
			if (segment === "**") return last ? ".*" : "(?:[^/]*/)*";
			const source = segment
				.replace(/[.+^${}()|\]]/g, "\\$&")
				.replace(/\*+/g, "[^/]*")
				.replace(/\?/g, "[^/]");
			return last ? source : `${source}/`;
		})
		.join("");
}

/** Whether two entries are the same object at the same mode, or both absent. */
function same(a: TreeEntry | undefined, b: TreeEntry | undefined): boolean {
	return a === b || (a !== undefined && b !== undefined && a.oid === b.oid && a.mode === b.mode);
}

/** Whether an entry is a file git merges by content, not a symlink or a submodule. */
function regular(entry: TreeEntry | undefined): boolean {
	return entry?.type === "blob" && (entry.mode === "100644" || entry.mode === "100755");
}

// Workers and Node both have these, though the core's types name no runtime's globals.
declare const TextEncoder: new () => { encode(text: string): Uint8Array };
declare const TextDecoder: new (
	label: string,
	options: { fatal: boolean; ignoreBOM: boolean },
) => { decode(bytes: Uint8Array): string };

const ENCODER = new TextEncoder();
/** Strict, and keeping a byte order mark, so the text encodes back to the bytes read. */
const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** A blob's text, or null for one git merges as binary, with a NUL in its first 8000 bytes, or one not in UTF-8. */
function text(bytes: Uint8Array): string | null {
	if (bytes.subarray(0, 8000).includes(0)) return null;
	try {
		return DECODER.decode(bytes);
	} catch {
		return null;
	}
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
	return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
